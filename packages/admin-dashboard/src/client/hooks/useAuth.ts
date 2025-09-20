/**
 * Authentication Hook
 * Manages staff authentication and role-based access
 */

import { useState, useEffect } from 'react';
import { StaffRole } from '../types/dashboard';

interface User {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  permissions: string[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface UseAuthReturn extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuth = (): UseAuthReturn => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Check for existing session on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('dashboard_token');
        if (!token) {
          setAuthState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        // Validate token with server
        const response = await fetch('/api/auth/validate', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setAuthState({
            user: userData,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } else {
          // Token invalid, clear it
          localStorage.removeItem('dashboard_token');
          setAuthState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Auth validation error:', error);
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to validate authentication',
        }));
      }
    };

    checkAuthStatus();
  }, []);

  const login = async (): Promise<void> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // For demo purposes, simulate SSO login
      // In production, this would redirect to SSO provider

      // Mock successful authentication
      setTimeout(() => {
        const mockUser: User = {
          id: 'user-001',
          name: 'Jane Doe',
          email: 'jane.doe@capitoleyecare.com',
          role: StaffRole.SUPERVISOR,
          permissions: [
            'view_active_calls',
            'listen_to_live_calls',
            'take_over_calls',
            'view_transcripts',
            'modify_appointments',
            'view_audit_logs',
            'configure_system',
            'view_analytics',
          ],
        };

        // Store auth token
        localStorage.setItem('dashboard_token', 'mock-jwt-token');

        setAuthState({
          user: mockUser,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      }, 1000);

      // Production implementation would be:
      // window.location.href = '/api/auth/sso-login';
    } catch (error) {
      console.error('Login error:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Login failed. Please try again.',
      }));
    }
  };

  const logout = (): void => {
    // Clear local storage
    localStorage.removeItem('dashboard_token');

    // Reset auth state
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });

    // In production, might need to call logout endpoint
    // fetch('/api/auth/logout', { method: 'POST' });
  };

  const hasPermission = (permission: string): boolean => {
    return authState.user?.permissions.includes(permission) || false;
  };

  return {
    ...authState,
    login,
    logout,
    hasPermission,
  };
};