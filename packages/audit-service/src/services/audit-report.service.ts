/**
 * Audit Report Generation Service
 * Creates HIPAA-compliant audit reports for compliance reviews and regulatory inquiries
 * Supports multiple formats (PDF, CSV, JSON) with digital signatures
 */

import { AuditLogEntry, LogCategory, LogLevel, EventType, ActionType, ActionStatus, InitiatorType, AuthorizationStatus } from '../types/audit-log';

export enum ReportType {
  DAILY_PATIENT_INTERACTION = 'daily_patient_interaction',
  WEEKLY_SECURITY_AUDIT = 'weekly_security_audit',
  MONTHLY_COMPLIANCE = 'monthly_compliance',
  QUARTERLY_SYSTEM_USAGE = 'quarterly_system_usage',
  PATIENT_HISTORY_AUDIT = 'patient_history_audit',
  SECURITY_INCIDENT = 'security_incident',
  REGULATORY_COMPLIANCE = 'regulatory_compliance',
  SYSTEM_PERFORMANCE = 'system_performance'
}

export enum ReportFormat {
  PDF = 'pdf',
  CSV = 'csv',
  JSON = 'json',
  HTML = 'html'
}

interface ReportConfig {
  type: ReportType;
  format: ReportFormat;
  dateRange: {
    start: Date;
    end: Date;
  };
  filters?: {
    categories?: LogCategory[];
    logLevels?: LogLevel[];
    patientId?: string;
    sessionId?: string;
    service?: string;
    eventTypes?: string[];
  };
  includeMetrics?: boolean;
  includeSummary?: boolean;
  redactPHI?: boolean;
  digitalSignature?: boolean;
}

interface ReportMetrics {
  totalLogs: number;
  logsByCategory: Record<LogCategory, number>;
  logsByLevel: Record<LogLevel, number>;
  successRate: number;
  averageResponseTime: number;
  uniquePatients: number;
  uniqueSessions: number;
  errorRate: number;
  complianceScore: number;
}

interface ReportSummary {
  reportId: string;
  generatedAt: Date;
  generatedBy: string;
  reportType: ReportType;
  dateRange: { start: Date; end: Date };
  totalRecords: number;
  keyFindings: string[];
  complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
  recommendations: string[];
}

interface GeneratedReport {
  id: string;
  config: ReportConfig;
  summary: ReportSummary;
  metrics?: ReportMetrics;
  data: any;
  signature?: string;
  checksum: string;
  size: number;
  generatedAt: Date;
}

export class AuditReportService {
  private reports: Map<string, GeneratedReport> = new Map();
  private reportCounter = 1;

