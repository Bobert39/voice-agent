/**
 * Storage Architecture Service
 * Handles hot/warm/cold storage tiers for audit logs with S3 lifecycle management
 * Implements HIPAA-compliant retention policies and data migration
 */

import { AuditLogEntry, LogCategory, LogLevel, EventType, ActionType, ActionStatus, InitiatorType, AuthorizationStatus } from '../types/audit-log';

export enum StorageTier {
  HOT = 'hot',      // Recent 7-30 days, fast access
  WARM = 'warm',    // 30-180 days, moderate access
  COLD = 'cold',    // 180+ days, archival access
}

interface StorageConfig {
  hotStorageDays: Record<LogCategory, number>;
  warmStorageDays: Record<LogCategory, number>;
  totalRetentionDays: Record<LogCategory, number>;
  s3Buckets: {
    hot: string;
    warm: string;
    cold: string;
  };
  encryptionKeyId: string;
  compressionEnabled: boolean;
}

interface StorageMetrics {
  totalSize: Record<StorageTier, number>;
  recordCount: Record<StorageTier, number>;
  lastMigrationAt: Date | null;
  pendingMigrations: number;
  migrationErrors: number;
}

interface DataLocation {
  tier: StorageTier;
  bucket: string;
  key: string;
  size: number;
  createdAt: Date;
  lastAccessedAt: Date;
}

interface RetentionPolicy {
  category: LogCategory;
  hotDays: number;
  warmDays: number;
  totalDays: number;
  description: string;
}

export class StorageArchitectureService {
  private config: StorageConfig;
  private metrics: StorageMetrics;

