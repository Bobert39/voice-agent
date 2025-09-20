/**
 * Active Calls Monitoring Panel
 * Shows real-time active calls with patient details
 */

import React from 'react';
import { ActiveCall } from '../../types/dashboard';

interface ActiveCallsPanelProps {
  activeCalls: ActiveCall[];
  selectedCall?: ActiveCall;
  onSelectCall: (call: ActiveCall) => void;
  onTakeOverCall: (callId: string) => void;
}

export const ActiveCallsPanel: React.FC<ActiveCallsPanelProps> = ({
  activeCalls,
  selectedCall,
  onSelectCall,
  onTakeOverCall,
}) => {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStateColor = (state: ActiveCall['currentState']): string => {
    switch (state) {
      case 'greeting': return 'state-greeting';
      case 'verification': return 'state-verification';
      case 'inquiry': return 'state-inquiry';
      case 'scheduling': return 'state-scheduling';
      case 'closing': return 'state-closing';
      default: return 'state-greeting';
    }
  };

  const getRiskColor = (risk: ActiveCall['escalationRisk']): string => {
    switch (risk) {
      case 'high': return 'risk-high';
      case 'medium': return 'risk-medium';
      case 'low': return 'risk-low';
      default: return 'risk-low';
    }
  };

  return (
    <div className="calls-panel widget">
      <div className="panel-header">
        <h3>Active Calls ({activeCalls.length})</h3>
        {activeCalls.length === 0 && (
          <span className="status-text">No active calls</span>
        )}
      </div>

      <div className="calls-container">
        <div className="call-list">
          {activeCalls.map((call) => (
            <div
              key={call.callId}
              className={`call-item ${selectedCall?.callId === call.callId ? 'selected' : ''}`}
              onClick={() => onSelectCall(call)}
            >
              <div className="call-header">
                <div className="call-patient">
                  <div className="patient-name">{call.patientName}</div>
                  <div className="patient-mrn">MRN: {call.patientMRN}</div>
                </div>
                <div className="call-duration">{formatDuration(call.callDuration)}</div>
              </div>

              <div className="call-status">
                <span className={`call-state ${getStateColor(call.currentState)}`}>
                  {call.currentState.charAt(0).toUpperCase() + call.currentState.slice(1)}
                </span>
                <span className={`risk-indicator ${getRiskColor(call.escalationRisk)}`}>
                  {call.escalationRisk.toUpperCase()} RISK
                </span>
              </div>

              <div className="call-metrics">
                <div className="ai-confidence">
                  <span className="metric-label">AI Confidence:</span>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${call.aiConfidence}%` }}
                    ></div>
                  </div>
                  <span className="confidence-value">{call.aiConfidence}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Call Details Panel */}
        {selectedCall && (
          <div className="call-details">
            <h4>Call Details</h4>

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Patient:</span>
                <span className="detail-value">{selectedCall.patientName}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">MRN:</span>
                <span className="detail-value">{selectedCall.patientMRN}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Duration:</span>
                <span className="detail-value">{formatDuration(selectedCall.callDuration)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">State:</span>
                <span className={`detail-value call-state ${getStateColor(selectedCall.currentState)}`}>
                  {selectedCall.currentState}
                </span>
              </div>
            </div>

            <div className="call-actions">
              {selectedCall.audioStreamUrl && (
                <button className="btn-listen">
                  🎧 Listen Live
                </button>
              )}
              <button
                className="btn-takeover"
                onClick={() => onTakeOverCall(selectedCall.callId)}
              >
                📞 Take Over Call
              </button>
            </div>

            {/* Live Transcript Preview */}
            <div className="live-transcript">
              <h5>Live Transcript</h5>
              <div className="transcript-preview">
                <div className="transcript-entry ai">
                  <span className="speaker">AI:</span>
                  <span className="text">Can you please confirm your date of birth for verification?</span>
                </div>
                <div className="transcript-entry patient">
                  <span className="speaker">Patient:</span>
                  <span className="text typing">...</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};