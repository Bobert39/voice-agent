import React, { useState, useEffect } from 'react';
import { Configuration } from './ConfigurationPanel';

export interface ConfigurationEditorProps {
  configuration: Configuration;
  onSave: (config: Configuration) => void;
  onCancel: () => void;
}

export const ConfigurationEditor: React.FC<ConfigurationEditorProps> = ({
  configuration,
  onSave,
  onCancel
}) => {
  const [editedConfig, setEditedConfig] = useState<Configuration>({ ...configuration });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setEditedConfig({ ...configuration });
    setValidationErrors({});
    setIsDirty(false);
  }, [configuration]);

  const handleFieldChange = (path: string, value: any) => {
    setEditedConfig(prev => {
      const newConfig = { ...prev };
      const pathParts = path.split('.');
      let current = newConfig.data;

      // Navigate to the parent object
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) {
          current[pathParts[i]] = {};
        }
        current = current[pathParts[i]];
      }

      // Set the value
      current[pathParts[pathParts.length - 1]] = value;
      return newConfig;
    });
    setIsDirty(true);

    // Clear validation error for this field
    if (validationErrors[path]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[path];
        return newErrors;
      });
    }
  };

  const getFieldValue = (path: string): any => {
    const pathParts = path.split('.');
    let current = editedConfig.data;

    for (const part of pathParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return '';
      }
    }

    return current;
  };

  const validateConfiguration = (): boolean => {
    const errors: Record<string, string> = {};

    // Common validations
    if (!editedConfig.name || editedConfig.name.trim().length === 0) {
      errors['name'] = 'Configuration name is required';
    }

    // Type-specific validations
    switch (editedConfig.type) {
      case 'practice_settings':
        validatePracticeSettings(errors);
        break;
      case 'appointment_type':
        validateAppointmentType(errors);
        break;
      case 'ai_personality':
        validateAIPersonality(errors);
        break;
      case 'backup_settings':
        validateBackupSettings(errors);
        break;
      case 'update_policy':
        validateUpdatePolicy(errors);
        break;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validatePracticeSettings = (errors: Record<string, string>) => {
    const hours = getFieldValue('practice_hours');
    if (hours) {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of days) {
        const dayData = hours[day];
        if (dayData && !dayData.is_closed) {
          if (!dayData.open || !dayData.close) {
            errors[`practice_hours.${day}`] = `${day} hours are incomplete`;
          }
        }
      }
    }
  };

  const validateAppointmentType = (errors: Record<string, string>) => {
    const duration = getFieldValue('duration_minutes');
    if (!duration || duration < 5 || duration > 480) {
      errors['duration_minutes'] = 'Duration must be between 5 and 480 minutes';
    }

    const typeName = getFieldValue('type_name');
    if (!typeName || typeName.trim().length === 0) {
      errors['type_name'] = 'Appointment type name is required';
    }

    const typeCode = getFieldValue('type_code');
    if (!typeCode || typeCode.trim().length === 0) {
      errors['type_code'] = 'Appointment type code is required';
    }
  };

  const validateAIPersonality = (errors: Record<string, string>) => {
    const personalityName = getFieldValue('personality_name');
    if (!personalityName || personalityName.trim().length === 0) {
      errors['personality_name'] = 'Personality name is required';
    }

    const maxLength = getFieldValue('conversation_rules.max_conversation_length');
    if (maxLength && (maxLength < 5 || maxLength > 60)) {
      errors['conversation_rules.max_conversation_length'] = 'Conversation length must be between 5 and 60 minutes';
    }
  };

  const validateBackupSettings = (errors: Record<string, string>) => {
    const backupType = getFieldValue('backup_type');
    if (!['database', 'files', 'logs', 'full'].includes(backupType)) {
      errors['backup_type'] = 'Invalid backup type';
    }

    const retention = getFieldValue('retention_days');
    if (!retention || retention < 7 || retention > 2555) {
      errors['retention_days'] = 'Retention period must be between 7 days and 7 years';
    }

    const location = getFieldValue('backup_location');
    if (!location || location.trim().length === 0) {
      errors['backup_location'] = 'Backup location is required';
    }
  };

  const validateUpdatePolicy = (errors: Record<string, string>) => {
    const policyName = getFieldValue('policy_name');
    if (!policyName || policyName.trim().length === 0) {
      errors['policy_name'] = 'Policy name is required';
    }

    const strategy = getFieldValue('deployment_strategy');
    if (!['rolling', 'blue-green', 'canary'].includes(strategy)) {
      errors['deployment_strategy'] = 'Invalid deployment strategy';
    }
  };

  const handleSave = () => {
    if (validateConfiguration()) {
      onSave(editedConfig);
    }
  };

  const renderFieldEditor = (label: string, path: string, type: 'text' | 'number' | 'boolean' | 'select' | 'textarea' = 'text', options?: string[]) => {
    const value = getFieldValue(path);
    const error = validationErrors[path];

    return (
      <div className={`field-group ${error ? 'has-error' : ''}`}>
        <label htmlFor={path} className="field-label">
          {label}
          {error && <span className="error-indicator">*</span>}
        </label>

        {type === 'text' && (
          <input
            id={path}
            type="text"
            value={value || ''}
            onChange={(e) => handleFieldChange(path, e.target.value)}
            className="field-input"
          />
        )}

        {type === 'number' && (
          <input
            id={path}
            type="number"
            value={value || ''}
            onChange={(e) => handleFieldChange(path, parseInt(e.target.value, 10) || 0)}
            className="field-input"
          />
        )}

        {type === 'boolean' && (
          <label className="checkbox-label">
            <input
              id={path}
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleFieldChange(path, e.target.checked)}
              className="field-checkbox"
            />
            <span className="checkbox-text">Enabled</span>
          </label>
        )}

        {type === 'select' && options && (
          <select
            id={path}
            value={value || ''}
            onChange={(e) => handleFieldChange(path, e.target.value)}
            className="field-select"
          >
            <option value="">Select an option</option>
            {options.map(option => (
              <option key={option} value={option}>
                {option.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
        )}

        {type === 'textarea' && (
          <textarea
            id={path}
            value={value || ''}
            onChange={(e) => handleFieldChange(path, e.target.value)}
            className="field-textarea"
            rows={4}
          />
        )}

        {error && <div className="field-error">{error}</div>}
      </div>
    );
  };

  const renderTypeSpecificFields = () => {
    switch (editedConfig.type) {
      case 'practice_settings':
        return (
          <div className="section">
            <h3>Practice Information</h3>
            {renderFieldEditor('Practice Name', 'practice_name')}
            {renderFieldEditor('Phone Number', 'phone_number')}
            {renderFieldEditor('Address', 'address', 'textarea')}
            {renderFieldEditor('Timezone', 'timezone', 'select', [
              'America/Los_Angeles',
              'America/Denver',
              'America/Chicago',
              'America/New_York'
            ])}
          </div>
        );

      case 'appointment_type':
        return (
          <div className="section">
            <h3>Appointment Type Details</h3>
            {renderFieldEditor('Type Name', 'type_name')}
            {renderFieldEditor('Type Code', 'type_code')}
            {renderFieldEditor('Duration (minutes)', 'duration_minutes', 'number')}
            {renderFieldEditor('Description', 'description', 'textarea')}

            <h4>Scheduling Rules</h4>
            {renderFieldEditor('Advance Booking Days', 'scheduling_rules.advance_booking_days', 'number')}
            {renderFieldEditor('Cancellation Hours', 'scheduling_rules.cancellation_hours', 'number')}
            {renderFieldEditor('Requires Confirmation', 'scheduling_rules.requires_confirmation', 'boolean')}
          </div>
        );

      case 'ai_personality':
        return (
          <div className="section">
            <h3>AI Personality Configuration</h3>
            {renderFieldEditor('Personality Name', 'personality_name')}

            <h4>Personality Settings</h4>
            {renderFieldEditor('Formality Level', 'personality_settings.formality_level', 'select', ['casual', 'professional', 'formal'])}
            {renderFieldEditor('Empathy Level', 'personality_settings.empathy_level', 'select', ['low', 'medium', 'high'])}
            {renderFieldEditor('Verbosity', 'personality_settings.verbosity', 'select', ['concise', 'balanced', 'detailed'])}
            {renderFieldEditor('Tone', 'personality_settings.tone', 'select', ['friendly', 'neutral', 'compassionate'])}

            <h4>Conversation Rules</h4>
            {renderFieldEditor('Max Conversation Length (minutes)', 'conversation_rules.max_conversation_length', 'number')}
          </div>
        );

      case 'backup_settings':
        return (
          <div className="section">
            <h3>Backup Configuration</h3>
            {renderFieldEditor('Backup Type', 'backup_type', 'select', ['database', 'files', 'logs', 'full'])}
            {renderFieldEditor('Schedule (Cron)', 'schedule_cron')}
            {renderFieldEditor('Retention Days', 'retention_days', 'number')}
            {renderFieldEditor('Backup Location', 'backup_location')}
            {renderFieldEditor('Encryption Enabled', 'encryption_enabled', 'boolean')}
            {renderFieldEditor('Compression Enabled', 'compression_enabled', 'boolean')}
          </div>
        );

      case 'update_policy':
        return (
          <div className="section">
            <h3>Update Policy Configuration</h3>
            {renderFieldEditor('Policy Name', 'policy_name')}
            {renderFieldEditor('Deployment Strategy', 'deployment_strategy', 'select', ['rolling', 'blue-green', 'canary'])}
            {renderFieldEditor('Auto Approve Minor Updates', 'auto_approve_minor', 'boolean')}
            {renderFieldEditor('Auto Approve Patch Updates', 'auto_approve_patch', 'boolean')}

            <h4>Rollback Conditions</h4>
            {renderFieldEditor('Error Rate Threshold (%)', 'rollback_conditions.error_rate_threshold', 'number')}
            {renderFieldEditor('Response Time Threshold (ms)', 'rollback_conditions.response_time_threshold', 'number')}
            {renderFieldEditor('Success Rate Threshold (%)', 'rollback_conditions.success_rate_threshold', 'number')}
            {renderFieldEditor('Auto Rollback Enabled', 'rollback_conditions.auto_rollback_enabled', 'boolean')}
          </div>
        );

      default:
        return (
          <div className="section">
            <h3>Raw Configuration Data</h3>
            <textarea
              value={JSON.stringify(editedConfig.data, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setEditedConfig(prev => ({ ...prev, data: parsed }));
                  setIsDirty(true);
                } catch (err) {
                  // Invalid JSON, don't update
                }
              }}
              className="json-editor"
              rows={20}
            />
          </div>
        );
    }
  };

  return (
    <div className="configuration-editor">
      <div className="editor-header">
        <h3>
          {editedConfig.id === 'new' ? 'Create New Configuration' : 'Edit Configuration'}
        </h3>
        {isDirty && <span className="dirty-indicator">• Unsaved changes</span>}
      </div>

      <div className="editor-content">
        <div className="section">
          <h3>Basic Information</h3>
          {renderFieldEditor('Configuration Name', 'name')}
          <div className="field-group">
            <label className="field-label">Type</label>
            <div className="field-display">{editedConfig.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
          </div>
          {renderFieldEditor('Requires Approval', 'requiresApproval', 'boolean')}
        </div>

        {renderTypeSpecificFields()}
      </div>

      <div className="editor-actions">
        <button
          onClick={onCancel}
          className="btn-cancel"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="btn-save"
          disabled={!isDirty}
        >
          {editedConfig.id === 'new' ? 'Create Configuration' : 'Save Changes'}
        </button>
      </div>

      {Object.keys(validationErrors).length > 0 && (
        <div className="validation-summary">
          <h4>Please fix the following errors:</h4>
          <ul>
            {Object.entries(validationErrors).map(([field, error]) => (
              <li key={field}>
                <strong>{field}:</strong> {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};