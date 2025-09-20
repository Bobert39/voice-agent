import winston from 'winston';
import DatabaseManager from '../utils/database';
import { ConfigurationValidator, ValidationResult } from '../utils/validation';
import {
  PracticeSettings,
  AppointmentType,
  AIPersonality,
  BackupSettings,
  UpdatePolicy,
  ConfigurationAudit,
  ConfigurationApproval,
  CreateConfigurationRequest,
  UpdateConfigurationRequest,
  ConfigurationResponse,
} from '../models/configuration.models';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export class ConfigurationService {
  private db: DatabaseManager;

  constructor() {
    this.db = DatabaseManager.getInstance();
  }

  /**
   * Create new configuration
   */
  public async createConfiguration(
    request: CreateConfigurationRequest,
    userId: string,
    practiceId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ConfigurationResponse> {
    try {
      // Validate configuration data
      const validation = this.validateConfigurationData(request.type, request.data);
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          message: 'Configuration validation failed',
        };
      }

      const sanitizedData = validation.sanitizedData;

      // Check if approval is required
      if (request.requires_approval) {
        const approvalId = await this.createApprovalRequest(
          practiceId,
          request.type,
          0, // New configuration
          sanitizedData,
          userId
        );

        return {
          success: true,
          message: 'Configuration submitted for approval',
          approval_required: true,
          approval_id: approvalId,
        };
      }

      // Create configuration directly
      const configId = await this.insertConfiguration(request.type, sanitizedData, practiceId, userId);

      // Log audit trail
      await this.logConfigurationChange(
        practiceId,
        request.type,
        configId,
        'CREATE',
        null,
        sanitizedData,
        userId,
        ipAddress,
        userAgent,
        'Direct creation'
      );

      // Invalidate cache
      await this.invalidateConfigurationCache(practiceId, request.type);

      return {
        success: true,
        data: { id: configId, ...sanitizedData },
        message: 'Configuration created successfully',
      };
    } catch (error) {
      logger.error('Error creating configuration:', error);
      return {
        success: false,
        errors: ['Internal server error'],
        message: 'Failed to create configuration',
      };
    }
  }

  /**
   * Update existing configuration
   */
  public async updateConfiguration(
    type: string,
    id: number,
    request: UpdateConfigurationRequest,
    userId: string,
    practiceId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ConfigurationResponse> {
    try {
      // Get current configuration
      const currentConfig = await this.getConfigurationById(type, id, practiceId);
      if (!currentConfig) {
        return {
          success: false,
          errors: ['Configuration not found'],
          message: 'Configuration does not exist',
        };
      }

      // Validate update data
      const mergedData = { ...currentConfig, ...request.data };
      const validation = this.validateConfigurationData(type, mergedData);
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          message: 'Configuration validation failed',
        };
      }

      const sanitizedData = validation.sanitizedData;

      // Check if approval is required
      if (request.requires_approval) {
        const approvalId = await this.createApprovalRequest(
          practiceId,
          type,
          id,
          request.data,
          userId
        );

        return {
          success: true,
          message: 'Configuration update submitted for approval',
          approval_required: true,
          approval_id: approvalId,
        };
      }

      // Update configuration directly
      await this.updateConfigurationById(type, id, sanitizedData, userId);

      // Log audit trail
      await this.logConfigurationChange(
        practiceId,
        type,
        id,
        'UPDATE',
        currentConfig,
        sanitizedData,
        userId,
        ipAddress,
        userAgent,
        request.change_reason
      );

      // Invalidate cache
      await this.invalidateConfigurationCache(practiceId, type);

      return {
        success: true,
        data: { id, ...sanitizedData },
        message: 'Configuration updated successfully',
      };
    } catch (error) {
      logger.error('Error updating configuration:', error);
      return {
        success: false,
        errors: ['Internal server error'],
        message: 'Failed to update configuration',
      };
    }
  }

  /**
   * Get configuration by type and practice
   */
  public async getConfigurations(
    type: string,
    practiceId: string,
    includeInactive: boolean = false
  ): Promise<ConfigurationResponse> {
    try {
      // Check cache first
      const cacheKey = `config:${practiceId}:${type}:${includeInactive}`;
      const cached = await this.db.getCachedConfiguration(cacheKey);
      if (cached) {
        return {
          success: true,
          data: cached,
          message: 'Configurations retrieved from cache',
        };
      }

      // Get from database
      const configurations = await this.getConfigurationsByType(type, practiceId, includeInactive);

      // Cache the result
      await this.db.cacheConfiguration(cacheKey, configurations, 3600);

      return {
        success: true,
        data: configurations,
        message: 'Configurations retrieved successfully',
      };
    } catch (error) {
      logger.error('Error getting configurations:', error);
      return {
        success: false,
        errors: ['Internal server error'],
        message: 'Failed to retrieve configurations',
      };
    }
  }

  /**
   * Delete configuration
   */
  public async deleteConfiguration(
    type: string,
    id: number,
    userId: string,
    practiceId: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ConfigurationResponse> {
    try {
      // Get current configuration for audit
      const currentConfig = await this.getConfigurationById(type, id, practiceId);
      if (!currentConfig) {
        return {
          success: false,
          errors: ['Configuration not found'],
          message: 'Configuration does not exist',
        };
      }

      // Soft delete (mark as inactive)
      await this.markConfigurationInactive(type, id, userId);

      // Log audit trail
      await this.logConfigurationChange(
        practiceId,
        type,
        id,
        'DELETE',
        currentConfig,
        null,
        userId,
        ipAddress,
        userAgent,
        reason
      );

      // Invalidate cache
      await this.invalidateConfigurationCache(practiceId, type);

      return {
        success: true,
        message: 'Configuration deleted successfully',
      };
    } catch (error) {
      logger.error('Error deleting configuration:', error);
      return {
        success: false,
        errors: ['Internal server error'],
        message: 'Failed to delete configuration',
      };
    }
  }

  /**
   * Approve configuration change
   */
  public async approveConfigurationChange(
    approvalId: number,
    userId: string,
    comments?: string
  ): Promise<ConfigurationResponse> {
    try {
      // Get approval request
      const approval = await this.getApprovalRequest(approvalId);
      if (!approval || approval.approval_status !== 'pending') {
        return {
          success: false,
          errors: ['Approval request not found or already processed'],
          message: 'Invalid approval request',
        };
      }

      // Apply the configuration change
      let configId: number;
      if (approval.configuration_id === 0) {
        // New configuration
        configId = await this.insertConfiguration(
          approval.configuration_table,
          approval.requested_changes,
          approval.practice_id,
          approval.requested_by
        );
      } else {
        // Update existing configuration
        const currentConfig = await this.getConfigurationById(
          approval.configuration_table,
          approval.configuration_id,
          approval.practice_id
        );
        const mergedData = { ...currentConfig, ...approval.requested_changes };
        await this.updateConfigurationById(
          approval.configuration_table,
          approval.configuration_id,
          mergedData,
          approval.requested_by
        );
        configId = approval.configuration_id;
      }

      // Update approval status
      await this.updateApprovalStatus(approvalId, 'approved', userId, comments);

      // Log audit trail
      await this.logConfigurationChange(
        approval.practice_id,
        approval.configuration_table,
        configId,
        'APPROVE',
        null,
        approval.requested_changes,
        userId,
        undefined,
        undefined,
        `Approved by ${userId}: ${comments || 'No comments'}`
      );

      // Invalidate cache
      await this.invalidateConfigurationCache(approval.practice_id, approval.configuration_table);

      return {
        success: true,
        data: { id: configId },
        message: 'Configuration change approved and applied',
      };
    } catch (error) {
      logger.error('Error approving configuration change:', error);
      return {
        success: false,
        errors: ['Internal server error'],
        message: 'Failed to approve configuration change',
      };
    }
  }

  /**
   * Reject configuration change
   */
  public async rejectConfigurationChange(
    approvalId: number,
    userId: string,
    comments: string
  ): Promise<ConfigurationResponse> {
    try {
      // Get approval request
      const approval = await this.getApprovalRequest(approvalId);
      if (!approval || approval.approval_status !== 'pending') {
        return {
          success: false,
          errors: ['Approval request not found or already processed'],
          message: 'Invalid approval request',
        };
      }

      // Update approval status
      await this.updateApprovalStatus(approvalId, 'rejected', userId, comments);

      // Log audit trail
      await this.logConfigurationChange(
        approval.practice_id,
        approval.configuration_table,
        approval.configuration_id,
        'REJECT',
        null,
        approval.requested_changes,
        userId,
        undefined,
        undefined,
        `Rejected by ${userId}: ${comments}`
      );

      return {
        success: true,
        message: 'Configuration change rejected',
      };
    } catch (error) {
      logger.error('Error rejecting configuration change:', error);
      return {
        success: false,
        errors: ['Internal server error'],
        message: 'Failed to reject configuration change',
      };
    }
  }

  /**
   * Get audit trail for configuration changes
   */
  public async getConfigurationAudit(
    practiceId: string,
    tableName?: string,
    recordId?: number,
    limit: number = 100
  ): Promise<ConfigurationResponse> {
    try {
      const auditTrail = await this.getAuditTrail(practiceId, tableName, recordId, limit);

      return {
        success: true,
        data: auditTrail,
        message: 'Audit trail retrieved successfully',
      };
    } catch (error) {
      logger.error('Error getting audit trail:', error);
      return {
        success: false,
        errors: ['Internal server error'],
        message: 'Failed to retrieve audit trail',
      };
    }
  }

  // Private helper methods

  private validateConfigurationData(type: string, data: any): ValidationResult {
    switch (type) {
      case 'practice_settings':
        return ConfigurationValidator.validatePracticeSettings(data);
      case 'appointment_type':
        return ConfigurationValidator.validateAppointmentType(data);
      case 'ai_personality':
        return ConfigurationValidator.validateAIPersonality(data);
      case 'backup_settings':
        return ConfigurationValidator.validateBackupSettings(data);
      case 'update_policy':
        return ConfigurationValidator.validateUpdatePolicy(data);
      default:
        return {
          isValid: false,
          errors: [`Unknown configuration type: ${type}`],
          warnings: [],
        };
    }
  }

  private async insertConfiguration(type: string, data: any, practiceId: string, userId: string): Promise<number> {
    const tableName = this.getTableName(type);
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(', ');
    const values = Object.values(data);

    const query = `
      INSERT INTO ${tableName} (${columns}, practice_id, created_by, updated_by)
      VALUES (${placeholders}, $${values.length + 1}, $${values.length + 2}, $${values.length + 3})
      RETURNING id
    `;

    const result = await this.db.executeQuery(query, [...values, practiceId, userId, userId]);
    return result.rows[0].id;
  }

  private async updateConfigurationById(type: string, id: number, data: any, userId: string): Promise<void> {
    const tableName = this.getTableName(type);
    const setClause = Object.keys(data)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ');
    const values = Object.values(data);

    const query = `
      UPDATE ${tableName}
      SET ${setClause}, updated_by = $${values.length + 1}, version = version + 1
      WHERE id = $${values.length + 2}
    `;

    await this.db.executeQuery(query, [...values, userId, id]);
  }

  private async getConfigurationById(type: string, id: number, practiceId: string): Promise<any | null> {
    const tableName = this.getTableName(type);
    const query = `
      SELECT * FROM ${tableName}
      WHERE id = $1 AND practice_id = $2 AND is_active = true
    `;

    const result = await this.db.executeQuery(query, [id, practiceId]);
    return result.rows[0] || null;
  }

  private async getConfigurationsByType(type: string, practiceId: string, includeInactive: boolean): Promise<any[]> {
    const tableName = this.getTableName(type);
    const activeClause = includeInactive ? '' : 'AND is_active = true';
    const query = `
      SELECT * FROM ${tableName}
      WHERE practice_id = $1 ${activeClause}
      ORDER BY created_at DESC
    `;

    const result = await this.db.executeQuery(query, [practiceId]);
    return result.rows;
  }

  private async markConfigurationInactive(type: string, id: number, userId: string): Promise<void> {
    const tableName = this.getTableName(type);
    const query = `
      UPDATE ${tableName}
      SET is_active = false, updated_by = $1
      WHERE id = $2
    `;

    await this.db.executeQuery(query, [userId, id]);
  }

  private async createApprovalRequest(
    practiceId: string,
    configType: string,
    configId: number,
    requestedChanges: any,
    userId: string
  ): Promise<number> {
    const query = `
      INSERT INTO config.configuration_approvals
      (practice_id, configuration_table, configuration_id, requested_changes, requested_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const result = await this.db.executeQuery(query, [
      practiceId,
      this.getTableName(configType),
      configId,
      JSON.stringify(requestedChanges),
      userId,
    ]);

    return result.rows[0].id;
  }

  private async getApprovalRequest(approvalId: number): Promise<any | null> {
    const query = `
      SELECT * FROM config.configuration_approvals
      WHERE id = $1
    `;

    const result = await this.db.executeQuery(query, [approvalId]);
    if (result.rows[0]) {
      const approval = result.rows[0];
      approval.requested_changes = JSON.parse(approval.requested_changes);
      return approval;
    }
    return null;
  }

  private async updateApprovalStatus(
    approvalId: number,
    status: string,
    userId: string,
    comments?: string
  ): Promise<void> {
    const query = `
      UPDATE config.configuration_approvals
      SET approval_status = $1, reviewed_by = $2, reviewed_at = NOW(), review_comments = $3
      WHERE id = $4
    `;

    await this.db.executeQuery(query, [status, userId, comments, approvalId]);
  }

  private async logConfigurationChange(
    practiceId: string,
    tableName: string,
    recordId: number,
    operation: string,
    oldValues: any,
    newValues: any,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    const query = `
      INSERT INTO config.configuration_audit
      (practice_id, table_name, record_id, operation, old_values, new_values, change_reason, changed_by, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await this.db.executeQuery(query, [
      practiceId,
      this.getTableName(tableName),
      recordId,
      operation,
      oldValues ? JSON.stringify(ConfigurationValidator.sanitizeForLogging(oldValues)) : null,
      newValues ? JSON.stringify(ConfigurationValidator.sanitizeForLogging(newValues)) : null,
      reason,
      userId,
      ipAddress,
      userAgent,
    ]);
  }

  private async getAuditTrail(
    practiceId: string,
    tableName?: string,
    recordId?: number,
    limit: number = 100
  ): Promise<any[]> {
    let query = `
      SELECT * FROM config.configuration_audit
      WHERE practice_id = $1
    `;
    const params: any[] = [practiceId];

    if (tableName) {
      query += ` AND table_name = $${params.length + 1}`;
      params.push(this.getTableName(tableName));
    }

    if (recordId) {
      query += ` AND record_id = $${params.length + 1}`;
      params.push(recordId);
    }

    query += ` ORDER BY changed_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.db.executeQuery(query, params);
    return result.rows.map((row: any) => ({
      ...row,
      old_values: row.old_values ? JSON.parse(row.old_values) : null,
      new_values: row.new_values ? JSON.parse(row.new_values) : null,
    }));
  }

  private async invalidateConfigurationCache(practiceId: string, type: string): Promise<void> {
    await this.db.invalidateCache(`config:${practiceId}:${type}:*`);
  }

  private getTableName(type: string): string {
    const tableMap: { [key: string]: string } = {
      'practice_settings': 'config.practice_settings',
      'appointment_type': 'config.appointment_types',
      'ai_personality': 'config.ai_personality',
      'backup_settings': 'config.backup_settings',
      'update_policy': 'config.update_policies',
    };

    return tableMap[type] || type;
  }
}

export default ConfigurationService;