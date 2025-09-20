/**
 * Main Dashboard Layout Component
 * Provides navigation and top-level structure
 */

import React from 'react';

interface User {
  id: string;
  name: string;
  role: string;
  email: string;
}

interface DashboardLayoutProps {
  user: User | null;
  onLogout: () => void;
  onNavigate: (view: 'dashboard' | 'replay' | 'lookup') => void;
  currentView: string;
  connectionStatus: 'connected' | 'disconnected';
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  user,
  onLogout,
  onNavigate,
  currentView,
  connectionStatus,
  children,
}) => {
  return (
    <div className="dashboard-layout">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="app-title">Capitol Eye Care - Staff Dashboard</h1>
            <nav className="main-nav">
              <button
                className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
                onClick={() => onNavigate('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={`nav-btn ${currentView === 'replay' ? 'active' : ''}`}
                onClick={() => onNavigate('replay')}
              >
                Conversation Replay
              </button>
              <button
                className={`nav-btn ${currentView === 'lookup' ? 'active' : ''}`}
                onClick={() => onNavigate('lookup')}
              >
                Patient Lookup
              </button>
            </nav>
          </div>

          <div className="header-right">
            <div className={`connection-indicator ${connectionStatus}`}>
              <div className="connection-dot"></div>
              <span>{connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}</span>
            </div>

            {user && (
              <div className="user-menu">
                <span className="user-name">{user.name}</span>
                <span className="user-role">({user.role})</span>
                <button onClick={onLogout} className="logout-btn">
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  );
};

// CSS for layout (add to dashboard.css)
const layoutStyles = `
.dashboard-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.dashboard-header {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 1rem;
  box-shadow: var(--shadow);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1400px;
  margin: 0 auto;
  height: 64px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.app-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.main-nav {
  display: flex;
  gap: 0.5rem;
}

.nav-btn {
  background: none;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  font-weight: 500;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.nav-btn.active {
  background: var(--primary-color);
  color: white;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}

.connection-indicator.connected {
  background: #dcfce7;
  color: #166534;
}

.connection-indicator.disconnected {
  background: #fee2e2;
  color: #991b1b;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-name {
  font-weight: 600;
  color: var(--text-primary);
}

.user-role {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.logout-btn {
  background: var(--danger-color);
  color: white;
  border: none;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.logout-btn:hover {
  background: #b91c1c;
}

.dashboard-main {
  flex: 1;
  background: var(--bg-secondary);
}
`;