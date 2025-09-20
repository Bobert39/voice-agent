import React, { useState, useEffect } from 'react';

export interface ValidationRule {
  id: string;
  field: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  validator: (value: any) => boolean;
}

export interface ValidationResult {
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface ConfigurationValidationProps {
  configurationType: string;
  configurationData: Record<string, any>;
  onValidationComplete?: (results: ValidationResult[]) => void;
  showRealTime?: boolean;
  className?: string;
}

export const ConfigurationValidation: React.FC<ConfigurationValidationProps> = ({
  configurationType,
  configurationData,
  onValidationComplete,
  showRealTime = true,
  className = ''
}) => {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidated, setLastValidated] = useState<Date | null>(null);

  // Define validation rules based on configuration type
  const getValidationRules = (): ValidationRule[] => {
    const commonRules: ValidationRule[] = [
      {
        id: 'required-fields',
        field: '*',
        rule: 'Required fields must not be empty',
        severity: 'error',
        message: 'This field is required',
        validator: (value) => value !== null && value !== undefined && value !== ''
      }
    ];

    const typeSpecificRules: Record<string, ValidationRule[]> = {
      practice_settings: [
        {
          id: 'business-hours',
          field: 'businessHours',
          rule: 'Business hours must be valid',
          severity: 'error',
          message: 'Invalid business hours format',
          validator: (value) => {
            if (!value) return false;
            // Validate hours format (e.g., "09:00-17:00")
            const pattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            return Object.values(value).every((hours: any) =>
              hours === 'closed' || pattern.test(hours)
            );
          }
        },
        {
          id: 'phone-format',
          field: 'phoneNumber',
          rule: 'Phone number must be valid',
          severity: 'warning',
          message: 'Phone number format may not be recognized',
          validator: (value) => {
            if (!value) return true;
            const pattern = /^\+?1?\d{10,14}$/;
            return pattern.test(value.replace(/[\s()-]/g, ''));
          }
        },
        {
          id: 'email-format',
          field: 'email',
          rule: 'Email must be valid',
          severity: 'error',
          message: 'Invalid email format',
          validator: (value) => {
            if (!value) return true;
            const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return pattern.test(value);
          }
        }
      ],
      appointment_types: [
        {
          id: 'duration-range',
          field: 'duration',
          rule: 'Duration must be between 5 and 480 minutes',
          severity: 'error',
          message: 'Appointment duration out of valid range',
          validator: (value) => {
            const duration = parseInt(value);
            return !isNaN(duration) && duration >= 5 && duration <= 480;
          }
        },
        {
          id: 'buffer-time',
          field: 'bufferTime',
          rule: 'Buffer time should not exceed duration',
          severity: 'warning',
          message: 'Buffer time is longer than appointment duration',
          validator: (value) => {
            if (!configurationData.duration) return true;
            return parseInt(value) <= parseInt(configurationData.duration);
          }
        },
        {
          id: 'scheduling-window',
          field: 'advanceBookingDays',
          rule: 'Advance booking should be reasonable',
          severity: 'info',
          message: 'Consider if this booking window meets practice needs',
          validator: (value) => {
            const days = parseInt(value);
            return days >= 1 && days <= 365;
          }
        }
      ],
      ai_personality: [
        {
          id: 'response-length',
          field: 'maxResponseLength',
          rule: 'Response length must be appropriate',
          severity: 'warning',
          message: 'Very long responses may frustrate patients',
          validator: (value) => {
            const length = parseInt(value);
            return length > 0 && length <= 500;
          }
        },
        {
          id: 'tone-consistency',
          field: 'tone',
          rule: 'Tone must be professional',
          severity: 'info',
          message: 'Ensure tone aligns with practice culture',
          validator: (value) => {
            const validTones = ['professional', 'friendly', 'formal', 'casual'];
            return validTones.includes(value);
          }
        },
        {
          id: 'language-support',
          field: 'supportedLanguages',
          rule: 'At least one language must be supported',
          severity: 'error',
          message: 'Must support at least one language',
          validator: (value) => {
            return Array.isArray(value) && value.length > 0;
          }
        }
      ],
      backup_settings: [
        {
          id: 'backup-frequency',
          field: 'frequency',
          rule: 'Backup frequency must be reasonable',
          severity: 'warning',
          message: 'Consider if backup frequency meets compliance requirements',
          validator: (value) => {
            const validFrequencies = ['hourly', 'daily', 'weekly', 'monthly'];
            return validFrequencies.includes(value);
          }
        },
        {
          id: 'retention-period',
          field: 'retentionDays',
          rule: 'Retention must meet HIPAA requirements',
          severity: 'error',
          message: 'HIPAA requires minimum 6 year retention (2190 days)',
          validator: (value) => {
            const days = parseInt(value);
            return days >= 2190; // 6 years
          }
        },
        {
          id: 'encryption-enabled',
          field: 'encryptionEnabled',
          rule: 'Encryption must be enabled',
          severity: 'error',
          message: 'HIPAA requires backup encryption',
          validator: (value) => value === true
        }
      ]
    };

    return [...commonRules, ...(typeSpecificRules[configurationType] || [])];
  };

