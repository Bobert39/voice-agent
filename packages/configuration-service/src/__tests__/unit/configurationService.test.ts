import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import ConfigurationService from '../../services/configurationService';
import DatabaseManager from '../../utils/database';

// Mock the DatabaseManager
jest.mock('../../utils/database');

const mockDatabaseManager = {
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  getCachedConfiguration: jest.fn(),
  cacheConfiguration: jest.fn(),
  invalidateCache: jest.fn(),
  getInstance: jest.fn(() => mockDatabaseManager),
};

(DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDatabaseManager);

describe('ConfigurationService', () => {
  let configService: ConfigurationService;

  beforeEach(() => {
    configService = new ConfigurationService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createConfiguration', () => {
    it('should create configuration successfully', async () => {
      const request = {
        type: 'practice_settings',
        data: {
          practice_id: 'practice-123',
          setting_key: 'practice_hours',
          setting_value: {
            monday: { open: '09:00', close: '17:00', is_closed: false },
          },
          created_by: 'user-123',
          updated_by: 'user-123',
        },
        requires_approval: false,
      };

      mockDatabaseManager.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      const result = await configService.createConfiguration(
        request,
        'user-123',
        'practice-123',
        '127.0.0.1',
        'test-agent'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(1);
      expect(mockDatabaseManager.executeQuery).toHaveBeenCalledTimes(2); // Insert + audit log
      expect(mockDatabaseManager.invalidateCache).toHaveBeenCalled();
    });

    it('should create approval request when approval required', async () => {
      const request = {
        type: 'practice_settings',
        data: {
          practice_id: 'practice-123',
          setting_key: 'test_setting',
          setting_value: { key: 'value' },
          created_by: 'user-123',
          updated_by: 'user-123',
        },
        requires_approval: true,
      };

      mockDatabaseManager.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 100 }],
      });

      const result = await configService.createConfiguration(
        request,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(true);
      expect(result.approval_required).toBe(true);
      expect(result.approval_id).toBe(100);
      expect(mockDatabaseManager.executeQuery).toHaveBeenCalledTimes(1); // Only approval request
    });

    it('should handle validation errors', async () => {
      const request = {
        type: 'practice_settings',
        data: {
          practice_id: '', // Invalid - empty practice ID
          setting_key: 'test_setting',
          setting_value: {},
        },
        requires_approval: false,
      };

      const result = await configService.createConfiguration(
        request,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(mockDatabaseManager.executeQuery).not.toHaveBeenCalled();
    });

    it('should handle unknown configuration type', async () => {
      const request = {
        type: 'unknown_type',
        data: {},
        requires_approval: false,
      };

      const result = await configService.createConfiguration(
        request,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Unknown configuration type: unknown_type');
    });

    it('should handle database errors', async () => {
      const request = {
        type: 'practice_settings',
        data: {
          practice_id: 'practice-123',
          setting_key: 'test_setting',
          setting_value: { key: 'value' },
          created_by: 'user-123',
          updated_by: 'user-123',
        },
        requires_approval: false,
      };

      mockDatabaseManager.executeQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await configService.createConfiguration(
        request,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Internal server error');
    });
  });

  describe('getConfigurations', () => {
    it('should retrieve configurations from cache', async () => {
      const cachedData = [
        { id: 1, setting_key: 'test1' },
        { id: 2, setting_key: 'test2' },
      ];

      mockDatabaseManager.getCachedConfiguration.mockResolvedValueOnce(cachedData);

      const result = await configService.getConfigurations(
        'practice_settings',
        'practice-123'
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(cachedData);
      expect(result.message).toContain('cache');
      expect(mockDatabaseManager.executeQuery).not.toHaveBeenCalled();
    });

    it('should retrieve configurations from database when not cached', async () => {
      const dbData = [
        { id: 1, setting_key: 'test1' },
        { id: 2, setting_key: 'test2' },
      ];

      mockDatabaseManager.getCachedConfiguration.mockResolvedValueOnce(null);
      mockDatabaseManager.executeQuery.mockResolvedValueOnce({
        rows: dbData,
      });

      const result = await configService.getConfigurations(
        'practice_settings',
        'practice-123'
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(dbData);
      expect(mockDatabaseManager.executeQuery).toHaveBeenCalled();
      expect(mockDatabaseManager.cacheConfiguration).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockDatabaseManager.getCachedConfiguration.mockResolvedValueOnce(null);
      mockDatabaseManager.executeQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await configService.getConfigurations(
        'practice_settings',
        'practice-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Internal server error');
    });
  });

  describe('updateConfiguration', () => {
    it('should update configuration successfully', async () => {
      const request = {
        data: { setting_value: { updated: 'value' } },
        change_reason: 'Test update',
        requires_approval: false,
      };

      const currentConfig = {
        id: 1,
        practice_id: 'practice-123',
        setting_key: 'test_setting',
        setting_value: { old: 'value' },
      };

      // Mock getting current config
      mockDatabaseManager.executeQuery
        .mockResolvedValueOnce({ rows: [currentConfig] })
        .mockResolvedValueOnce({ rows: [] }) // Update query
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await configService.updateConfiguration(
        'practice_settings',
        1,
        request,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(true);
      expect(mockDatabaseManager.executeQuery).toHaveBeenCalledTimes(3);
      expect(mockDatabaseManager.invalidateCache).toHaveBeenCalled();
    });

    it('should handle configuration not found', async () => {
      const request = {
        data: { setting_value: { updated: 'value' } },
        requires_approval: false,
      };

      mockDatabaseManager.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await configService.updateConfiguration(
        'practice_settings',
        999,
        request,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Configuration not found');
    });

    it('should create approval request when approval required', async () => {
      const request = {
        data: { setting_value: { updated: 'value' } },
        requires_approval: true,
      };

      const currentConfig = {
        id: 1,
        practice_id: 'practice-123',
        setting_key: 'test_setting',
        setting_value: { old: 'value' },
      };

      mockDatabaseManager.executeQuery
        .mockResolvedValueOnce({ rows: [currentConfig] })
        .mockResolvedValueOnce({ rows: [{ id: 200 }] }); // Approval request

      const result = await configService.updateConfiguration(
        'practice_settings',
        1,
        request,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(true);
      expect(result.approval_required).toBe(true);
      expect(result.approval_id).toBe(200);
    });
  });

  describe('deleteConfiguration', () => {
    it('should delete configuration successfully', async () => {
      const currentConfig = {
        id: 1,
        practice_id: 'practice-123',
        setting_key: 'test_setting',
      };

      mockDatabaseManager.executeQuery
        .mockResolvedValueOnce({ rows: [currentConfig] })
        .mockResolvedValueOnce({ rows: [] }) // Soft delete
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await configService.deleteConfiguration(
        'practice_settings',
        1,
        'user-123',
        'practice-123',
        'Test deletion'
      );

      expect(result.success).toBe(true);
      expect(mockDatabaseManager.executeQuery).toHaveBeenCalledTimes(3);
      expect(mockDatabaseManager.invalidateCache).toHaveBeenCalled();
    });

    it('should handle configuration not found', async () => {
      mockDatabaseManager.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await configService.deleteConfiguration(
        'practice_settings',
        999,
        'user-123',
        'practice-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Configuration not found');
    });
  });

  describe('approveConfigurationChange', () => {
    it('should approve new configuration successfully', async () => {
      const approvalRequest = {
        id: 100,
        practice_id: 'practice-123',
        configuration_table: 'config.practice_settings',
        configuration_id: 0, // New configuration
        requested_changes: { setting_key: 'new_setting', setting_value: { new: 'value' } },
        approval_status: 'pending',
        requested_by: 'user-123',
      };

      mockDatabaseManager.executeQuery
        .mockResolvedValueOnce({ rows: [approvalRequest] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // Insert new config
        .mockResolvedValueOnce({ rows: [] }) // Update approval status
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await configService.approveConfigurationChange(
        100,
        'admin-123',
        'Approved for production'
      );

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(10);
      expect(mockDatabaseManager.executeQuery).toHaveBeenCalledTimes(4);
    });

    it('should approve configuration update successfully', async () => {
      const approvalRequest = {
        id: 100,
        practice_id: 'practice-123',
        configuration_table: 'config.practice_settings',
        configuration_id: 5, // Existing configuration
        requested_changes: { setting_value: { updated: 'value' } },
        approval_status: 'pending',
        requested_by: 'user-123',
      };

      const currentConfig = {
        id: 5,
        setting_key: 'test_setting',
        setting_value: { old: 'value' },
      };

      mockDatabaseManager.executeQuery
        .mockResolvedValueOnce({ rows: [approvalRequest] })
        .mockResolvedValueOnce({ rows: [currentConfig] })
        .mockResolvedValueOnce({ rows: [] }) // Update config
        .mockResolvedValueOnce({ rows: [] }) // Update approval status
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await configService.approveConfigurationChange(
        100,
        'admin-123'
      );

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(5);
    });

    it('should handle approval not found', async () => {
      mockDatabaseManager.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await configService.approveConfigurationChange(
        999,
        'admin-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Approval request not found');
    });

    it('should handle already processed approval', async () => {
      const processedApproval = {
        id: 100,
        approval_status: 'approved', // Already processed
      };

      mockDatabaseManager.executeQuery.mockResolvedValueOnce({ rows: [processedApproval] });

      const result = await configService.approveConfigurationChange(
        100,
        'admin-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('already processed');
    });
  });

  describe('rejectConfigurationChange', () => {
    it('should reject configuration change successfully', async () => {
      const approvalRequest = {
        id: 100,
        practice_id: 'practice-123',
        configuration_table: 'config.practice_settings',
        configuration_id: 5,
        requested_changes: { setting_value: { updated: 'value' } },
        approval_status: 'pending',
      };

      mockDatabaseManager.executeQuery
        .mockResolvedValueOnce({ rows: [approvalRequest] })
        .mockResolvedValueOnce({ rows: [] }) // Update approval status
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await configService.rejectConfigurationChange(
        100,
        'admin-123',
        'Does not meet security requirements'
      );

      expect(result.success).toBe(true);
      expect(mockDatabaseManager.executeQuery).toHaveBeenCalledTimes(3);
    });

    it('should handle approval not found', async () => {
      mockDatabaseManager.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await configService.rejectConfigurationChange(
        999,
        'admin-123',
        'Rejection reason'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Approval request not found');
    });
  });

  describe('getConfigurationAudit', () => {
    it('should retrieve audit trail successfully', async () => {
      const auditData = [
        {
          id: 1,
          operation: 'CREATE',
          changed_by: 'user-123',
          changed_at: new Date(),
          old_values: null,
          new_values: '{"key": "value"}',
        },
        {
          id: 2,
          operation: 'UPDATE',
          changed_by: 'user-456',
          changed_at: new Date(),
          old_values: '{"key": "old_value"}',
          new_values: '{"key": "new_value"}',
        },
      ];

      mockDatabaseManager.executeQuery.mockResolvedValueOnce({
        rows: auditData,
      });

      const result = await configService.getConfigurationAudit(
        'practice-123',
        'practice_settings',
        1,
        50
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].new_values).toEqual({ key: 'value' });
      expect(result.data![1].old_values).toEqual({ key: 'old_value' });
    });

    it('should handle database errors', async () => {
      mockDatabaseManager.executeQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await configService.getConfigurationAudit('practice-123');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Internal server error');
    });
  });
});