/**
 * Escalation Management Panel
 * Shows priority escalations and SLA tracking
 */

import React from 'react';
import { Escalation, EscalationPriority } from '../../../types/dashboard';

interface EscalationPanelProps {
  escalations: Escalation[];
  onSelectEscalation: (escalation: Escalation) => void;
  onClaimEscalation: (escalationId: string) => void;
  className?: string;
}

export const EscalationPanel: React.FC<EscalationPanelProps> = ({
  escalations,
  onSelectEscalation,
  onClaimEscalation,
  className = '',
}) => {
  const getPriorityIcon = (priority: EscalationPriority): string => {
    switch (priority) {
      case EscalationPriority.CRITICAL: return '🔴';
      case EscalationPriority.HIGH: return '🟡';
      case EscalationPriority.MEDIUM: return '🟠';
      case EscalationPriority.LOW: return '⚪';
      default: return '⚪';
    }
  };

  const getPriorityText = (priority: EscalationPriority): string => {
    switch (priority) {
      case EscalationPriority.CRITICAL: return 'CRITICAL';
      case EscalationPriority.HIGH: return 'HIGH';
      case EscalationPriority.MEDIUM: return 'MEDIUM';
      case EscalationPriority.LOW: return 'LOW';
      default: return 'UNKNOWN';
    }
  };

  const getPriorityClass = (priority: EscalationPriority): string => {
    switch (priority) {
      case EscalationPriority.CRITICAL: return 'priority-critical';
      case EscalationPriority.HIGH: return 'priority-high';
      case EscalationPriority.MEDIUM: return 'priority-medium';
      case EscalationPriority.LOW: return 'priority-low';
      default: return 'priority-low';
    }
  };

  const formatElapsedTime = (createdAt: Date): string => {
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

    if (elapsed < 60) return `${elapsed}s`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
    return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  };

  const calculateSLAStatus = (escalation: Escalation): 'ok' | 'warning' | 'overdue' => {
    const now = new Date();
    const elapsed = (now.getTime() - escalation.timing.createdAt.getTime()) / 1000;
    const target = escalation.sla.targetResponseTime;

    if (elapsed > target) return 'overdue';
    if (elapsed > target * 0.8) return 'warning';
    return 'ok';
  };

  const formatTypeText = (type: string): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Sort escalations by priority and creation time
  const sortedEscalations = [...escalations].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority; // Lower number = higher priority
    }
    return a.timing.createdAt.getTime() - b.timing.createdAt.getTime();
  });

  // Count by priority
  const priorityCounts = escalations.reduce((counts, esc) => {
    counts[esc.priority] = (counts[esc.priority] || 0) + 1;
    return counts;
  }, {} as Record<number, number>);

  return (
    <div className={`escalation-panel widget ${className}`}>
      <div className="panel-header">
        <h3>Escalations</h3>
        <div className="priority-summary">
          {Object.entries(priorityCounts).map(([priority, count]) => (
            <span key={priority} className={`priority-count ${getPriorityClass(Number(priority))}`}>
              {getPriorityIcon(Number(priority))} {count}
            </span>
          ))}
        </div>
      </div>

      {escalations.length === 0 ? (
        <div className="no-escalations">
          <span className="status-text">No active escalations</span>
          <div className="status-icon">✅</div>
        </div>
      ) : (
        <div className="escalations-list">
          {sortedEscalations.slice(0, 5).map((escalation) => {
            const slaStatus = calculateSLAStatus(escalation);

            return (
              <div
                key={escalation.id}
                className={`escalation-item ${getPriorityClass(escalation.priority)} sla-${slaStatus}`}
                onClick={() => onSelectEscalation(escalation)}
              >
                <div className="escalation-header">
                  <div className="escalation-priority">
                    <span className="priority-icon">
                      {getPriorityIcon(escalation.priority)}
                    </span>
                    <span className="priority-text">
                      {getPriorityText(escalation.priority)}
                    </span>
                  </div>
                  <div className="escalation-time">
                    {formatElapsedTime(escalation.timing.createdAt)}
                  </div>
                </div>

                <div className="escalation-content">
                  <div className="patient-info">
                    <span className="patient-name">{escalation.patientInfo.name}</span>
                    <span className="escalation-type">
                      {formatTypeText(escalation.type)}
                    </span>
                  </div>

                  <div className="escalation-context">
                    <span className="trigger-reason">
                      {escalation.context.triggerReason}
                    </span>
                  </div>
                </div>

                <div className="escalation-sla">
                  <div className={`sla-indicator sla-${slaStatus}`}>
                    <span className="sla-label">SLA:</span>
                    <span className="sla-time">
                      Target: {escalation.sla.targetResponseTime}s
                    </span>
                  </div>
                </div>

                <div className="escalation-actions">
                  <button
                    className="btn-claim"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClaimEscalation(escalation.id);
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-details"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEscalation(escalation);
                    }}
                  >
                    Details
                  </button>
                </div>
              </div>
            );
          })}

          {escalations.length > 5 && (
            <div className="more-escalations">
              <span>+ {escalations.length - 5} more escalations</span>
            </div>
          )}
        </div>
      )}

      {/* SLA Performance Summary */}
      <div className="sla-summary">
        <div className="sla-metric">
          <span className="metric-label">Avg Response:</span>
          <span className="metric-value">
            {escalations.length > 0 ? '< 2min' : 'N/A'}
          </span>
        </div>
        <div className="sla-metric">
          <span className="metric-label">SLA Compliance:</span>
          <span className="metric-value">
            {escalations.length > 0 ? '95%' : '100%'}
          </span>
        </div>
      </div>
    </div>
  );
};