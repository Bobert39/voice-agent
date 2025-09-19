/**
 * PHI (Protected Health Information) masking service
 * Automatically detects and masks sensitive patient data in audit logs
 */

import { AuditLogEntry } from '../types/audit-log';

export interface PHIMaskingConfig {
  enableAutoDetection: boolean;
  maskingRules: PHIMaskingRule[];
  preservePatterns?: string[];
}

export interface PHIMaskingRule {
  pattern: RegExp;
  replacement: string;
  description: string;
}

export class PHIMaskingService {
  private config: PHIMaskingConfig;

  constructor(config?: Partial<PHIMaskingConfig>) {
    this.config = {
      enableAutoDetection: true,
      maskingRules: this.getDefaultMaskingRules(),
      ...config
    };
  }

  /**
   * Apply PHI masking to audit log entry
   */
  async maskPHI(logEntry: AuditLogEntry): Promise<void> {
    if (!this.config.enableAutoDetection) {
      return;
    }

    // Mask action details
    if (logEntry.action.details) {
      logEntry.action.details = this.maskObject(logEntry.action.details);
    }

    // Mask metadata that might contain PHI
    if (logEntry.metadata) {
      logEntry.metadata = this.maskObject(logEntry.metadata);
    }

    // Note: patient_id should already be hashed, session_id should be safe
  }

  /**
   * Mask PHI in any object recursively
   */
  private maskObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.maskString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskObject(item));
    }

    if (typeof obj === 'object') {
      const masked: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Certain fields should never be logged even if encrypted
        if (this.isSensitiveField(key)) {
          masked[key] = '[REDACTED]';
        } else {
          masked[key] = this.maskObject(value);
        }
      }
      return masked;
    }

    return obj;
  }

  /**
   * Apply masking rules to a string
   */
  private maskString(text: string): string {
    let maskedText = text;

    for (const rule of this.config.maskingRules) {
      maskedText = maskedText.replace(rule.pattern, rule.replacement);
    }

    return maskedText;
  }

  /**
   * Check if a field name indicates sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'ssn',
      'social_security_number',
      'credit_card',
      'password',
      'api_key',
      'token',
      'secret',
      'private_key',
      'dob', // Date of birth in some contexts
      'date_of_birth'
    ];

    const lowerFieldName = fieldName.toLowerCase();
    return sensitiveFields.some(sensitive => lowerFieldName.includes(sensitive));
  }

  /**
   * Default PHI masking rules based on common patterns
   */
  private getDefaultMaskingRules(): PHIMaskingRule[] {
    return [
      // Social Security Numbers
      {
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        replacement: 'XXX-XX-XXXX',
        description: 'Social Security Number'
      },
      // Phone Numbers
      {
        pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
        replacement: '(XXX) XXX-XXXX',
        description: 'Phone Number'
      },
      // Email Addresses - partially mask
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: 'XXX@XXX.com',
        description: 'Email Address'
      },
      // Date of Birth patterns (MM/DD/YYYY, MM-DD-YYYY)
      {
        pattern: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])[\/\-](19|20)\d{2}\b/g,
        replacement: 'XX/XX/XXXX',
        description: 'Date of Birth'
      },
      // Credit Card Numbers
      {
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        replacement: 'XXXX-XXXX-XXXX-XXXX',
        description: 'Credit Card Number'
      },
      // Medical Record Numbers (assuming 6-10 digit patterns)
      {
        pattern: /\bMRN:?\s*\d{6,10}\b/gi,
        replacement: 'MRN: XXXXXXXX',
        description: 'Medical Record Number'
      },
      // Insurance ID patterns
      {
        pattern: /\b(?:insurance|policy)\s*(?:id|number):?\s*[A-Za-z0-9]{6,}\b/gi,
        replacement: 'Insurance ID: XXXXXXXX',
        description: 'Insurance ID'
      },
      // IP Addresses (if considered sensitive in context)
      {
        pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
        replacement: 'XXX.XXX.XXX.XXX',
        description: 'IP Address'
      },
      // Driver's License patterns (state-specific, basic pattern)
      {
        pattern: /\b[A-Z0-9]{8,12}\b/g,
        replacement: 'XXXXXXXX',
        description: 'Potential ID Number'
      }
    ];
  }

  /**
   * Validate that masking was applied correctly
   */
  validateMasking(originalText: string, maskedText: string): boolean {
    // Check that none of the original sensitive patterns remain
    for (const rule of this.config.maskingRules) {
      if (rule.pattern.test(maskedText)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get list of PHI types that were detected and masked
   */
  getDetectedPHITypes(text: string): string[] {
    const detectedTypes: string[] = [];

    for (const rule of this.config.maskingRules) {
      if (rule.pattern.test(text)) {
        detectedTypes.push(rule.description);
      }
    }

    return detectedTypes;
  }
}