  /**
   * Generate audit report based on configuration
   */
  async generateReport(config: ReportConfig): Promise<GeneratedReport> {
    try {
      const reportId = this.generateReportId(config.type);

      // Fetch logs based on config
      const logs = await this.fetchLogsForReport(config);

      // Generate metrics if requested
      const metrics = config.includeMetrics ? this.calculateMetrics(logs) : undefined;

      // Generate summary if requested
      const summary = config.includeSummary ? this.generateSummary(reportId, config, logs, metrics) :
        this.generateBasicSummary(reportId, config, logs);

      // Format data based on report type and format
      const formattedData = await this.formatReportData(logs, config);

      // Generate digital signature if requested
      const signature = config.digitalSignature ? this.generateDigitalSignature(formattedData) : undefined;

      // Calculate checksum for integrity
      const checksum = this.calculateChecksum(JSON.stringify(formattedData));

      const report: GeneratedReport = {
        id: reportId,
        config,
        summary,
        metrics,
        data: formattedData,
        signature,
        checksum,
        size: JSON.stringify(formattedData).length,
        generatedAt: new Date()
      };

      // Store report
      this.reports.set(reportId, report);

      return report;

    } catch (error) {
      throw new Error(`Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate standard daily patient interaction report
   */
  async generateDailyPatientReport(date: Date): Promise<GeneratedReport> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const config: ReportConfig = {
      type: ReportType.DAILY_PATIENT_INTERACTION,
      format: ReportFormat.PDF,
      dateRange: { start, end },
      filters: {
        categories: [LogCategory.PATIENT_INTERACTION]
      },
      includeMetrics: true,
      includeSummary: true,
      redactPHI: true,
      digitalSignature: true
    };

    return this.generateReport(config);
  }

  /**
   * Generate weekly security audit report
   */
  async generateWeeklySecurityReport(weekEndingDate: Date): Promise<GeneratedReport> {
    const end = new Date(weekEndingDate);
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const config: ReportConfig = {
      type: ReportType.WEEKLY_SECURITY_AUDIT,
      format: ReportFormat.PDF,
      dateRange: { start, end },
      filters: {
        categories: [LogCategory.SECURITY],
        logLevels: [LogLevel.WARN, LogLevel.ERROR, LogLevel.AUDIT]
      },
      includeMetrics: true,
      includeSummary: true,
      redactPHI: true,
      digitalSignature: true
    };

    return this.generateReport(config);
  }

  /**
   * Generate patient-specific audit trail
   */
  async generatePatientAuditTrail(patientId: string, dateRange: { start: Date; end: Date }): Promise<GeneratedReport> {
    const config: ReportConfig = {
      type: ReportType.PATIENT_HISTORY_AUDIT,
      format: ReportFormat.JSON,
      dateRange,
      filters: {
        patientId,
        categories: [LogCategory.PATIENT_INTERACTION, LogCategory.SECURITY]
      },
      includeMetrics: true,
      includeSummary: true,
      redactPHI: false, // Keep PHI for audit trail
      digitalSignature: true
    };

    return this.generateReport(config);
  }

  /**
   * Generate regulatory compliance package
   */
  async generateCompliancePackage(dateRange: { start: Date; end: Date }): Promise<GeneratedReport[]> {
    const reports: GeneratedReport[] = [];

    // Patient interaction compliance
    const patientReport = await this.generateReport({
      type: ReportType.REGULATORY_COMPLIANCE,
      format: ReportFormat.PDF,
      dateRange,
      filters: { categories: [LogCategory.PATIENT_INTERACTION] },
      includeMetrics: true,
      includeSummary: true,
      redactPHI: true,
      digitalSignature: true
    });
    reports.push(patientReport);

    // Security compliance
    const securityReport = await this.generateReport({
      type: ReportType.REGULATORY_COMPLIANCE,
      format: ReportFormat.PDF,
      dateRange,
      filters: { categories: [LogCategory.SECURITY] },
      includeMetrics: true,
      includeSummary: true,
      redactPHI: true,
      digitalSignature: true
    });
    reports.push(securityReport);

    // Compliance events
    const complianceReport = await this.generateReport({
      type: ReportType.REGULATORY_COMPLIANCE,
      format: ReportFormat.PDF,
      dateRange,
      filters: { categories: [LogCategory.COMPLIANCE] },
      includeMetrics: true,
      includeSummary: true,
      redactPHI: true,
      digitalSignature: true
    });
    reports.push(complianceReport);

    return reports;
  }

  /**
   * Retrieve generated report
   */
  getReport(reportId: string): GeneratedReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * List all generated reports
   */
  listReports(filters?: {
    type?: ReportType;
    dateRange?: { start: Date; end: Date };
    format?: ReportFormat;
  }): GeneratedReport[] {
    let reports = Array.from(this.reports.values());

    if (filters) {
      if (filters.type) {
        reports = reports.filter(r => r.config.type === filters.type);
      }

      if (filters.format) {
        reports = reports.filter(r => r.config.format === filters.format);
      }

      if (filters.dateRange) {
        reports = reports.filter(r =>
          r.generatedAt >= filters.dateRange!.start &&
          r.generatedAt <= filters.dateRange!.end
        );
      }
    }

    return reports.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  }

  /**
   * Verify report integrity
   */
  verifyReportIntegrity(reportId: string): { valid: boolean; errors: string[] } {
    const report = this.reports.get(reportId);
    if (!report) {
      return { valid: false, errors: ['Report not found'] };
    }

    const errors: string[] = [];

    // Verify checksum
    const currentChecksum = this.calculateChecksum(JSON.stringify(report.data));
    if (currentChecksum !== report.checksum) {
      errors.push('Data integrity check failed - checksum mismatch');
    }

    // Verify digital signature if present
    if (report.signature) {
      const validSignature = this.verifyDigitalSignature(report.data, report.signature);
      if (!validSignature) {
        errors.push('Digital signature verification failed');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export report in specified format
   */
  async exportReport(reportId: string, format: ReportFormat): Promise<string | Buffer> {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    switch (format) {
      case ReportFormat.JSON:
        return JSON.stringify(report, null, 2);

      case ReportFormat.CSV:
        return this.convertToCSV(report.data);

      case ReportFormat.PDF:
        return this.convertToPDF(report);

      case ReportFormat.HTML:
        return this.convertToHTML(report);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private generateReportId(type: ReportType): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${type}_${timestamp}_${this.reportCounter++}`;
  }

  private async fetchLogsForReport(config: ReportConfig): Promise<AuditLogEntry[]> {
    // Mock log fetching - in real implementation, query from storage service
    const mockLogs: AuditLogEntry[] = [];

    // Generate mock data based on config
    const daysBetween = Math.ceil(
      (config.dateRange.end.getTime() - config.dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
    );

    for (let i = 0; i < Math.min(daysBetween * 10, 1000); i++) {
      const mockLog: AuditLogEntry = {
        timestamp: new Date(
          config.dateRange.start.getTime() +
          Math.random() * (config.dateRange.end.getTime() - config.dateRange.start.getTime())
        ).toISOString(),
        log_level: this.getRandomLogLevel(),
        category: this.getRandomCategory(config.filters?.categories),
        event_type: EventType.ACCESS,
        patient_id: config.filters?.patientId || `patient_${Math.floor(Math.random() * 100)}`,
        session_id: `session_${Math.floor(Math.random() * 1000)}`,
        service: 'audit-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: Math.random() > 0.1 ? ActionStatus.SUCCESS : ActionStatus.FAILURE,
          details: {}
        },
        metadata: {
          ip_address: '192.168.1.100',
          user_agent: 'MockAgent/1.0',
          duration_ms: Math.floor(Math.random() * 5000),
          correlation_id: `corr_${Math.floor(Math.random() * 10000)}`
        },
        phi_accessed: Math.random() > 0.7,
        audit_trail: {
          initiator: InitiatorType.PATIENT,
          reason: 'PATIENT_REQUEST',
          authorization: AuthorizationStatus.VALID
        }
      };

      mockLogs.push(mockLog);
    }

    return this.applyFilters(mockLogs, config.filters);
  }

  private calculateMetrics(logs: AuditLogEntry[]): ReportMetrics {
    const successLogs = logs.filter(log => log.action.status === ActionStatus.SUCCESS);
    const responseTimes = logs
      .map(log => log.metadata?.duration_ms)
      .filter(time => time !== undefined) as number[];

    const uniquePatients = new Set(logs.map(log => log.patient_id).filter(id => id !== null)).size;
    const uniqueSessions = new Set(logs.map(log => log.session_id)).size;

    const logsByCategory = Object.values(LogCategory).reduce((acc, category) => {
      acc[category] = logs.filter(log => log.category === category).length;
      return acc;
    }, {} as Record<LogCategory, number>);

    const logsByLevel = Object.values(LogLevel).reduce((acc, level) => {
      acc[level] = logs.filter(log => log.log_level === level).length;
      return acc;
    }, {} as Record<LogLevel, number>);

    return {
      totalLogs: logs.length,
      logsByCategory,
      logsByLevel,
      successRate: logs.length > 0 ? successLogs.length / logs.length : 0,
      averageResponseTime: responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0,
      uniquePatients,
      uniqueSessions,
      errorRate: logs.length > 0 ? (logs.length - successLogs.length) / logs.length : 0,
      complianceScore: this.calculateComplianceScore(logs)
    };
  }

  private generateSummary(
    reportId: string,
    config: ReportConfig,
    logs: AuditLogEntry[],
    metrics?: ReportMetrics
  ): ReportSummary {
    const keyFindings: string[] = [];
    const recommendations: string[] = [];

    if (metrics) {
      if (metrics.errorRate > 0.05) {
        keyFindings.push(`High error rate detected: ${(metrics.errorRate * 100).toFixed(1)}%`);
        recommendations.push('Investigate system reliability issues');
      }

      if (metrics.averageResponseTime > 5000) {
        keyFindings.push(`Slow average response time: ${metrics.averageResponseTime.toFixed(0)}ms`);
        recommendations.push('Optimize system performance');
      }

      if (metrics.complianceScore < 0.95) {
        keyFindings.push(`Compliance score below target: ${(metrics.complianceScore * 100).toFixed(1)}%`);
        recommendations.push('Review and improve compliance procedures');
      }
    }

    const complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW' =
      metrics?.complianceScore && metrics.complianceScore >= 0.95 ? 'COMPLIANT' :
      metrics?.complianceScore && metrics.complianceScore < 0.8 ? 'NON_COMPLIANT' :
      'NEEDS_REVIEW';

    return {
      reportId,
      generatedAt: new Date(),
      generatedBy: 'audit-service',
      reportType: config.type,
      dateRange: config.dateRange,
      totalRecords: logs.length,
      keyFindings,
      complianceStatus,
      recommendations
    };
  }

  private generateBasicSummary(reportId: string, config: ReportConfig, logs: AuditLogEntry[]): ReportSummary {
    return {
      reportId,
      generatedAt: new Date(),
      generatedBy: 'audit-service',
      reportType: config.type,
      dateRange: config.dateRange,
      totalRecords: logs.length,
      keyFindings: [],
      complianceStatus: 'NEEDS_REVIEW',
      recommendations: []
    };
  }

  private async formatReportData(logs: AuditLogEntry[], config: ReportConfig): Promise<any> {
    let processedLogs = [...logs];

    // Redact PHI if requested
    if (config.redactPHI) {
      processedLogs = processedLogs.map(log => this.redactPHI(log));
    }

    // Format based on report type
    switch (config.type) {
      case ReportType.DAILY_PATIENT_INTERACTION:
        return this.formatPatientInteractionData(processedLogs);

      case ReportType.WEEKLY_SECURITY_AUDIT:
        return this.formatSecurityAuditData(processedLogs);

      case ReportType.PATIENT_HISTORY_AUDIT:
        return this.formatPatientHistoryData(processedLogs);

      default:
        return {
          logs: processedLogs,
          metadata: {
            totalCount: processedLogs.length,
            dateRange: config.dateRange,
            format: config.format
          }
        };
    }
  }

  private redactPHI(log: AuditLogEntry): AuditLogEntry {
    const redacted = { ...log };

    // Redact patient ID
    if (redacted.patient_id) {
      redacted.patient_id = '***REDACTED***';
    }

    // Redact IP address
    if (redacted.metadata?.ip_address) {
      redacted.metadata.ip_address = '***REDACTED***';
    }

    return redacted;
  }

  private formatPatientInteractionData(logs: AuditLogEntry[]): any {
    return {
      interactions: logs,
      summary: {
        totalInteractions: logs.length,
        successfulInteractions: logs.filter(log => log.action.status === ActionStatus.SUCCESS).length,
        failedInteractions: logs.filter(log => log.action.status === ActionStatus.FAILURE).length
      }
    };
  }

  private formatSecurityAuditData(logs: AuditLogEntry[]): any {
    return {
      securityEvents: logs,
      threatLevel: logs.filter(log => log.log_level === LogLevel.ERROR).length > 0 ? 'HIGH' : 'LOW',
      incidentCount: logs.filter(log => log.log_level === LogLevel.ERROR).length
    };
  }

  private formatPatientHistoryData(logs: AuditLogEntry[]): any {
    return {
      patientHistory: logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
      timeline: logs.map(log => ({
        timestamp: log.timestamp,
        event: log.event_type,
        status: log.action.status
      }))
    };
  }

  private calculateComplianceScore(logs: AuditLogEntry[]): number {
    // Mock compliance scoring - in real implementation, check against HIPAA requirements
    const requiredFields = ['timestamp', 'patient_id', 'action', 'audit_trail'];
    let compliantLogs = 0;

    for (const log of logs) {
      let fieldCount = 0;
      if (log.timestamp) fieldCount++;
      if (log.patient_id !== null) fieldCount++;
      if (log.action) fieldCount++;
      if (log.audit_trail) fieldCount++;

      if (fieldCount === requiredFields.length) {
        compliantLogs++;
      }
    }

    return logs.length > 0 ? compliantLogs / logs.length : 1;
  }

  private applyFilters(logs: AuditLogEntry[], filters?: ReportConfig['filters']): AuditLogEntry[] {
    if (!filters) return logs;

    let filtered = logs;

    if (filters.categories) {
      filtered = filtered.filter(log => filters.categories!.includes(log.category));
    }

    if (filters.logLevels) {
      filtered = filtered.filter(log => filters.logLevels!.includes(log.log_level));
    }

    if (filters.patientId) {
      filtered = filtered.filter(log => log.patient_id === filters.patientId);
    }

    if (filters.sessionId) {
      filtered = filtered.filter(log => log.session_id === filters.sessionId);
    }

    if (filters.service) {
      filtered = filtered.filter(log => log.service === filters.service);
    }

    if (filters.eventTypes) {
      filtered = filtered.filter(log => filters.eventTypes!.includes(log.event_type));
    }

    return filtered;
  }

  private getRandomLogLevel(): LogLevel {
    const levels = Object.values(LogLevel);
    return levels[Math.floor(Math.random() * levels.length)];
  }

  private getRandomCategory(allowedCategories?: LogCategory[]): LogCategory {
    const categories = allowedCategories || Object.values(LogCategory);
    return categories[Math.floor(Math.random() * categories.length)];
  }

  private generateDigitalSignature(data: any): string {
    // Mock digital signature - in real implementation, use cryptographic signing
    const hash = this.calculateChecksum(JSON.stringify(data));
    return `SIG_${hash.substring(0, 16)}`;
  }

  private verifyDigitalSignature(data: any, signature: string): boolean {
    // Mock signature verification
    const expectedSignature = this.generateDigitalSignature(data);
    return signature === expectedSignature;
  }

  private calculateChecksum(data: string): string {
    // Simple checksum - in real implementation, use SHA-256
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private convertToCSV(data: any): string {
    // Mock CSV conversion
    return 'timestamp,category,event_type,status\n' +
           (data.logs || []).map((log: AuditLogEntry) =>
             `${log.timestamp},${log.category},${log.event_type},${log.action.status}`
           ).join('\n');
  }

  private convertToPDF(report: GeneratedReport): Buffer {
    // Mock PDF generation - in real implementation, use library like PDFKit
    const content = `AUDIT REPORT\n\nReport ID: ${report.id}\nGenerated: ${report.generatedAt}\nType: ${report.config.type}\n\nData: ${JSON.stringify(report.data, null, 2)}`;
    return Buffer.from(content, 'utf8');
  }

  private convertToHTML(report: GeneratedReport): string {
    // Mock HTML generation
    return `
      <html>
        <head><title>Audit Report ${report.id}</title></head>
        <body>
          <h1>Audit Report</h1>
          <p><strong>Report ID:</strong> ${report.id}</p>
          <p><strong>Generated:</strong> ${report.generatedAt}</p>
          <p><strong>Type:</strong> ${report.config.type}</p>
          <pre>${JSON.stringify(report.data, null, 2)}</pre>
        </body>
      </html>
    `;
  }
}