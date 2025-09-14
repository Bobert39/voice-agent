import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { WS_EVENTS } from '@ai-voice-agent/shared-utils';
import { StaffNotification, EscalationPriority } from '@ai-voice-agent/shared-utils';

const logger = createLogger('notification-service');

interface StaffConnection {
  id: string;
  ws: WebSocket;
  staffId: string;
  department: string;
  status: 'available' | 'busy' | 'away';
  connectedAt: Date;
  lastHeartbeat: Date;
}

interface NotificationQueue {
  id: string;
  department: string;
  priority: EscalationPriority;
  event: string;
  data: any;
  createdAt: Date;
  attempts: number;
  delivered: boolean;
}

export class NotificationService {
  private wss: WebSocket.Server;
  private connections: Map<string, StaffConnection>;
  private departmentConnections: Map<string, Set<string>>;
  private notificationQueue: Map<string, NotificationQueue>;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(port: number = 8080) {
    this.connections = new Map();
    this.departmentConnections = new Map();
    this.notificationQueue = new Map();
    
    // Initialize WebSocket server
    this.wss = new WebSocket.Server({ 
      port,
      perMessageDeflate: {
        zlibDeflateOptions: {
          level: 3,
          chunkSize: 1024,
        }
      }
    });

    this.setupWebSocketServer();
    this.startHeartbeat();
    
    logger.info(`Notification service WebSocket server started on port ${port}`);
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      logger.info('New WebSocket connection');

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(ws, data);
        } catch (error) {
          logger.error('Invalid WebSocket message', { error });
          ws.send(JSON.stringify({
            event: WS_EVENTS.ERROR,
            data: { message: 'Invalid message format' }
          }));
        }
      });

      ws.on('close', () => {
        this.handleDisconnection(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error });
        this.handleDisconnection(ws);
      });

      // Send connection acknowledgment
      ws.send(JSON.stringify({
        event: 'connection:established',
        data: { timestamp: new Date().toISOString() }
      }));
    });
  }

  private handleMessage(ws: WebSocket, data: any): void {
    const { event, payload } = data;

    switch (event) {
      case 'staff:register':
        this.registerStaff(ws, payload);
        break;
      
      case 'staff:status_update':
        this.updateStaffStatus(ws, payload);
        break;
      
      case 'escalation:acknowledge':
        this.handleEscalationAcknowledgment(ws, payload);
        break;
      
      case WS_EVENTS.HEARTBEAT:
        this.handleHeartbeat(ws, payload);
        break;
      
      default:
        logger.warn('Unknown WebSocket event', { event });
        ws.send(JSON.stringify({
          event: WS_EVENTS.ERROR,
          data: { message: `Unknown event: ${event}` }
        }));
    }
  }

  private registerStaff(ws: WebSocket, payload: any): void {
    const { staffId, department, name } = payload;
    
    if (!staffId || !department) {
      ws.send(JSON.stringify({
        event: WS_EVENTS.ERROR,
        data: { message: 'staffId and department are required' }
      }));
      return;
    }

    const connectionId = uuidv4();
    const connection: StaffConnection = {
      id: connectionId,
      ws,
      staffId,
      department,
      status: 'available',
      connectedAt: new Date(),
      lastHeartbeat: new Date()
    };

    this.connections.set(connectionId, connection);
    
    // Add to department connections
    if (!this.departmentConnections.has(department)) {
      this.departmentConnections.set(department, new Set());
    }
    this.departmentConnections.get(department)!.add(connectionId);

    // Notify successful registration
    ws.send(JSON.stringify({
      event: WS_EVENTS.STAFF_CONNECTED,
      data: {
        connectionId,
        staffId,
        department,
        status: 'available'
      }
    }));

    // Broadcast staff connection to department
    this.broadcastToDepartment(department, WS_EVENTS.STAFF_CONNECTED, {
      staffId,
      department,
      name,
      connectedAt: connection.connectedAt
    }, [connectionId]);

    logger.info('Staff registered', { staffId, department, connectionId });
  }

  private updateStaffStatus(ws: WebSocket, payload: any): void {
    const { status } = payload;
    const connection = this.findConnectionByWs(ws);
    
    if (!connection) {
      logger.warn('Status update from unregistered connection');
      return;
    }

    if (!['available', 'busy', 'away'].includes(status)) {
      ws.send(JSON.stringify({
        event: WS_EVENTS.ERROR,
        data: { message: 'Invalid status' }
      }));
      return;
    }

    connection.status = status;

    // Broadcast status update to department
    this.broadcastToDepartment(
      connection.department,
      WS_EVENTS.STAFF_STATUS_UPDATE,
      {
        staffId: connection.staffId,
        status: connection.status,
        updatedAt: new Date()
      }
    );

    logger.info('Staff status updated', {
      staffId: connection.staffId,
      status: connection.status
    });
  }

  private handleEscalationAcknowledgment(ws: WebSocket, payload: any): void {
    const { escalationId } = payload;
    const connection = this.findConnectionByWs(ws);
    
    if (!connection) {
      logger.warn('Escalation acknowledgment from unregistered connection');
      return;
    }

    // This would typically trigger the escalation manager
    logger.info('Escalation acknowledged via WebSocket', {
      escalationId,
      staffId: connection.staffId
    });

    // Send acknowledgment confirmation
    ws.send(JSON.stringify({
      event: 'escalation:acknowledged',
      data: {
        escalationId,
        acknowledgedBy: connection.staffId,
        acknowledgedAt: new Date()
      }
    }));
  }

  private handleHeartbeat(ws: WebSocket, payload: any): void {
    const connection = this.findConnectionByWs(ws);
    if (connection) {
      connection.lastHeartbeat = new Date();
      ws.send(JSON.stringify({
        event: WS_EVENTS.HEARTBEAT,
        data: { timestamp: connection.lastHeartbeat }
      }));
    }
  }

  private handleDisconnection(ws: WebSocket): void {
    const connection = this.findConnectionByWs(ws);
    if (connection) {
      // Remove from department connections
      const departmentSet = this.departmentConnections.get(connection.department);
      if (departmentSet) {
        departmentSet.delete(connection.id);
        if (departmentSet.size === 0) {
          this.departmentConnections.delete(connection.department);
        }
      }

      // Remove connection
      this.connections.delete(connection.id);

      // Broadcast disconnection to department
      this.broadcastToDepartment(
        connection.department,
        WS_EVENTS.STAFF_DISCONNECTED,
        {
          staffId: connection.staffId,
          disconnectedAt: new Date()
        }
      );

      logger.info('Staff disconnected', {
        staffId: connection.staffId,
        department: connection.department,
        connectionId: connection.id
      });
    }
  }

  /**
   * Public API methods
   */

  public async notifyDepartment(
    department: string,
    event: string,
    data: any,
    priority: EscalationPriority = EscalationPriority.NORMAL
  ): Promise<boolean> {
    const departmentConnections = this.departmentConnections.get(department);
    
    if (!departmentConnections || departmentConnections.size === 0) {
      logger.warn('No connections available for department', { department });
      
      // Queue notification for later delivery
      this.queueNotification(department, priority, event, data);
      return false;
    }

    // Send to available staff first, then busy staff if none available
    const connections = Array.from(departmentConnections)
      .map(id => this.connections.get(id))
      .filter(conn => conn?.ws.readyState === WebSocket.OPEN)
      .sort((a, b) => {
        // Priority: available > busy > away
        const statusPriority = { available: 0, busy: 1, away: 2 };
        return (statusPriority[a!.status] || 3) - (statusPriority[b!.status] || 3);
      });

    if (connections.length === 0) {
      logger.warn('No active connections for department', { department });
      this.queueNotification(department, priority, event, data);
      return false;
    }

    let delivered = false;
    for (const connection of connections) {
      if (connection) {
        try {
          connection.ws.send(JSON.stringify({ event, data }));
          delivered = true;
          logger.info('Notification sent to staff', {
            staffId: connection.staffId,
            department,
            event
          });
        } catch (error) {
          logger.error('Failed to send notification', {
            staffId: connection.staffId,
            error
          });
        }
      }
    }

    return delivered;
  }

  public async broadcast(event: string, data: any): Promise<void> {
    const message = JSON.stringify({ event, data });
    
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(message);
        } catch (error) {
          logger.error('Failed to broadcast message', {
            staffId: connection.staffId,
            error
          });
        }
      }
    }
  }

  public getDepartmentStatus(department: string): {
    totalStaff: number;
    availableStaff: number;
    busyStaff: number;
    awayStaff: number;
  } {
    const departmentConnections = this.departmentConnections.get(department);
    if (!departmentConnections) {
      return { totalStaff: 0, availableStaff: 0, busyStaff: 0, awayStaff: 0 };
    }

    let totalStaff = 0;
    let availableStaff = 0;
    let busyStaff = 0;
    let awayStaff = 0;

    for (const connectionId of departmentConnections) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        totalStaff++;
        switch (connection.status) {
          case 'available':
            availableStaff++;
            break;
          case 'busy':
            busyStaff++;
            break;
          case 'away':
            awayStaff++;
            break;
        }
      }
    }

    return { totalStaff, availableStaff, busyStaff, awayStaff };
  }

  /**
   * Private helper methods
   */

  private findConnectionByWs(ws: WebSocket): StaffConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.ws === ws) {
        return connection;
      }
    }
    return undefined;
  }

  private broadcastToDepartment(
    department: string,
    event: string,
    data: any,
    excludeConnections: string[] = []
  ): void {
    const departmentConnections = this.departmentConnections.get(department);
    if (!departmentConnections) return;

    const message = JSON.stringify({ event, data });

    for (const connectionId of departmentConnections) {
      if (excludeConnections.includes(connectionId)) continue;
      
      const connection = this.connections.get(connectionId);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(message);
        } catch (error) {
          logger.error('Failed to broadcast to department', {
            staffId: connection.staffId,
            department,
            error
          });
        }
      }
    }
  }

  private queueNotification(
    department: string,
    priority: EscalationPriority,
    event: string,
    data: any
  ): void {
    const notification: NotificationQueue = {
      id: uuidv4(),
      department,
      priority,
      event,
      data,
      createdAt: new Date(),
      attempts: 0,
      delivered: false
    };

    this.notificationQueue.set(notification.id, notification);
    logger.info('Notification queued', { 
      notificationId: notification.id,
      department,
      priority 
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const staleConnections: string[] = [];

      for (const [connectionId, connection] of this.connections.entries()) {
        const timeSinceHeartbeat = now.getTime() - connection.lastHeartbeat.getTime();
        
        // Mark connection as stale if no heartbeat for 60 seconds
        if (timeSinceHeartbeat > 60000) {
          staleConnections.push(connectionId);
        }
      }

      // Remove stale connections
      for (const connectionId of staleConnections) {
        const connection = this.connections.get(connectionId);
        if (connection) {
          logger.warn('Removing stale connection', {
            staffId: connection.staffId,
            connectionId
          });
          this.handleDisconnection(connection.ws);
        }
      }

      // Process queued notifications
      this.processQueuedNotifications();
    }, 30000); // Run every 30 seconds
  }

  private async processQueuedNotifications(): Promise<void> {
    const now = new Date();
    
    for (const [notificationId, notification] of this.notificationQueue.entries()) {
      // Remove old notifications (older than 1 hour)
      if (now.getTime() - notification.createdAt.getTime() > 3600000) {
        this.notificationQueue.delete(notificationId);
        continue;
      }

      // Skip if too many attempts
      if (notification.attempts >= 3) continue;

      // Try to deliver
      const delivered = await this.notifyDepartment(
        notification.department,
        notification.event,
        notification.data,
        notification.priority
      );

      if (delivered) {
        notification.delivered = true;
        this.notificationQueue.delete(notificationId);
        logger.info('Queued notification delivered', { notificationId });
      } else {
        notification.attempts++;
      }
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down notification service');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }
}