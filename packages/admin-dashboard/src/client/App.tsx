/**
 * Main Dashboard Application Component
 * Capitol Eye Care Staff Dashboard
 */

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from './components/Layout/DashboardLayout';
import { ActiveCallsPanel } from './components/Monitoring/ActiveCallsPanel';
import { EscalationPanel } from './components/Escalations/EscalationPanel';
import { SystemStatusPanel } from './components/Monitoring/SystemStatusPanel';
import { ConversationReplay } from './components/Replay/ConversationReplay';
import { PatientLookup } from './components/Patient/PatientLookup';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuth } from './hooks/useAuth';
import { ActiveCall, Escalation, SystemStatus } from '../types/dashboard';

import './styles/dashboard.css';

interface DashboardState {
  activeCalls: ActiveCall[];
  escalations: Escalation[];
  systemStatus: SystemStatus[];
  selectedCall?: ActiveCall;
  selectedEscalation?: Escalation;
}

export const App: React.FC = () => {
  const { user, isAuthenticated, login, logout } = useAuth();
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    activeCalls: [],
    escalations: [],
    systemStatus: [],
  });
  const [currentView, setCurrentView] = useState<'dashboard' | 'replay' | 'lookup'>('dashboard');

  // WebSocket connection for real-time updates
  const { connected, subscribe, unsubscribe, emit } = useWebSocket(
    process.env.REACT_APP_WS_URL || 'ws://localhost:3001'
  );

  // Subscribe to real-time events
  useEffect(() => {
    if (!connected) return;

    const handleCallStarted = ({ call }: { call: ActiveCall }) => {
      setDashboardState(prev => ({
        ...prev,
        activeCalls: [...prev.activeCalls, call]
      }));
    };

    const handleCallUpdated = ({ callId, updates }: { callId: string; updates: Partial<ActiveCall> }) => {
      setDashboardState(prev => ({
        ...prev,
        activeCalls: prev.activeCalls.map(call =>
          call.callId === callId ? { ...call, ...updates } : call
        )
      }));
    };

    const handleCallEnded = ({ callId }: { callId: string }) => {
      setDashboardState(prev => ({
        ...prev,
        activeCalls: prev.activeCalls.filter(call => call.callId !== callId)
      }));
    };

    const handleNewEscalation = ({ escalation }: { escalation: Escalation }) => {
      setDashboardState(prev => ({
        ...prev,
        escalations: [...prev.escalations, escalation]
      }));

      // Show notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`New ${escalation.priority} Priority Escalation`, {
          body: `Patient: ${escalation.patientInfo.name} - ${escalation.type}`,
          icon: '/favicon.ico'
        });
      }
    };

    const handleEscalationResolved = ({ escalationId }: { escalationId: string }) => {
      setDashboardState(prev => ({
        ...prev,
        escalations: prev.escalations.filter(esc => esc.id !== escalationId)
      }));
    };

    const handleSystemStatus = ({ component, status }: { component: string; status: SystemStatus }) => {
      setDashboardState(prev => ({
        ...prev,
        systemStatus: prev.systemStatus.map(s =>
          s.component === component ? status : s
        )
      }));
    };

    // Subscribe to events
    subscribe('call:started', handleCallStarted);
    subscribe('call:updated', handleCallUpdated);
    subscribe('call:ended', handleCallEnded);
    subscribe('escalation:new', handleNewEscalation);
    subscribe('escalation:resolved', handleEscalationResolved);
    subscribe('system:status', handleSystemStatus);

    return () => {
      unsubscribe('call:started', handleCallStarted);
      unsubscribe('call:updated', handleCallUpdated);
      unsubscribe('call:ended', handleCallEnded);
      unsubscribe('escalation:new', handleNewEscalation);
      unsubscribe('escalation:resolved', handleEscalationResolved);
      unsubscribe('system:status', handleSystemStatus);
    };
  }, [connected, subscribe, unsubscribe]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleSelectCall = (call: ActiveCall) => {
    setDashboardState(prev => ({ ...prev, selectedCall: call }));
  };

  const handleSelectEscalation = (escalation: Escalation) => {
    setDashboardState(prev => ({ ...prev, selectedEscalation: escalation }));
  };

  const handleClaimEscalation = (escalationId: string) => {
    emit('escalation:claim', { escalationId });
  };

  const handleTakeOverCall = (callId: string) => {
    emit('call:takeover', { callId });
  };

  // Show login if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>Capitol Eye Care - Staff Dashboard</h1>
          <p>Please log in to access the monitoring system</p>
          <button onClick={login} className="login-btn">
            Log In with Staff SSO
          </button>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      user={user}
      onLogout={logout}
      onNavigate={setCurrentView}
      currentView={currentView}
      connectionStatus={connected ? 'connected' : 'disconnected'}
    >
      {currentView === 'dashboard' && (
        <div className="dashboard-content">
          {/* Top Status Row */}
          <div className="status-row">
            <SystemStatusPanel
              systemStatus={dashboardState.systemStatus}
              className="status-widget"
            />
            <div className="metric-widget">
              <h3>Active Calls</h3>
              <div className="metric-value">{dashboardState.activeCalls.length}</div>
            </div>
            <EscalationPanel
              escalations={dashboardState.escalations}
              onSelectEscalation={handleSelectEscalation}
              onClaimEscalation={handleClaimEscalation}
              className="escalation-widget"
            />
          </div>

          {/* Main Content Row */}
          <div className="main-content">
            <div className="calls-section">
              <ActiveCallsPanel
                activeCalls={dashboardState.activeCalls}
                selectedCall={dashboardState.selectedCall}
                onSelectCall={handleSelectCall}
                onTakeOverCall={handleTakeOverCall}
              />
            </div>
          </div>

          {/* Recent Escalations */}
          {dashboardState.escalations.length > 0 && (
            <div className="recent-escalations">
              <h3>Recent Escalations</h3>
              {dashboardState.escalations.slice(0, 3).map(escalation => (
                <div key={escalation.id} className={`escalation-item priority-${escalation.priority}`}>
                  <div className="escalation-header">
                    <span className="priority-indicator">
                      {escalation.priority === 1 ? '🔴' :
                       escalation.priority === 2 ? '🟡' :
                       escalation.priority === 3 ? '🟠' : '⚪'}
                    </span>
                    <span className="patient-name">{escalation.patientInfo.name}</span>
                    <span className="escalation-type">{escalation.type.replace('_', ' ')}</span>
                  </div>
                  <div className="escalation-actions">
                    <button
                      onClick={() => handleClaimEscalation(escalation.id)}
                      className="btn-claim"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {currentView === 'replay' && (
        <ConversationReplay />
      )}

      {currentView === 'lookup' && (
        <PatientLookup />
      )}
    </DashboardLayout>
  );
};

export default App;