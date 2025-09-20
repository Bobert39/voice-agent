/**
 * WebSocket Hook for Real-Time Dashboard Updates
 * Manages WebSocket connection and event subscriptions
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardEvents, StaffActions } from '../types/dashboard';

type EventHandler<T = any> = (data: T) => void;

interface UseWebSocketReturn {
  connected: boolean;
  subscribe: <K extends keyof DashboardEvents>(
    event: K,
    handler: EventHandler<DashboardEvents[K]>
  ) => void;
  unsubscribe: <K extends keyof DashboardEvents>(
    event: K,
    handler: EventHandler<DashboardEvents[K]>
  ) => void;
  emit: <K extends keyof StaffActions>(
    event: K,
    data: StaffActions[K]
  ) => void;
  reconnect: () => void;
}

export const useWebSocket = (url: string): UseWebSocketReturn => {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // Start with 1 second

  const connect = useCallback(() => {
    try {
      // Create WebSocket connection
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        reconnectAttemptsRef.current = 0;

        // Send authentication if token available
        const token = localStorage.getItem('dashboard_token');
        if (token) {
          ws.send(JSON.stringify({
            type: 'auth',
            token: token,
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { type, data } = message;

          // Get handlers for this event type
          const handlers = eventHandlersRef.current.get(type);
          if (handlers) {
            handlers.forEach(handler => {
              try {
                handler(data);
              } catch (error) {
                console.error(`Error in event handler for ${type}:`, error);
              }
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if not a clean close
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }

    setConnected(false);
  }, []);

  const subscribe = useCallback(<K extends keyof DashboardEvents>(
    event: K,
    handler: EventHandler<DashboardEvents[K]>
  ) => {
    const eventName = event as string;

    if (!eventHandlersRef.current.has(eventName)) {
      eventHandlersRef.current.set(eventName, new Set());
    }

    eventHandlersRef.current.get(eventName)!.add(handler);
  }, []);

  const unsubscribe = useCallback(<K extends keyof DashboardEvents>(
    event: K,
    handler: EventHandler<DashboardEvents[K]>
  ) => {
    const eventName = event as string;
    const handlers = eventHandlersRef.current.get(eventName);

    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        eventHandlersRef.current.delete(eventName);
      }
    }
  }, []);

  const emit = useCallback(<K extends keyof StaffActions>(
    event: K,
    data: StaffActions[K]
  ) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = {
        type: event,
        data: data,
        timestamp: new Date().toISOString(),
      };

      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket not connected, cannot send message:', event);
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  // Initialize connection
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    if (!connected) return;

    const heartbeatInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Send ping every 30 seconds

    return () => clearInterval(heartbeatInterval);
  }, [connected]);

  return {
    connected,
    subscribe,
    unsubscribe,
    emit,
    reconnect,
  };
};