  // Perform validation
  const validate = async () => {
    setIsValidating(true);
    const results: ValidationResult[] = [];
    const rules = getValidationRules();

    // Check for security issues
    const securityCheck = await performSecurityValidation(configurationData);
    if (securityCheck.length > 0) {
      results.push(...securityCheck);
    }

    // Apply validation rules
    for (const rule of rules) {
      if (rule.field === '*') {
        // Check all fields for common rules
        Object.entries(configurationData).forEach(([field, value]) => {
          if (!rule.validator(value)) {
            results.push({
              field,
              severity: rule.severity,
              message: rule.message
            });
          }
        });
      } else {
        // Check specific field
        const value = configurationData[rule.field];
        if (value !== undefined && !rule.validator(value)) {
          results.push({
            field: rule.field,
            severity: rule.severity,
            message: rule.message,
            suggestion: getSuggestion(rule.field, value)
          });
        }
      }
    }

    // Check for interdependencies
    const dependencyResults = validateDependencies(configurationType, configurationData);
    results.push(...dependencyResults);

    setValidationResults(results);
    setLastValidated(new Date());
    setIsValidating(false);

    if (onValidationComplete) {
      onValidationComplete(results);
    }
  };

  // Security validation
  const performSecurityValidation = async (data: Record<string, any>): Promise<ValidationResult[]> => {
    const results: ValidationResult[] = [];

    // Check for potential security issues
    const stringValues = Object.entries(data)
      .filter(([_, value]) => typeof value === 'string')
      .map(([field, value]) => ({ field, value: value as string }));

    for (const { field, value } of stringValues) {
      // Check for SQL injection patterns
      if (/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER)\b)/i.test(value)) {
        results.push({
          field,
          severity: 'error',
          message: 'Potential SQL injection detected',
          suggestion: 'Remove SQL keywords from configuration value'
        });
      }

      // Check for script injection
      if (/<script|<iframe|javascript:|onerror=/i.test(value)) {
        results.push({
          field,
          severity: 'error',
          message: 'Potential XSS vulnerability detected',
          suggestion: 'Remove script tags and JavaScript code'
        });
      }

