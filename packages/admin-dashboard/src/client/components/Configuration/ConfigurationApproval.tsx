import React, { useState, useEffect } from 'react';
import { Configuration } from './ConfigurationPanel';

export interface PendingApproval {
  id: string;
  configurationId: string;
  configurationType: string;
  configurationName: string;
  changeType: 'create' | 'update' | 'delete';
  previousValue: Record<string, any> | null;
  proposedValue: Record<string, any>;
  requestedBy: string;
  requestedAt: Date;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  impactAnalysis?: string;
  reviewNotes?: string;
}

export interface ConfigurationApprovalProps {
  onApprove?: (approval: PendingApproval, notes?: string) => void;
  onReject?: (approval: PendingApproval, reason: string) => void;
  className?: string;
}

export const ConfigurationApproval: React.FC<ConfigurationApprovalProps> = ({
  onApprove,
  onReject,
  className = ''
}) => {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high' | 'critical'>('all');

  useEffect(() => {
    loadPendingApprovals();
    // Set up polling for real-time updates
    const interval = setInterval(loadPendingApprovals, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [filter]);

  const loadPendingApprovals = async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = filter !== 'all' ? `?urgency=${filter}` : '';
      const response = await fetch(`/api/config/approvals/pending${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load pending approvals: ${response.statusText}`);
      }

      const data = await response.json();
      setPendingApprovals(data.approvals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending approvals');
      console.error('Error loading pending approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (approval: PendingApproval) => {
    try {
      const response = await fetch(`/api/config/approvals/${approval.id}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: approvalNotes,
          timestamp: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to approve configuration: ${response.statusText}`);
      }

      // Remove from pending list
      setPendingApprovals(prev => prev.filter(a => a.id !== approval.id));
      setSelectedApproval(null);
      setApprovalNotes('');

      // Call parent callback if provided
      if (onApprove) {
        onApprove(approval, approvalNotes);
      }

      // Show success notification
      alert('Configuration change approved successfully');
    } catch (err) {
      alert(`Error approving configuration: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleReject = async (approval: PendingApproval) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      const response = await fetch(`/api/config/approvals/${approval.id}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: rejectionReason,
          timestamp: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to reject configuration: ${response.statusText}`);
      }

      // Remove from pending list
      setPendingApprovals(prev => prev.filter(a => a.id !== approval.id));
      setSelectedApproval(null);
      setRejectionReason('');
      setShowRejectModal(false);

      // Call parent callback if provided
      if (onReject) {
        onReject(approval, rejectionReason);
      }

      // Show success notification
      alert('Configuration change rejected');
    } catch (err) {
      alert(`Error rejecting configuration: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    const badgeStyles: Record<string, string> = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`px-2 py-1 text-xs rounded-full font-semibold ${badgeStyles[urgency] || 'bg-gray-100 text-gray-800'}`}>
        {urgency.toUpperCase()}
      </span>
    );
  };

  const formatTimestamp = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderDiff = (previous: any, proposed: any) => {
    if (!previous) {
      return (
        <div className="mt-2 p-3 bg-green-50 rounded">
          <span className="text-sm font-semibold text-green-700">New Configuration</span>
          <pre className="mt-2 text-xs overflow-x-auto">
            {JSON.stringify(proposed, null, 2)}
          </pre>
        </div>
      );
    }

    const changes: JSX.Element[] = [];
    const allKeys = new Set([...Object.keys(previous), ...Object.keys(proposed)]);

    allKeys.forEach(key => {
      const prevVal = previous[key];
      const propVal = proposed[key];

      if (JSON.stringify(prevVal) !== JSON.stringify(propVal)) {
        changes.push(
          <div key={key} className="mb-2">
            <span className="font-semibold text-sm">{key}:</span>
            <div className="ml-4 grid grid-cols-2 gap-4">
              <div className="bg-red-50 p-2 rounded">
                <span className="text-xs text-red-600">Previous:</span>
                <pre className="text-xs mt-1">{JSON.stringify(prevVal, null, 2)}</pre>
              </div>
              <div className="bg-green-50 p-2 rounded">
                <span className="text-xs text-green-600">Proposed:</span>
                <pre className="text-xs mt-1">{JSON.stringify(propVal, null, 2)}</pre>
              </div>
            </div>
          </div>
        );
      }
    });

    return (
      <div className="mt-2 p-3 bg-gray-50 rounded">
        <span className="text-sm font-semibold">Configuration Changes</span>
        <div className="mt-2">{changes}</div>
      </div>
    );
  };

  if (loading && pendingApprovals.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Pending Approvals
          {pendingApprovals.length > 0 && (
            <span className="ml-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
              {pendingApprovals.length}
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          {['all', 'high', 'critical'].map((urgency) => (
            <button
              key={urgency}
              onClick={() => setFilter(urgency as any)}
              className={`px-3 py-1 text-sm rounded ${
                filter === urgency
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">Error: {error}</p>
          <button
            onClick={loadPendingApprovals}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {pendingApprovals.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
          <p>No pending configuration approvals</p>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Show all approvals
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Approval List */}
          <div className="space-y-3">
            {pendingApprovals.map((approval) => (
              <div
                key={approval.id}
                onClick={() => setSelectedApproval(approval)}
                className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                  selectedApproval?.id === approval.id
                    ? 'border-blue-500 shadow-md bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{approval.configurationName}</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      Type: {approval.configurationType.replace(/_/g, ' ')}
                    </p>
                  </div>
                  {getUrgencyBadge(approval.urgency)}
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <p>Requested by: {approval.requestedBy}</p>
                  <p>On: {formatTimestamp(approval.requestedAt)}</p>
                  <p className="text-blue-600 font-medium">
                    Action: {approval.changeType.charAt(0).toUpperCase() + approval.changeType.slice(1)}
                  </p>
                </div>

                {approval.reason && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                    <span className="font-semibold">Reason: </span>
                    {approval.reason}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Approval Details */}
          {selectedApproval && (
            <div className="border rounded-lg p-4 bg-white">
              <h4 className="font-semibold mb-3">Approval Details</h4>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Configuration</label>
                  <p className="text-sm">{selectedApproval.configurationName}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Change Type</label>
                  <p className="text-sm">{selectedApproval.changeType}</p>
                </div>

                {selectedApproval.impactAnalysis && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Impact Analysis</label>
                    <p className="text-sm p-2 bg-yellow-50 rounded">{selectedApproval.impactAnalysis}</p>
                  </div>
                )}

                {renderDiff(selectedApproval.previousValue, selectedApproval.proposedValue)}

                <div>
                  <label className="text-sm font-medium text-gray-700">Approval Notes (Optional)</label>
                  <textarea
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    className="w-full mt-1 p-2 border rounded text-sm"
                    rows={3}
                    placeholder="Add any notes about this approval..."
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t">
                  <button
                    onClick={() => handleApprove(selectedApproval)}
                    className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && selectedApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Reject Configuration Change</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting this configuration change.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full p-2 border rounded text-sm"
              rows={4}
              placeholder="Rejection reason..."
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => handleReject(selectedApproval)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Confirm Rejection
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};