/**
 * WebSocket Server for Real-Time Dashboard Updates
 * Alternative to GraphQL subscriptions for direct WebSocket communication
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { ActiveCall, Escalation, SystemStatus, DashboardEvents, StaffActions } from '../types/dashboard';

interface AuthenticatedSocket {
  id: string;
  userId?: string;
  userRole?: string;
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: <K extends keyof DashboardEvents>(event: K, data: DashboardEvents[K]) => void;
  on: <K extends keyof StaffActions>(event: K, handler: (data: StaffActions[K]) => void) => void;
}

export class DashboardWebSocketServer {
  private io: SocketIOServer;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private escalations: Map<string, Escalation> = new Map();
  private systemStatus: SystemStatus[] = [];

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io',
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.initializeSystemStatus();
    this.startSimulation();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
          // For demo purposes, allow connection without token
          console.log('WebSocket connection without token, allowing for demo');
          return next();
        }

        // In production, verify JWT token
        // const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        // socket.userId = decoded.userId;
        // socket.userRole = decoded.role;

        // For demo, set mock user
        (socket as any).userId = 'user-001';
        (socket as any).userRole = 'supervisor';

        next();
      } catch (error) {
        console.error('WebSocket auth error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: any) => {
      console.log(`Client connected: ${socket.id}`);

      // Join dashboard room for receiving updates
      socket.join('dashboard');

      // Send initial data
      this.sendInitialData(socket);

      // Handle staff actions
      this.handleStaffActions(socket);

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });

      // Handle ping/pong for keepalive
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });
  }

  private sendInitialData(socket: AuthenticatedSocket) {
    // Send current active calls
    socket.emit('call:initial', {
      activeCalls: Array.from(this.activeCalls.values()),
    });

    // Send current escalations
    socket.emit('escalation:initial', {
      escalations: Array.from(this.escalations.values()),
    });

    // Send system status
    socket.emit('system:initial', {
      systemStatus: this.systemStatus,
    });
  }

  private handleStaffActions(socket: AuthenticatedSocket) {
    // Escalation actions
    socket.on('escalation:claim', (data: { escalationId: string }) => {
      const escalation = this.escalations.get(data.escalationId);
      if (escalation) {
        escalation.timing.assignedTo = socket.userId || 'unknown-staff';
        escalation.timing.acknowledgedAt = new Date();

        this.escalations.set(data.escalationId, escalation);

        // Broadcast update
        this.io.to('dashboard').emit('escalation:claimed', {
          escalationId: data.escalationId,
          staffId: socket.userId || 'unknown-staff',
        });
      }
    });

    socket.on('escalation:reassign', (data: { escalationId: string; newStaffId: string }) => {
      const escalation = this.escalations.get(data.escalationId);
      if (escalation) {
        escalation.timing.assignedTo = data.newStaffId;

        this.escalations.set(data.escalationId, escalation);

        // Broadcast update
        this.io.to('dashboard').emit('escalation:reassigned', data);
      }
    });

    // Call actions
    socket.on('call:monitor', (data: { callId: string }) => {
      console.log(`Staff ${socket.userId} monitoring call ${data.callId}`);
      // In production, this would set up call monitoring
    });

    socket.on('call:takeover', (data: { callId: string }) => {
      console.log(`Staff ${socket.userId} taking over call ${data.callId}`);

      // Remove call from active calls (simulating transfer)
      if (this.activeCalls.has(data.callId)) {
        this.activeCalls.delete(data.callId);

        // Broadcast call ended
        this.io.to('dashboard').emit('call:ended', {
          callId: data.callId,
          outcome: {
            outcome: 'transferred',
            appointmentScheduled: false,
            escalationCreated: false,
            duration: 120,
            summary: 'Call transferred to staff',
          },
        });
      }
    });

    // Appointment actions
    socket.on('appointment:override', (data: any) => {
      console.log(`Staff ${socket.userId} overriding appointment:`, data);
      // In production, this would update the appointment in OpenEMR
    });
  }

  private initializeSystemStatus() {
    this.systemStatus = [
      {
        component: 'Voice AI Service',
        status: 'online',
        lastUpdate: new Date(),
        responseTime: 150,
      },
      {
        component: 'OpenEMR Connection',
        status: 'online',
        lastUpdate: new Date(),
        responseTime: 200,
      },
      {
        component: 'Queue System',
        status: 'online',
        lastUpdate: new Date(),
      },
    ];
  }

  private startSimulation() {
    // Simulate new calls
    setInterval(() => {
      if (this.activeCalls.size < 5) { // Limit active calls for demo
        this.simulateNewCall();
      }
    }, 15000); // Every 15 seconds

    // Simulate escalations
    setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance
        this.simulateEscalation();
      }
    }, 45000); // Every 45 seconds

    // Update call durations
    setInterval(() => {
      this.updateCallDurations();
    }, 1000); // Every second

    // Simulate system status changes
    setInterval(() => {
      if (Math.random() > 0.95) { // 5% chance
        this.simulateSystemStatusChange();
      }
    }, 10000); // Every 10 seconds
  }

  private simulateNewCall() {
    const patientNames = ['John Smith', 'Mary Johnson', 'Robert Davis', 'Linda Wilson', 'James Brown'];
    const states: ActiveCall['currentState'][] = ['greeting', 'verification', 'inquiry', 'scheduling'];

    const newCall: ActiveCall = {
      callId: `call-${Date.now()}`,
      patientName: patientNames[Math.floor(Math.random() * patientNames.length)],
      patientMRN: `${Math.floor(Math.random() * 90000) + 10000}`,
      callDuration: 0,
      currentState: states[Math.floor(Math.random() * states.length)],
      aiConfidence: 0.85 + Math.random() * 0.15, // 85-100%
      escalationRisk: Math.random() > 0.8 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low',
    };

    this.activeCalls.set(newCall.callId, newCall);

    // Broadcast new call
    this.io.to('dashboard').emit('call:started', { call: newCall });

    // Simulate call ending after 1-3 minutes
    setTimeout(() => {
      if (this.activeCalls.has(newCall.callId)) {
        this.activeCalls.delete(newCall.callId);

        this.io.to('dashboard').emit('call:ended', {
          callId: newCall.callId,
          outcome: {
            outcome: Math.random() > 0.2 ? 'completed' : 'escalated',
            appointmentScheduled: Math.random() > 0.3,
            escalationCreated: Math.random() > 0.8,
            duration: newCall.callDuration,
            summary: 'Call completed successfully',
          },
        });
      }
    }, 60000 + Math.random() * 120000); // 1-3 minutes
  }

  private simulateEscalation() {
    const types: Escalation['type'][] = [
      'verification_failure',
      'scheduling_conflict',
      'patient_confusion',
      'technical_issue',
    ];

    const priorities = [1, 2, 3, 4]; // 1 = Critical, 4 = Low
    const priority = priorities[Math.floor(Math.random() * priorities.length)];

    const newEscalation: Escalation = {
      id: `esc-${Date.now()}`,
      priority: priority as any,
      type: types[Math.floor(Math.random() * types.length)],
      patientInfo: {
        name: 'Sarah Chen',
        mrn: '98765',
        phone: '(555) 555-5555',
      },
      context: {
        callTranscript: [
          'AI: Can you please verify your date of birth?',
          'Patient: I\'m not sure... let me think...',
          'AI: Take your time. Can you also confirm your address?',
          'Patient: This is confusing...',
        ],
        aiRecommendation: 'Transfer to staff for manual verification',
        triggerReason: priority === 1 ? 'Patient distress detected' : 'Verification failure after multiple attempts',
      },
      timing: {
        createdAt: new Date(),
      },
      sla: {
        targetResponseTime: priority === 1 ? 60 : priority === 2 ? 120 : 300, // 1min, 2min, 5min
        targetResolutionTime: priority === 1 ? 300 : priority === 2 ? 600 : 1800, // 5min, 10min, 30min
      },
    };

    this.escalations.set(newEscalation.id, newEscalation);

    // Broadcast new escalation
    this.io.to('dashboard').emit('escalation:new', { escalation: newEscalation });

    // Auto-resolve some escalations after a delay
    if (Math.random() > 0.5) {
      setTimeout(() => {
        if (this.escalations.has(newEscalation.id)) {
          this.escalations.delete(newEscalation.id);

          this.io.to('dashboard').emit('escalation:resolved', {
            escalationId: newEscalation.id,
            resolution: {
              resolutionType: 'resolved',
              notes: 'Successfully resolved through staff intervention',
              followUpRequired: false,
            },
          });
        }
      }, 30000 + Math.random() * 60000); // 30s - 1.5min
    }
  }

  private updateCallDurations() {
    let updated = false;

    this.activeCalls.forEach((call, callId) => {
      call.callDuration += 1;

      // Occasionally update AI confidence and state
      if (call.callDuration % 10 === 0) {
        const states: ActiveCall['currentState'][] = ['greeting', 'verification', 'inquiry', 'scheduling', 'closing'];
        const currentIndex = states.indexOf(call.currentState);
        if (currentIndex < states.length - 1 && Math.random() > 0.7) {
          call.currentState = states[currentIndex + 1];
          updated = true;
        }

        if (Math.random() > 0.8) {
          call.aiConfidence = Math.max(0.6, call.aiConfidence + (Math.random() - 0.5) * 0.1);
          updated = true;
        }

        this.activeCalls.set(callId, call);
      }
    });

    if (updated) {
      // Broadcast call updates
      this.activeCalls.forEach((call, callId) => {
        this.io.to('dashboard').emit('call:updated', {
          callId,
          updates: call,
        });
      });
    }
  }

  private simulateSystemStatusChange() {
    const componentIndex = Math.floor(Math.random() * this.systemStatus.length);
    const component = this.systemStatus[componentIndex];

    const statuses: SystemStatus['status'][] = ['online', 'degraded', 'offline'];
    const newStatus = statuses[Math.floor(Math.random() * statuses.length)];

    component.status = newStatus;
    component.lastUpdate = new Date();

    if (newStatus === 'degraded') {
      component.responseTime = 500 + Math.random() * 1000;
    } else if (newStatus === 'online') {
      component.responseTime = 100 + Math.random() * 200;
    } else {
      component.responseTime = undefined;
    }

    // Broadcast system status change
    this.io.to('dashboard').emit('system:status', {
      component: component.component,
      status: component,
    });

    // Return to online after some time if degraded/offline
    if (newStatus !== 'online') {
      setTimeout(() => {
        component.status = 'online';
        component.responseTime = 100 + Math.random() * 200;
        component.lastUpdate = new Date();

        this.io.to('dashboard').emit('system:status', {
          component: component.component,
          status: component,
        });
      }, 10000 + Math.random() * 20000); // 10-30 seconds
    }
  }

  public getConnectedClients(): number {
    return this.io.sockets.sockets.size;
  }

  public broadcastToAll<K extends keyof DashboardEvents>(event: K, data: DashboardEvents[K]) {
    this.io.to('dashboard').emit(event, data);
  }
}