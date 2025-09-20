import React, { useState, useEffect } from 'react';
import { Configuration } from './ConfigurationPanel';

export interface ConfigurationChange {
  id: string;
  configurationId: string;
  configurationType: string;
  changeType: 'create' | 'update' | 'delete' | 'approve' | 'reject';
  previousValue: Record<string, any> | null;
  newValue: Record<string, any>;
  changedBy: string;
  timestamp: Date;
  reason?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvalTimestamp?: Date;
  version: number;
}

export interface ConfigurationHistoryProps {
  configurationId?: string;
  configurationType?: string;
  limit?: number;
  className?: string;
}

export const ConfigurationHistory: React.FC<ConfigurationHistoryProps> = ({
  configurationId,
  configurationType,
  limit = 50,
  className = ''
}) => {
  const [changes, setChanges] = useState<ConfigurationChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    if (configurationId || configurationType) {
      loadHistory();
    }
  }, [configurationId, configurationType, filter]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (configurationId) queryParams.append('configId', configurationId);
      if (configurationType) queryParams.append('type', configurationType);
      if (filter !== 'all') queryParams.append('status', filter);
      queryParams.append('limit', limit.toString());

      const response = await fetch(`/api/config/history?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load history: ${response.statusText}`);
      }

      const data = await response.json();
      setChanges(data.changes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration history');
      console.error('Error loading configuration history:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatChangeType = (type: string) => {
    const typeMap: Record<string, string> = {
      create: '✨ Created',
      update: '📝 Updated',
      delete: '🗑️ Deleted',
      approve: '✅ Approved',
      reject: '❌ Rejected'
    };
    return typeMap[type] || type;
  };

  const formatTimestamp = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const badgeStyles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`px-2 py-1 text-xs rounded-full ${badgeStyles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const renderDiff = (previous: any, current: any) => {
    if (!previous) return null;

    const changes: JSX.Element[] = [];
    const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

    allKeys.forEach(key => {
      const prevVal = previous[key];
      const currVal = current[key];

      if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
        changes.push(
          <div key={key} className="mb-2">
            <span className="font-semibold">{key}:</span>
            {prevVal !== undefined && (
              <div className="ml-4 text-red-600">
                <span className="text-xs">- </span>
                {JSON.stringify(prevVal, null, 2)}
              </div>
            )}
            {currVal !== undefined && (
              <div className="ml-4 text-green-600">
                <span className="text-xs">+ </span>
                {JSON.stringify(currVal, null, 2)}
              </div>
            )}
          </div>
        );
      }
    });

    return changes.length > 0 ? (
      <div className="mt-2 p-2 bg-gray-50 rounded text-sm font-mono">
        {changes}
      </div>
    ) : null;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <p className="text-red-600">Error: {error}</p>
        <button
          onClick={loadHistory}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Configuration History</h3>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status as any)}
              className={`px-3 py-1 text-sm rounded ${
                filter === status
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {changes.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No configuration changes found
        </div>
      ) : (
        <div className="space-y-4">
          {changes.map((change) => (
            <div key={change.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-medium">{formatChangeType(change.changeType)}</span>
                  <span className="ml-2 text-sm text-gray-500">v{change.version}</span>
                  {change.approvalStatus && (
                    <span className="ml-2">
                      {getStatusBadge(change.approvalStatus)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {formatTimestamp(change.timestamp)}
                </span>
              </div>

              <div className="text-sm text-gray-600 mb-2">
                <span>By: {change.changedBy}</span>
                {change.approvedBy && (
                  <span className="ml-4">
                    Approved by: {change.approvedBy} at {formatTimestamp(change.approvalTimestamp!)}
                  </span>
                )}
              </div>

              {change.reason && (
                <div className="mb-2 p-2 bg-blue-50 rounded text-sm">
                  <span className="font-semibold">Reason: </span>
                  {change.reason}
                </div>
              )}

              {change.changeType === 'update' && change.previousValue && (
                <details className="cursor-pointer">
                  <summary className="text-sm text-blue-600 hover:underline">
                    View Changes
                  </summary>
                  {renderDiff(change.previousValue, change.newValue)}
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {changes.length >= limit && (
        <div className="mt-4 text-center">
          <button
            onClick={() => {/* Load more logic */}}
            className="text-blue-600 hover:underline text-sm"
          >
            Load more...
          </button>
        </div>
      )}
    </div>
  );
};