      // Check for sensitive data exposure
      if (/password|secret|key|token/i.test(field) && value.length < 8) {
        results.push({
          field,
          severity: 'warning',
          message: 'Sensitive field may have weak value',
          suggestion: 'Use a stronger value with at least 8 characters'
        });
      }
    }

    return results;
  };

  // Validate interdependencies
  const validateDependencies = (type: string, data: Record<string, any>): ValidationResult[] => {
    const results: ValidationResult[] = [];

    if (type === 'appointment_types') {
      // Check if duration and buffer time make sense together
      if (data.duration && data.bufferTime) {
        const totalTime = parseInt(data.duration) + parseInt(data.bufferTime);
        if (totalTime > 60) {
          results.push({
            field: 'duration+bufferTime',
            severity: 'info',
            message: `Total appointment slot is ${totalTime} minutes`,
            suggestion: 'Ensure this aligns with practice scheduling needs'
          });
        }
      }
    }

    if (type === 'practice_settings') {
      // Check if business hours are consistent
      if (data.businessHours) {
        const days = Object.keys(data.businessHours);
        const closedDays = days.filter(day => data.businessHours[day] === 'closed');
        if (closedDays.length >= 5) {
          results.push({
            field: 'businessHours',
            severity: 'warning',
            message: 'Practice is closed most days of the week',
            suggestion: 'Verify business hours are correct'
          });
        }
      }
    }

    return results;
  };

  // Get suggestion for fixing validation issue
  const getSuggestion = (field: string, value: any): string | undefined => {
    const suggestions: Record<string, string> = {
      phoneNumber: 'Use format: +1 (555) 123-4567',
      email: 'Use format: contact@practice.com',
      duration: 'Common durations: 15, 30, 45, or 60 minutes',
      businessHours: 'Format: "09:00-17:00" or "closed"',
      retentionDays: 'HIPAA minimum is 2190 days (6 years)'
    };

    return suggestions[field];
  };

  // Trigger validation on data change
  useEffect(() => {
    if (showRealTime && configurationData && Object.keys(configurationData).length > 0) {
      const debounceTimer = setTimeout(() => {
        validate();
      }, 500);

      return () => clearTimeout(debounceTimer);
    }
  }, [configurationData, configurationType]);

  // Get icon for severity
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '•';
    }
  };

  // Get style for severity
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-700';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  // Group results by severity
  const groupedResults = validationResults.reduce((acc, result) => {
    if (!acc[result.severity]) {
      acc[result.severity] = [];
    }
    acc[result.severity].push(result);
    return acc;
  }, {} as Record<string, ValidationResult[]>);

  const hasErrors = groupedResults.error && groupedResults.error.length > 0;
  const hasWarnings = groupedResults.warning && groupedResults.warning.length > 0;

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Configuration Validation</h3>
        <div className="flex items-center gap-4">
          {lastValidated && (
            <span className="text-xs text-gray-500">
              Last validated: {lastValidated.toLocaleTimeString()}
            </span>
          )}
          {!showRealTime && (
            <button
              onClick={validate}
              disabled={isValidating}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
          )}
        </div>
      </div>

      {isValidating && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-sm text-gray-600">Validating configuration...</span>
        </div>
      )}

      {!isValidating && validationResults.length === 0 && lastValidated && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-2xl mr-2">✅</span>
            <span className="text-green-700">Configuration is valid</span>
          </div>
        </div>
      )}

      {!isValidating && validationResults.length > 0 && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex gap-3 p-3 bg-gray-50 rounded-lg">
            {hasErrors && (
              <div className="flex items-center">
                <span className="text-red-500 mr-1">❌</span>
                <span className="text-sm">{groupedResults.error.length} errors</span>
              </div>
            )}
            {hasWarnings && (
              <div className="flex items-center">
                <span className="text-yellow-500 mr-1">⚠️</span>
                <span className="text-sm">{groupedResults.warning.length} warnings</span>
              </div>
            )}
            {groupedResults.info && (
              <div className="flex items-center">
                <span className="text-blue-500 mr-1">ℹ️</span>
                <span className="text-sm">{groupedResults.info.length} suggestions</span>
              </div>
            )}
          </div>

          {/* Detailed results */}
          {['error', 'warning', 'info'].map((severity) => {
            const results = groupedResults[severity];
            if (!results || results.length === 0) return null;

            return (
              <div key={severity} className="space-y-2">
                <h4 className="text-sm font-semibold capitalize">{severity}s</h4>
                {results.map((result, index) => (
                  <div
                    key={`${result.field}-${index}`}
                    className={`p-3 border rounded-lg ${getSeverityStyle(result.severity)}`}
                  >
                    <div className="flex items-start">
                      <span className="mr-2">{getSeverityIcon(result.severity)}</span>
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {result.field}: {result.message}
                        </div>
                        {result.suggestion && (
                          <div className="mt-1 text-xs opacity-75">
                            💡 {result.suggestion}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};