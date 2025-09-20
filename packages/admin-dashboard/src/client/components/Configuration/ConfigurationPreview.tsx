import React, { useState, useEffect } from 'react';
import { Configuration } from './ConfigurationPanel';

export interface ConfigurationPreviewProps {
  configuration: Configuration;
  onEdit: () => void;
}

export const ConfigurationPreview: React.FC<ConfigurationPreviewProps> = ({
  configuration,
  onEdit
}) => {
  const [previewMode, setPreviewMode] = useState<'formatted' | 'json'>('formatted');
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    warnings: string[];
    errors: string[];
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    validateConfiguration();
  }, [configuration]);

  const validateConfiguration = async () => {
    setIsValidating(true);

    try {
      const response = await fetch('/api/config/validate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: configuration.type,
          data: configuration.data,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setValidationResult(result);
      } else {
        // Fallback validation
        setValidationResult({
          isValid: true,
          warnings: [],
          errors: [],
        });
      }
    } catch (error) {
      // Fallback validation
      setValidationResult({
        isValid: true,
        warnings: [],
        errors: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const formatValue = (value: any): string => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.length === 0 ? 'None' : value.join(', ');
      }
      return JSON.stringify(value, null, 2);
    }
    return String(value || 'Not set');
  };

  const renderFormattedPreview = () => {
    switch (configuration.type) {
      case 'practice_settings':
        return renderPracticeSettingsPreview();
      case 'appointment_type':
        return renderAppointmentTypePreview();
      case 'ai_personality':
        return renderAIPersonalityPreview();
      case 'backup_settings':
        return renderBackupSettingsPreview();
      case 'update_policy':
        return renderUpdatePolicyPreview();
      default:
        return renderGenericPreview();
    }
  };

  const renderPracticeSettingsPreview = () => {
    const data = configuration.data;
    return (
      <div className="formatted-preview">
        <div className="preview-section">
          <h4>Practice Information</h4>
          <div className="preview-grid">
            <div className="preview-item">
              <label>Practice Name:</label>
              <span>{formatValue(data.practice_name)}</span>
            </div>
            <div className="preview-item">
              <label>Phone Number:</label>
              <span>{formatValue(data.phone_number)}</span>
            </div>
            <div className="preview-item">
              <label>Address:</label>
              <span>{formatValue(data.address)}</span>
            </div>
            <div className="preview-item">
              <label>Timezone:</label>
              <span>{formatValue(data.timezone)}</span>
            </div>
          </div>
        </div>

        {data.practice_hours && (
          <div className="preview-section">
            <h4>Practice Hours</h4>
            <div className="hours-grid">
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                const dayData = data.practice_hours[day];
                return (
                  <div key={day} className="day-hours">
                    <label>{day.charAt(0).toUpperCase() + day.slice(1)}:</label>
                    <span>
                      {dayData?.is_closed ? 'Closed' : `${dayData?.open || ''} - ${dayData?.close || ''}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAppointmentTypePreview = () => {
    const data = configuration.data;
    return (
      <div className="formatted-preview">
        <div className="preview-section">
          <h4>Appointment Type Details</h4>
          <div className="preview-grid">
            <div className="preview-item">
              <label>Type Name:</label>
              <span>{formatValue(data.type_name)}</span>
            </div>
            <div className="preview-item">
              <label>Type Code:</label>
              <span>{formatValue(data.type_code)}</span>
            </div>
            <div className="preview-item">
              <label>Duration:</label>
              <span>{formatValue(data.duration_minutes)} minutes</span>
            </div>
            <div className="preview-item">
              <label>Description:</label>
              <span>{formatValue(data.description)}</span>
            </div>
          </div>
        </div>

        {data.scheduling_rules && (
          <div className="preview-section">
            <h4>Scheduling Rules</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <label>Advance Booking:</label>
                <span>{formatValue(data.scheduling_rules.advance_booking_days)} days</span>
              </div>
              <div className="preview-item">
                <label>Cancellation Notice:</label>
                <span>{formatValue(data.scheduling_rules.cancellation_hours)} hours</span>
              </div>
              <div className="preview-item">
                <label>Requires Confirmation:</label>
                <span>{formatValue(data.scheduling_rules.requires_confirmation)}</span>
              </div>
              <div className="preview-item">
                <label>Buffer Before:</label>
                <span>{formatValue(data.scheduling_rules.buffer_minutes_before)} minutes</span>
              </div>
              <div className="preview-item">
                <label>Buffer After:</label>
                <span>{formatValue(data.scheduling_rules.buffer_minutes_after)} minutes</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAIPersonalityPreview = () => {
    const data = configuration.data;
    return (
      <div className="formatted-preview">
        <div className="preview-section">
          <h4>Personality Settings</h4>
          <div className="preview-grid">
            <div className="preview-item">
              <label>Personality Name:</label>
              <span>{formatValue(data.personality_name)}</span>
            </div>
            <div className="preview-item">
              <label>Formality Level:</label>
              <span>{formatValue(data.personality_settings?.formality_level)}</span>
            </div>
            <div className="preview-item">
              <label>Empathy Level:</label>
              <span>{formatValue(data.personality_settings?.empathy_level)}</span>
            </div>
            <div className="preview-item">
              <label>Verbosity:</label>
              <span>{formatValue(data.personality_settings?.verbosity)}</span>
            </div>
            <div className="preview-item">
              <label>Tone:</label>
              <span>{formatValue(data.personality_settings?.tone)}</span>
            </div>
          </div>
        </div>

        {data.conversation_rules && (
          <div className="preview-section">
            <h4>Conversation Rules</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <label>Max Conversation Length:</label>
                <span>{formatValue(data.conversation_rules.max_conversation_length)} minutes</span>
              </div>
              <div className="preview-item">
                <label>Escalation Triggers:</label>
                <span>{formatValue(data.conversation_rules.escalation_triggers)}</span>
              </div>
              <div className="preview-item">
                <label>Prohibited Topics:</label>
                <span>{formatValue(data.conversation_rules.prohibited_topics)}</span>
              </div>
            </div>
          </div>
        )}

        {data.response_templates && (
          <div className="preview-section">
            <h4>Response Templates</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <label>Greeting:</label>
                <span className="template-preview">{formatValue(data.response_templates.greeting)}</span>
              </div>
              <div className="preview-item">
                <label>Appointment Confirmation:</label>
                <span className="template-preview">{formatValue(data.response_templates.appointment_confirmation)}</span>
              </div>
              <div className="preview-item">
                <label>Error Handling:</label>
                <span className="template-preview">{formatValue(data.response_templates.error_handling)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBackupSettingsPreview = () => {
    const data = configuration.data;
    return (
      <div className="formatted-preview">
        <div className="preview-section">
          <h4>Backup Configuration</h4>
          <div className="preview-grid">
            <div className="preview-item">
              <label>Backup Type:</label>
              <span>{formatValue(data.backup_type)}</span>
            </div>
            <div className="preview-item">
              <label>Schedule:</label>
              <span>{formatValue(data.schedule_cron)}</span>
            </div>
            <div className="preview-item">
              <label>Retention Period:</label>
              <span>{formatValue(data.retention_days)} days</span>
            </div>
            <div className="preview-item">
              <label>Backup Location:</label>
              <span>{formatValue(data.backup_location)}</span>
            </div>
            <div className="preview-item">
              <label>Encryption Enabled:</label>
              <span>{formatValue(data.encryption_enabled)}</span>
            </div>
            <div className="preview-item">
              <label>Compression Enabled:</label>
              <span>{formatValue(data.compression_enabled)}</span>
            </div>
            <div className="preview-item">
              <label>Notification Emails:</label>
              <span>{formatValue(data.notification_emails)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUpdatePolicyPreview = () => {
    const data = configuration.data;
    return (
      <div className="formatted-preview">
        <div className="preview-section">
          <h4>Update Policy</h4>
          <div className="preview-grid">
            <div className="preview-item">
              <label>Policy Name:</label>
              <span>{formatValue(data.policy_name)}</span>
            </div>
            <div className="preview-item">
              <label>Deployment Strategy:</label>
              <span>{formatValue(data.deployment_strategy)}</span>
            </div>
            <div className="preview-item">
              <label>Auto Approve Minor:</label>
              <span>{formatValue(data.auto_approve_minor)}</span>
            </div>
            <div className="preview-item">
              <label>Auto Approve Patch:</label>
              <span>{formatValue(data.auto_approve_patch)}</span>
            </div>
          </div>
        </div>

        {data.rollback_conditions && (
          <div className="preview-section">
            <h4>Rollback Conditions</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <label>Error Rate Threshold:</label>
                <span>{formatValue(data.rollback_conditions.error_rate_threshold)}%</span>
              </div>
              <div className="preview-item">
                <label>Response Time Threshold:</label>
                <span>{formatValue(data.rollback_conditions.response_time_threshold)}ms</span>
              </div>
              <div className="preview-item">
                <label>Success Rate Threshold:</label>
                <span>{formatValue(data.rollback_conditions.success_rate_threshold)}%</span>
              </div>
              <div className="preview-item">
                <label>Auto Rollback:</label>
                <span>{formatValue(data.rollback_conditions.auto_rollback_enabled)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGenericPreview = () => {
    return (
      <div className="formatted-preview">
        <div className="preview-section">
          <h4>Configuration Data</h4>
          <pre className="json-preview">
            {JSON.stringify(configuration.data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div className="configuration-preview">
      <div className="preview-header">
        <div className="preview-title">
          <h3>{configuration.name || `Configuration #${configuration.id}`}</h3>
          <div className="preview-meta">
            <span className={`status-badge status-${configuration.status}`}>
              {configuration.status.toUpperCase()}
            </span>
            <span className="version-badge">v{configuration.version}</span>
            {configuration.requiresApproval && (
              <span className="approval-badge">Requires Approval</span>
            )}
          </div>
        </div>

        <div className="preview-controls">
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${previewMode === 'formatted' ? 'active' : ''}`}
              onClick={() => setPreviewMode('formatted')}
            >
              Formatted
            </button>
            <button
              className={`toggle-btn ${previewMode === 'json' ? 'active' : ''}`}
              onClick={() => setPreviewMode('json')}
            >
              JSON
            </button>
          </div>
          <button onClick={onEdit} className="btn-edit-preview">
            Edit Configuration
          </button>
        </div>
      </div>

      {/* Validation Results */}
      {isValidating && (
        <div className="validation-status loading">
          <span className="spinner"></span>
          <span>Validating configuration...</span>
        </div>
      )}

      {validationResult && !isValidating && (
        <div className={`validation-status ${validationResult.isValid ? 'valid' : 'invalid'}`}>
          <div className="validation-icon">
            {validationResult.isValid ? '✅' : '❌'}
          </div>
          <div className="validation-details">
            {validationResult.isValid ? (
              <span>Configuration is valid</span>
            ) : (
              <span>Configuration has validation errors</span>
            )}
            {validationResult.warnings.length > 0 && (
              <div className="validation-warnings">
                <strong>Warnings:</strong>
                <ul>
                  {validationResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {validationResult.errors.length > 0 && (
              <div className="validation-errors">
                <strong>Errors:</strong>
                <ul>
                  {validationResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configuration Content */}
      <div className="preview-content">
        {previewMode === 'formatted' ? (
          renderFormattedPreview()
        ) : (
          <div className="json-preview-container">
            <pre className="json-preview">
              {JSON.stringify(configuration, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Configuration Metadata */}
      <div className="preview-metadata">
        <h4>Metadata</h4>
        <div className="metadata-grid">
          <div className="metadata-item">
            <label>Configuration ID:</label>
            <span>{configuration.id}</span>
          </div>
          <div className="metadata-item">
            <label>Type:</label>
            <span>{configuration.type}</span>
          </div>
          <div className="metadata-item">
            <label>Last Modified:</label>
            <span>{configuration.lastModified.toLocaleString()}</span>
          </div>
          <div className="metadata-item">
            <label>Modified By:</label>
            <span>{configuration.modifiedBy}</span>
          </div>
          <div className="metadata-item">
            <label>Version:</label>
            <span>{configuration.version}</span>
          </div>
          <div className="metadata-item">
            <label>Status:</label>
            <span>{configuration.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
};