  // HIPAA-compliant retention policies
  private readonly retentionPolicies: RetentionPolicy[] = [
    {
      category: LogCategory.PATIENT_INTERACTION,
      hotDays: 30,
      warmDays: 150,
      totalDays: 2555, // 7 years
      description: 'Patient interaction logs - HIPAA 7-year retention'
    },
    {
      category: LogCategory.SYSTEM,
      hotDays: 7,
      warmDays: 23,
      totalDays: 365, // 1 year
      description: 'System activity logs - operational retention'
    },
    {
      category: LogCategory.SECURITY,
      hotDays: 30,
      warmDays: 150,
      totalDays: 2555, // 7 years
      description: 'Security audit logs - HIPAA 7-year retention'
    },
    {
      category: LogCategory.COMPLIANCE,
      hotDays: 30,
      warmDays: 150,
      totalDays: 3650, // 10 years
      description: 'Compliance event logs - extended retention'
    }
  ];

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      hotStorageDays: {
        [LogCategory.PATIENT_INTERACTION]: 30,
        [LogCategory.SYSTEM]: 7,
        [LogCategory.SECURITY]: 30,
        [LogCategory.COMPLIANCE]: 30
      },
      warmStorageDays: {
        [LogCategory.PATIENT_INTERACTION]: 150,
        [LogCategory.SYSTEM]: 23,
        [LogCategory.SECURITY]: 150,
        [LogCategory.COMPLIANCE]: 150
      },
      totalRetentionDays: {
        [LogCategory.PATIENT_INTERACTION]: 2555, // 7 years
        [LogCategory.SYSTEM]: 365, // 1 year
        [LogCategory.SECURITY]: 2555, // 7 years
        [LogCategory.COMPLIANCE]: 3650 // 10 years
      },
      s3Buckets: {
        hot: 'capitol-eye-care-audit-hot',
        warm: 'capitol-eye-care-audit-warm',
        cold: 'capitol-eye-care-audit-cold'
      },
      encryptionKeyId: process.env.AUDIT_LOGS_KMS_KEY_ID || 'alias/audit-logs',
      compressionEnabled: true,
      ...config
    };

    this.metrics = {
      totalSize: {
        [StorageTier.HOT]: 0,
        [StorageTier.WARM]: 0,
        [StorageTier.COLD]: 0
      },
      recordCount: {
        [StorageTier.HOT]: 0,
        [StorageTier.WARM]: 0,
        [StorageTier.COLD]: 0
      },
      lastMigrationAt: null,
      pendingMigrations: 0,
      migrationErrors: 0
    };
  }

  /**
   * Store audit log in appropriate tier based on age and category
   */
  async storeLog(log: AuditLogEntry): Promise<DataLocation> {
    const tier = this.determineTier(log);
    const key = this.generateStorageKey(log, tier);
    const bucket = this.config.s3Buckets[tier];

    try {
      // Prepare log data for storage
      const storageData = await this.prepareForStorage(log);

      // Mock S3 storage operation (in real implementation, use AWS SDK)
      const location: DataLocation = {
        tier,
        bucket,
        key,
        size: JSON.stringify(storageData).length,
        createdAt: new Date(),
        lastAccessedAt: new Date()
      };

      // Update metrics
      this.updateStorageMetrics(location);

      return location;

    } catch (error) {
      throw new Error(`Failed to store log: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve audit log from storage
   */
  async retrieveLog(location: DataLocation): Promise<AuditLogEntry> {
    try {
      // Mock S3 retrieval (in real implementation, use AWS SDK)
      // For cold storage, this might involve Glacier retrieval process

      if (location.tier === StorageTier.COLD) {
        // Simulate Glacier retrieval delay
        await this.initiateGlacierRetrieval(location);
      }

      // Update access metrics
      location.lastAccessedAt = new Date();

      // Mock retrieved data - in real implementation, decrypt and decompress
      const mockRetrievedLog: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.INFO,
        category: LogCategory.SYSTEM,
        event_type: EventType.ACCESS,
        patient_id: null,
        session_id: 'retrieval-session',
        service: 'audit-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.SUCCESS,
          details: {
            storage_tier: location.tier,
            retrieval_time: new Date().toISOString()
          }
        },
        metadata: {
          ip_address: '127.0.0.1',
          user_agent: 'StorageService/1.0',
          duration_ms: 100,
          correlation_id: 'storage-correlation'
        },
        phi_accessed: false,
        audit_trail: {
          initiator: InitiatorType.SYSTEM,
          reason: 'DATA_RETRIEVAL',
          authorization: AuthorizationStatus.VALID
        }
      };

      return mockRetrievedLog;

    } catch (error) {
      throw new Error(`Failed to retrieve log: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate logs between storage tiers based on age
   */
  async migrateByAge(): Promise<{ migrated: number; errors: number }> {
    let migrated = 0;
    let errors = 0;

    try {
      this.metrics.pendingMigrations++;

      // In real implementation, query each tier for logs that need migration
      // Mock migration process
      const mockMigrations = [
        { category: LogCategory.PATIENT_INTERACTION, count: 150 },
        { category: LogCategory.SYSTEM, count: 75 },
        { category: LogCategory.SECURITY, count: 25 },
        { category: LogCategory.COMPLIANCE, count: 10 }
      ];

      for (const migration of mockMigrations) {
        try {
          // Migrate from hot to warm
          const hotToWarmCount = Math.floor(migration.count * 0.6);
          await this.migrateBetweenTiers(
            StorageTier.HOT,
            StorageTier.WARM,
            migration.category,
            hotToWarmCount
          );

          // Migrate from warm to cold
          const warmToColdCount = Math.floor(migration.count * 0.3);
          await this.migrateBetweenTiers(
            StorageTier.WARM,
            StorageTier.COLD,
            migration.category,
            warmToColdCount
          );

          migrated += hotToWarmCount + warmToColdCount;

        } catch (error) {
          errors++;
          this.metrics.migrationErrors++;
        }
      }

      this.metrics.lastMigrationAt = new Date();
      this.metrics.pendingMigrations--;

      return { migrated, errors };

    } catch (error) {
      this.metrics.migrationErrors++;
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enforce retention policies and purge expired data
   */
  async enforceRetentionPolicies(): Promise<{ purged: number; errors: number }> {
    let purged = 0;
    let errors = 0;

    try {
      for (const policy of this.retentionPolicies) {
        try {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - policy.totalDays);

          // Mock purge operation - in real implementation, delete from S3
          const purgeCount = await this.purgeExpiredLogs(policy.category, cutoffDate);
          purged += purgeCount;

        } catch (error) {
          errors++;
        }
      }

      return { purged, errors };

    } catch (error) {
      throw new Error(`Retention enforcement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get storage metrics and health status
   */
  getMetrics(): StorageMetrics & {
    retentionPolicies: RetentionPolicy[];
    storageEfficiency: number;
  } {
    const totalRecords = Object.values(this.metrics.recordCount).reduce((a, b) => a + b, 0);
    const totalSize = Object.values(this.metrics.totalSize).reduce((a, b) => a + b, 0);

    const storageEfficiency = totalRecords > 0 ? totalSize / totalRecords : 0;

    return {
      ...this.metrics,
      retentionPolicies: this.retentionPolicies,
      storageEfficiency
    };
  }

  /**
   * Generate lifecycle configuration for S3 buckets
   */
  generateS3LifecycleConfig(): Record<string, any> {
    return {
      hot: {
        Rules: [
          {
            Id: 'HotToWarmTransition',
            Status: 'Enabled',
            Transitions: [
              {
                Days: 30,
                StorageClass: 'STANDARD_IA'
              }
            ]
          }
        ]
      },
      warm: {
        Rules: [
          {
            Id: 'WarmToColdTransition',
            Status: 'Enabled',
            Transitions: [
              {
                Days: 150,
                StorageClass: 'GLACIER'
              }
            ]
          }
        ]
      },
      cold: {
        Rules: [
          {
            Id: 'ColdArchival',
            Status: 'Enabled',
            Transitions: [
              {
                Days: 365,
                StorageClass: 'DEEP_ARCHIVE'
              }
            ]
          }
        ]
      }
    };
  }

  private determineTier(log: AuditLogEntry): StorageTier {
    const logDate = new Date(log.timestamp);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));

    const hotDays = this.config.hotStorageDays[log.category];
    const warmDays = this.config.warmStorageDays[log.category];

    if (daysDiff <= hotDays) {
      return StorageTier.HOT;
    } else if (daysDiff <= hotDays + warmDays) {
      return StorageTier.WARM;
    } else {
      return StorageTier.COLD;
    }
  }

  private generateStorageKey(log: AuditLogEntry, tier: StorageTier): string {
    const date = new Date(log.timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');

    return `${tier}/${log.category}/${year}/${month}/${day}/${hour}/${log.session_id}_${Date.now()}.json`;
  }

  private async prepareForStorage(log: AuditLogEntry): Promise<any> {
    let data = { ...log };

    // Compress if enabled
    if (this.config.compressionEnabled) {
      // Mock compression (in real implementation, use gzip)
      data = { ...data, compressed: true };
    }

    // Add storage metadata
    data = {
      ...data,
      storage_metadata: {
        encrypted: true,
        compression: this.config.compressionEnabled,
        key_id: this.config.encryptionKeyId,
        stored_at: new Date().toISOString()
      }
    };

    return data;
  }

  private async migrateBetweenTiers(
    fromTier: StorageTier,
    toTier: StorageTier,
    category: LogCategory,
    count: number
  ): Promise<void> {
    // Mock migration process
    // In real implementation:
    // 1. List objects in source tier older than threshold
    // 2. Copy to destination tier with appropriate storage class
    // 3. Verify copy integrity
    // 4. Delete from source tier

    // Update metrics
    this.metrics.recordCount[fromTier] -= count;
    this.metrics.recordCount[toTier] += count;

    // Simulate migration size (assuming average log size)
    const avgLogSize = 2048; // 2KB per log
    const migrationSize = count * avgLogSize;
    this.metrics.totalSize[fromTier] -= migrationSize;
    this.metrics.totalSize[toTier] += migrationSize;
  }

  private async initiateGlacierRetrieval(location: DataLocation): Promise<void> {
    // Mock Glacier retrieval initiation
    // In real implementation, use AWS SDK to restore from Glacier
    // This can take 1-5 minutes for expedited retrieval
    await new Promise(resolve => setTimeout(resolve, 100)); // Mock delay
  }

  private async purgeExpiredLogs(category: LogCategory, cutoffDate: Date): Promise<number> {
    // Mock purge operation
    // In real implementation, delete expired objects from all S3 buckets
    return Math.floor(Math.random() * 50); // Mock purge count
  }

  private updateStorageMetrics(location: DataLocation): void {
    this.metrics.recordCount[location.tier]++;
    this.metrics.totalSize[location.tier] += location.size;
  }
}