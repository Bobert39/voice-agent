import React, { useState, useEffect } from 'react';
import { ConfigurationEditor } from './ConfigurationEditor';
import { ConfigurationPreview } from './ConfigurationPreview';
import { ConfigurationHistory } from './ConfigurationHistory';
import { ConfigurationApproval } from './ConfigurationApproval';
import { ConfigurationValidation } from './ConfigurationValidation';

export interface Configuration {
  id: string;
  type: string;
  name: string;
  data: Record<string, any>;
  status: 'active' | 'pending' | 'draft';
  lastModified: Date;
  modifiedBy: string;
  version: number;
  requiresApproval: boolean;
}

export interface ConfigurationPanelProps {
  className?: string;
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({ className }) => {
  const [configurations, setConfigurations] = useState<Configuration[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<Configuration | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'editor' | 'preview' | 'history' | 'approval' | 'validation'>('list');
  const [configType, setConfigType] = useState<string>('practice_settings');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load configurations on mount
  useEffect(() => {
    loadConfigurations();
  }, [configType]);

  const loadConfigurations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/config/${configType}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load configurations: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        setConfigurations(result.data || []);
      } else {
        throw new Error(result.message || 'Failed to load configurations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configurations');
      setConfigurations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedConfig({
      id: 'new',
      type: configType,
      name: '',
      data: {},
      status: 'draft',
      lastModified: new Date(),
      modifiedBy: 'current-user',
      version: 1,
      requiresApproval: true,
    });
    setActiveTab('editor');
  };

  const handleSelectConfig = (config: Configuration) => {
    setSelectedConfig(config);
    setActiveTab('preview');
  };

  const handleEditConfig = (config: Configuration) => {
    setSelectedConfig({ ...config });
    setActiveTab('editor');
  };

  const handleSaveConfig = async (config: Configuration) => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = config.id === 'new' ? '/api/config' : `/api/config/${config.id}`;
      const method = config.id === 'new' ? 'POST' : 'PUT';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: config.type,
          data: config.data,
          requires_approval: config.requiresApproval,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save configuration: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        await loadConfigurations();
        setActiveTab('list');
        setSelectedConfig(null);
      } else {
        throw new Error(result.message || 'Failed to save configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!window.confirm('Are you sure you want to delete this configuration?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/config/${configId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete configuration: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        await loadConfigurations();
        if (selectedConfig?.id === configId) {
          setSelectedConfig(null);
          setActiveTab('list');
        }
      } else {
        throw new Error(result.message || 'Failed to delete configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete configuration');
    } finally {
      setLoading(false);
    }
  };

  const getConfigTypeName = (type: string): string => {
    const typeNames: Record<string, string> = {
      practice_settings: 'Practice Settings',
      appointment_type: 'Appointment Types',
      ai_personality: 'AI Personality',
      backup_settings: 'Backup Settings',
      update_policy: 'Update Policies',
    };
    return typeNames[type] || type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className={`configuration-panel ${className || ''}`}>
      <div className="configuration-header">
        <h2>System Configuration</h2>
        <div className="configuration-controls">
          <select
            value={configType}
            onChange={(e) => setConfigType(e.target.value)}
            className="config-type-selector"
          >
            <option value="practice_settings">Practice Settings</option>
            <option value="appointment_type">Appointment Types</option>
            <option value="ai_personality">AI Personality</option>
            <option value="backup_settings">Backup Settings</option>
            <option value="update_policy">Update Policies</option>
          </select>
          <button
            onClick={handleCreateNew}
            className="btn-create-config"
            disabled={loading}
          >
            Create New
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button onClick={() => setError(null)} className="error-close">×</button>
        </div>
      )}

      <div className="configuration-tabs">
        <button
          className={`tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          Configurations
        </button>
        <button
          className={`tab ${activeTab === 'approval' ? 'active' : ''}`}
          onClick={() => setActiveTab('approval')}
        >
          Approvals
        </button>
        {selectedConfig && (
          <>
            <button
              className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              Preview
            </button>
            <button
              className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              Edit
            </button>
            <button
              className={`tab ${activeTab === 'validation' ? 'active' : ''}`}
              onClick={() => setActiveTab('validation')}
            >
              Validation
            </button>
            <button
              className={`tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              History
            </button>
          </>
        )}
      </div>

      <div className="configuration-content">
        {loading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <span>Loading configurations...</span>
          </div>
        )}

        {activeTab === 'list' && !loading && (
          <div className="configuration-list">
            <div className="list-header">
              <h3>{getConfigTypeName(configType)}</h3>
              <span className="config-count">{configurations.length} items</span>
            </div>

            {configurations.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h4>No configurations found</h4>
                <p>Create your first {getConfigTypeName(configType).toLowerCase()} configuration.</p>
                <button onClick={handleCreateNew} className="btn-create-first">
                  Create Configuration
                </button>
              </div>
            ) : (
              <div className="config-items">
                {configurations.map((config) => (
                  <div key={config.id} className={`config-item status-${config.status}`}>
                    <div className="config-item-header">
                      <h4 className="config-name">{config.name || `${getConfigTypeName(config.type)} #${config.id}`}</h4>
                      <div className="config-status">
                        <span className={`status-badge status-${config.status}`}>
                          {config.status.toUpperCase()}
                        </span>
                        {config.requiresApproval && (
                          <span className="approval-badge">Requires Approval</span>
                        )}
                      </div>
                    </div>

                    <div className="config-meta">
                      <span className="config-version">v{config.version}</span>
                      <span className="config-modified">
                        Modified {config.lastModified.toLocaleDateString()} by {config.modifiedBy}
                      </span>
                    </div>

                    <div className="config-actions">
                      <button
                        onClick={() => handleSelectConfig(config)}
                        className="btn-view"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleEditConfig(config)}
                        className="btn-edit"
                        disabled={config.status === 'pending'}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteConfig(config.id)}
                        className="btn-delete"
                        disabled={config.status === 'active'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'editor' && selectedConfig && (
          <ConfigurationEditor
            configuration={selectedConfig}
            onSave={handleSaveConfig}
            onCancel={() => {
              setSelectedConfig(null);
              setActiveTab('list');
            }}
          />
        )}

        {activeTab === 'preview' && selectedConfig && (
          <ConfigurationPreview
            configuration={selectedConfig}
            onEdit={() => setActiveTab('editor')}
          />
        )}

        {activeTab === 'history' && selectedConfig && (
          <ConfigurationHistory
            configurationId={selectedConfig.id}
            configurationType={selectedConfig.type}
          />
        )}

        {activeTab === 'approval' && (
          <ConfigurationApproval
            onApprove={(approval, notes) => {
              console.log('Configuration approved:', approval.id, notes);
              loadConfigurations();
            }}
            onReject={(approval, reason) => {
              console.log('Configuration rejected:', approval.id, reason);
              loadConfigurations();
            }}
          />
        )}

        {activeTab === 'validation' && selectedConfig && (
          <ConfigurationValidation
            configurationType={selectedConfig.type}
            configurationData={selectedConfig.data}
            onValidationComplete={(results) => {
              console.log('Validation results:', results);
            }}
            showRealTime={true}
          />
        )}
      </div>
    </div>
  );
};