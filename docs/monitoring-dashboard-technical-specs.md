# Monitoring Dashboard Technical Specifications
**Version:** 1.0
**Date:** September 17, 2025
**Project:** Capitol Eye Care Voice AI System
**Technical Lead:** IT Director

## Executive Summary

Technical implementation specifications for real-time monitoring dashboard supporting the Escalation SLAs and Monitoring Framework. Includes database schema, API endpoints, WebSocket events, UI components, and security implementation for comprehensive Voice AI system monitoring.

**Key Technical Features:**
- Real-time performance monitoring with <500ms refresh rates
- Multi-channel alerting (Dashboard + Email + SMS + Phone)
- Role-based access control with audit logging
- Automated escalation workflows with customizable thresholds
- Comprehensive analytics and reporting framework

---

## System Architecture Overview

### Technology Stack
- **Frontend:** React 18+ with TypeScript, Material-UI v5
- **Backend:** Node.js with Express, TypeScript
- **Database:** PostgreSQL 14+ with Redis for caching
- **Real-time:** WebSocket (Socket.io) for live updates
- **Notifications:** Twilio (SMS), SendGrid (Email), Twilio Voice (Calls)
- **Monitoring:** Prometheus with Grafana dashboards
- **Security:** JWT authentication, bcrypt password hashing

### Component Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dashboard UI  │◄───┤  WebSocket API  │◄───┤ Monitoring Core │
│   (React/TS)    │    │   (Socket.io)   │    │   (Node.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   REST API      │    │   Database      │    │  Notification   │
│   (Express)     │    │ (PostgreSQL)    │    │   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Service  │    │   Redis Cache   │    │  External APIs  │
│     (JWT)       │    │   (Sessions)    │    │ (Twilio/Email)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## Database Schema Design

### Core Monitoring Tables

```sql
-- SLA Configurations Table
CREATE TABLE sla_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority_level VARCHAR(20) NOT NULL, -- 'critical', 'high', 'normal', 'routine'
    response_time_threshold INTEGER NOT NULL, -- in seconds
    escalation_threshold INTEGER NOT NULL, -- in seconds
    notification_channels JSONB NOT NULL, -- ['dashboard', 'email', 'sms', 'phone']
    auto_escalation_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    CONSTRAINT valid_priority CHECK (priority_level IN ('critical', 'high', 'normal', 'routine')),
    CONSTRAINT positive_thresholds CHECK (response_time_threshold > 0 AND escalation_threshold > 0)
);

-- Performance Metrics Table
CREATE TABLE performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(50) NOT NULL, -- 'response_time', 'voice_accuracy', 'system_availability'
    metric_value DECIMAL(10,4) NOT NULL,
    threshold_green DECIMAL(10,4) NOT NULL,
    threshold_yellow DECIMAL(10,4) NOT NULL,
    threshold_red DECIMAL(10,4) NOT NULL,
    current_status VARCHAR(10) NOT NULL, -- 'green', 'yellow', 'red'
    measurement_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source_system VARCHAR(50) NOT NULL, -- 'voice_ai', 'openemr', 'scheduling'
    additional_context JSONB,

    CONSTRAINT valid_status CHECK (current_status IN ('green', 'yellow', 'red')),
    INDEX idx_metrics_timestamp (measurement_timestamp),
    INDEX idx_metrics_type_status (metric_type, current_status)
);

-- Escalation Events Table
CREATE TABLE escalation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- 'patient_emergency', 'system_failure', 'performance_issue'
    priority_level VARCHAR(20) NOT NULL,
    escalation_source VARCHAR(50) NOT NULL, -- 'voice_ai', 'manual', 'automated'
    patient_id UUID, -- Reference to patient if applicable
    description TEXT NOT NULL,
    context_data JSONB, -- Store call details, system state, etc.
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'assigned', 'in_progress', 'resolved', 'closed'
    assigned_to UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,

    CONSTRAINT valid_priority CHECK (priority_level IN ('critical', 'high', 'normal', 'routine')),
    CONSTRAINT valid_status CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
    INDEX idx_escalation_status_priority (status, priority_level),
    INDEX idx_escalation_created (created_at),
    INDEX idx_escalation_assigned (assigned_to)
);

-- Staff Response Tracking Table
CREATE TABLE staff_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escalation_id UUID NOT NULL REFERENCES escalation_events(id),
    staff_id UUID NOT NULL REFERENCES users(id),
    response_time_seconds INTEGER NOT NULL,
    sla_met BOOLEAN NOT NULL,
    response_type VARCHAR(30) NOT NULL, -- 'acknowledged', 'escalated', 'resolved'
    response_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    response_notes TEXT,
    patient_satisfaction_score INTEGER, -- 1-10 scale

    CONSTRAINT valid_response_time CHECK (response_time_seconds >= 0),
    CONSTRAINT valid_satisfaction CHECK (patient_satisfaction_score IS NULL OR
                                        (patient_satisfaction_score >= 1 AND patient_satisfaction_score <= 10)),
    INDEX idx_response_staff_time (staff_id, response_timestamp),
    INDEX idx_response_sla (sla_met, response_timestamp)
);

-- Alert Notifications Table
CREATE TABLE alert_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escalation_id UUID NOT NULL REFERENCES escalation_events(id),
    notification_type VARCHAR(20) NOT NULL, -- 'dashboard', 'email', 'sms', 'phone'
    recipient_id UUID NOT NULL REFERENCES users(id),
    notification_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    acknowledgment_at TIMESTAMP WITH TIME ZONE,
    notification_content JSONB NOT NULL,
    external_message_id VARCHAR(100), -- For tracking with external services
    retry_count INTEGER DEFAULT 0,

    CONSTRAINT valid_notification_type CHECK (notification_type IN ('dashboard', 'email', 'sms', 'phone')),
    CONSTRAINT valid_status CHECK (notification_status IN ('pending', 'sent', 'delivered', 'failed')),
    INDEX idx_notification_status (notification_status, sent_at),
    INDEX idx_notification_recipient (recipient_id, notification_type)
);

-- System Health Monitoring Table
CREATE TABLE system_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_name VARCHAR(50) NOT NULL, -- 'voice_ai', 'openemr', 'database', 'redis'
    health_status VARCHAR(20) NOT NULL, -- 'healthy', 'warning', 'critical', 'down'
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    network_latency DECIMAL(8,2), -- in milliseconds
    error_rate DECIMAL(5,4), -- percentage
    availability_percentage DECIMAL(5,2),
    last_health_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    health_details JSONB,

    CONSTRAINT valid_health_status CHECK (health_status IN ('healthy', 'warning', 'critical', 'down')),
    CONSTRAINT valid_percentages CHECK (
        (cpu_usage IS NULL OR cpu_usage BETWEEN 0 AND 100) AND
        (memory_usage IS NULL OR memory_usage BETWEEN 0 AND 100) AND
        (disk_usage IS NULL OR disk_usage BETWEEN 0 AND 100) AND
        (availability_percentage IS NULL OR availability_percentage BETWEEN 0 AND 100)
    ),
    INDEX idx_health_component_time (component_name, last_health_check),
    INDEX idx_health_status (health_status, last_health_check)
);
```

### Performance Optimization Indexes

```sql
-- Composite indexes for common queries
CREATE INDEX idx_escalation_priority_status_time ON escalation_events(priority_level, status, created_at);
CREATE INDEX idx_metrics_type_time_status ON performance_metrics(metric_type, measurement_timestamp, current_status);
CREATE INDEX idx_response_staff_sla_time ON staff_responses(staff_id, sla_met, response_timestamp);
CREATE INDEX idx_notifications_recipient_type_status ON alert_notifications(recipient_id, notification_type, notification_status);

-- Partial indexes for active records
CREATE INDEX idx_active_escalations ON escalation_events(created_at, priority_level) WHERE status IN ('open', 'assigned', 'in_progress');
CREATE INDEX idx_pending_notifications ON alert_notifications(sent_at) WHERE notification_status = 'pending';

-- JSONB indexes for metadata queries
CREATE INDEX idx_escalation_context ON escalation_events USING GIN(context_data);
CREATE INDEX idx_health_details ON system_health USING GIN(health_details);
```

---

## API Endpoints Specification

### Authentication & Authorization

```typescript
// JWT Authentication Middleware
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: 'admin' | 'supervisor' | 'staff' | 'readonly';
    permissions: string[];
  };
}

// Role-based access control
const PERMISSIONS = {
  'admin': ['read', 'write', 'configure', 'delete'],
  'supervisor': ['read', 'write', 'escalate'],
  'staff': ['read', 'respond'],
  'readonly': ['read']
};
```

### Core API Endpoints

```typescript
// Escalation Management APIs
interface EscalationAPI {
  // GET /api/escalations - List escalations with filtering
  getEscalations(params: {
    status?: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
    priority?: 'critical' | 'high' | 'normal' | 'routine';
    assignedTo?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    escalations: Escalation[];
    total: number;
    hasMore: boolean;
  }>;

  // POST /api/escalations - Create new escalation
  createEscalation(data: {
    eventType: string;
    priorityLevel: 'critical' | 'high' | 'normal' | 'routine';
    description: string;
    contextData?: Record<string, any>;
    patientId?: string;
  }): Promise<Escalation>;

  // PUT /api/escalations/:id/acknowledge - Acknowledge escalation
  acknowledgeEscalation(id: string, data: {
    responseNotes?: string;
  }): Promise<{ success: boolean; responseTime: number }>;

  // PUT /api/escalations/:id/assign - Assign escalation to staff
  assignEscalation(id: string, data: {
    assignedTo: string;
    notes?: string;
  }): Promise<Escalation>;

  // PUT /api/escalations/:id/resolve - Resolve escalation
  resolveEscalation(id: string, data: {
    resolutionNotes: string;
    patientSatisfactionScore?: number;
  }): Promise<Escalation>;
}

// Performance Monitoring APIs
interface PerformanceAPI {
  // GET /api/performance/metrics - Get current performance metrics
  getCurrentMetrics(): Promise<{
    voiceAI: {
      responseTime: number;
      accuracy: number;
      availability: number;
      status: 'green' | 'yellow' | 'red';
    };
    integrations: {
      openemr: { latency: number; status: string };
      scheduling: { latency: number; status: string };
    };
    infrastructure: {
      cpu: number;
      memory: number;
      disk: number;
      network: number;
    };
  }>;

  // GET /api/performance/history - Get historical performance data
  getPerformanceHistory(params: {
    metricType?: string;
    timeRange: '1h' | '6h' | '24h' | '7d' | '30d';
    granularity: '1m' | '5m' | '15m' | '1h' | '1d';
  }): Promise<{
    timestamps: string[];
    values: number[];
    thresholds: {
      green: number;
      yellow: number;
      red: number;
    };
  }>;

  // POST /api/performance/thresholds - Update performance thresholds
  updateThresholds(data: {
    metricType: string;
    green: number;
    yellow: number;
    red: number;
  }): Promise<{ success: boolean }>;
}

// Staff Response Tracking APIs
interface StaffAPI {
  // GET /api/staff/performance - Get staff performance metrics
  getStaffPerformance(params: {
    staffId?: string;
    timeRange: '1d' | '7d' | '30d';
    includeTeamAverages?: boolean;
  }): Promise<{
    individual: {
      averageResponseTime: Record<string, number>;
      slaCompliance: Record<string, number>;
      resolutionRate: number;
      patientSatisfaction: number;
    };
    team?: {
      averageResponseTime: Record<string, number>;
      slaCompliance: Record<string, number>;
    };
  }>;

  // GET /api/staff/leaderboard - Get staff performance leaderboard
  getLeaderboard(timeRange: '1d' | '7d' | '30d'): Promise<{
    topPerformers: Array<{
      staffId: string;
      name: string;
      averageResponseTime: number;
      slaCompliance: number;
      resolutionCount: number;
    }>;
  }>;
}

// Notification Management APIs
interface NotificationAPI {
  // GET /api/notifications/preferences/:userId - Get notification preferences
  getPreferences(userId: string): Promise<{
    dashboard: boolean;
    email: boolean;
    sms: boolean;
    phone: boolean;
    criticalOnly: boolean;
    quietHours: { start: string; end: string };
  }>;

  // PUT /api/notifications/preferences/:userId - Update notification preferences
  updatePreferences(userId: string, preferences: NotificationPreferences): Promise<{ success: boolean }>;

  // POST /api/notifications/test - Send test notification
  sendTestNotification(data: {
    type: 'dashboard' | 'email' | 'sms' | 'phone';
    recipient: string;
  }): Promise<{ success: boolean; messageId?: string }>;
}
```

---

## WebSocket Events Specification

### Real-Time Event System

```typescript
// WebSocket Event Types
interface WebSocketEvents {
  // Server to Client Events
  'escalation:created': (escalation: Escalation) => void;
  'escalation:updated': (escalation: Escalation) => void;
  'escalation:acknowledged': (data: { escalationId: string; staffId: string; responseTime: number }) => void;
  'escalation:resolved': (escalation: Escalation) => void;

  'performance:updated': (metrics: PerformanceMetrics) => void;
  'performance:threshold_exceeded': (alert: ThresholdAlert) => void;

  'system:health_change': (component: string, status: SystemHealthStatus) => void;
  'system:alert': (alert: SystemAlert) => void;

  'staff:online': (staffId: string) => void;
  'staff:offline': (staffId: string) => void;
  'staff:status_change': (data: { staffId: string; status: 'available' | 'busy' | 'away' }) => void;

  // Client to Server Events
  'escalation:acknowledge': (escalationId: string, callback: (result: { success: boolean; error?: string }) => void) => void;
  'escalation:assign': (data: { escalationId: string; assignedTo: string }, callback: Function) => void;
  'staff:status': (status: 'available' | 'busy' | 'away') => void;
  'dashboard:subscribe': (filters: DashboardFilters) => void;
  'dashboard:unsubscribe': () => void;
}

// WebSocket Connection Management
class WebSocketManager {
  private connections: Map<string, SocketConnection> = new Map();

  // Room-based subscriptions for targeted updates
  subscribeToRoom(socket: Socket, room: string): void {
    socket.join(room);
    this.connections.set(socket.id, { socket, rooms: [room] });
  }

  // Broadcast escalation updates to relevant staff
  broadcastEscalation(escalation: Escalation): void {
    const rooms = this.getRelevantRooms(escalation.priority_level);
    rooms.forEach(room => {
      this.io.to(room).emit('escalation:created', escalation);
    });
  }

  // Send performance updates to monitoring dashboard users
  broadcastPerformanceUpdate(metrics: PerformanceMetrics): void {
    this.io.to('performance_monitoring').emit('performance:updated', metrics);
  }
}
```

### Room-Based Broadcasting Strategy

```typescript
// WebSocket Room Organization
const WEBSOCKET_ROOMS = {
  // Priority-based escalation rooms
  'escalations:critical': ['admin', 'supervisor', 'clinical_staff'],
  'escalations:high': ['admin', 'supervisor', 'staff'],
  'escalations:normal': ['admin', 'supervisor', 'staff'],
  'escalations:routine': ['admin', 'staff'],

  // Monitoring and analytics rooms
  'performance_monitoring': ['admin', 'supervisor'],
  'system_health': ['admin', 'it_staff'],
  'staff_performance': ['admin', 'supervisor'],

  // Department-specific rooms
  'front_desk': ['front_desk_staff', 'supervisor'],
  'clinical': ['clinical_staff', 'medical_director'],
  'administrative': ['admin_staff', 'practice_manager']
};

// Dynamic room assignment based on user role and escalation type
function assignUserToRooms(user: User): string[] {
  const rooms: string[] = [];

  // Base rooms by role
  if (user.role === 'admin') {
    rooms.push('escalations:critical', 'escalations:high', 'performance_monitoring', 'system_health');
  }

  if (user.role === 'supervisor') {
    rooms.push('escalations:critical', 'escalations:high', 'escalations:normal', 'performance_monitoring');
  }

  if (user.role === 'staff') {
    rooms.push('escalations:high', 'escalations:normal', 'escalations:routine');
  }

  // Department-specific rooms
  if (user.department) {
    rooms.push(`department:${user.department}`);
  }

  return rooms;
}
```

---

## Dashboard UI Components

### React Component Architecture

```typescript
// Main Dashboard Component
interface DashboardProps {
  userRole: 'admin' | 'supervisor' | 'staff' | 'readonly';
  permissions: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ userRole, permissions }) => {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [performance, setPerformance] = useState<PerformanceMetrics>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const socket = io('/dashboard', {
      auth: { token: getAuthToken() }
    });

    socket.on('escalation:created', (escalation) => {
      setEscalations(prev => [escalation, ...prev]);
      showNotification(escalation);
    });

    socket.on('performance:updated', setPerformance);

    return () => socket.disconnect();
  }, []);

  return (
    <DashboardLayout>
      <Grid container spacing={3}>
        {/* Real-time Escalations Panel */}
        <Grid item xs={12} md={6}>
          <EscalationPanel
            escalations={escalations}
            onAcknowledge={handleAcknowledge}
            onAssign={handleAssign}
            userRole={userRole}
          />
        </Grid>

        {/* Performance Monitoring Panel */}
        <Grid item xs={12} md={6}>
          <PerformancePanel
            metrics={performance}
            onThresholdUpdate={handleThresholdUpdate}
            canEdit={permissions.includes('configure')}
          />
        </Grid>

        {/* System Health Overview */}
        <Grid item xs={12}>
          <SystemHealthPanel />
        </Grid>

        {/* Staff Performance Analytics */}
        {(userRole === 'admin' || userRole === 'supervisor') && (
          <Grid item xs={12}>
            <StaffPerformancePanel />
          </Grid>
        )}
      </Grid>
    </DashboardLayout>
  );
};

// Escalation Panel Component
interface EscalationPanelProps {
  escalations: Escalation[];
  onAcknowledge: (id: string) => void;
  onAssign: (id: string, staffId: string) => void;
  userRole: string;
}

const EscalationPanel: React.FC<EscalationPanelProps> = ({
  escalations, onAcknowledge, onAssign, userRole
}) => {
  const [filter, setFilter] = useState<EscalationFilter>({
    status: 'open',
    priority: 'all'
  });

  const filteredEscalations = useMemo(() => {
    return escalations.filter(escalation => {
      if (filter.status !== 'all' && escalation.status !== filter.status) return false;
      if (filter.priority !== 'all' && escalation.priority_level !== filter.priority) return false;
      return true;
    });
  }, [escalations, filter]);

  return (
    <Card>
      <CardHeader
        title="Active Escalations"
        action={
          <EscalationFilters
            filter={filter}
            onChange={setFilter}
          />
        }
      />
      <CardContent>
        <List>
          {filteredEscalations.map(escalation => (
            <EscalationItem
              key={escalation.id}
              escalation={escalation}
              onAcknowledge={() => onAcknowledge(escalation.id)}
              onAssign={(staffId) => onAssign(escalation.id, staffId)}
              canAcknowledge={userRole !== 'readonly'}
              canAssign={userRole === 'admin' || userRole === 'supervisor'}
            />
          ))}
        </List>
      </CardContent>
    </Card>
  );
};

// Performance Metrics Component
const PerformancePanel: React.FC<PerformancePanelProps> = ({
  metrics, onThresholdUpdate, canEdit
}) => {
  return (
    <Card>
      <CardHeader title="System Performance" />
      <CardContent>
        <Grid container spacing={2}>
          {/* Voice AI Response Time */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Response Time"
              value={`${metrics.voiceAI?.responseTime || 0}ms`}
              status={getStatusColor(metrics.voiceAI?.responseTime, { green: 2000, yellow: 4000 })}
              trend={metrics.voiceAI?.responseTimeTrend}
            />
          </Grid>

          {/* Voice Recognition Accuracy */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Voice Accuracy"
              value={`${metrics.voiceAI?.accuracy || 0}%`}
              status={getStatusColor(metrics.voiceAI?.accuracy, { green: 95, yellow: 90 })}
              trend={metrics.voiceAI?.accuracyTrend}
            />
          </Grid>

          {/* System Availability */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Availability"
              value={`${metrics.voiceAI?.availability || 0}%`}
              status={getStatusColor(metrics.voiceAI?.availability, { green: 99.9, yellow: 99.5 })}
              trend={metrics.voiceAI?.availabilityTrend}
            />
          </Grid>
        </Grid>

        {/* Real-time Performance Chart */}
        <Box mt={3}>
          <PerformanceChart
            data={metrics.historical}
            timeRange="1h"
            onTimeRangeChange={handleTimeRangeChange}
          />
        </Box>
      </CardContent>
    </Card>
  );
};
```

### Advanced UI Features

```typescript
// Audio/Visual Alert System
class AlertNotificationSystem {
  private audioContext: AudioContext;
  private notificationQueue: Alert[] = [];

  // Play different sounds for different priority levels
  playAlertSound(priority: 'critical' | 'high' | 'normal'): void {
    const frequency = {
      critical: 1000, // High pitch for critical
      high: 800,     // Medium pitch for high
      normal: 600    // Lower pitch for normal
    }[priority];

    this.playTone(frequency, 200); // 200ms duration
  }

  // Visual notification with priority-based styling
  showVisualAlert(alert: Alert): void {
    const notification = new Notification(alert.title, {
      body: alert.message,
      icon: `/icons/${alert.priority}.png`,
      tag: alert.id, // Prevent duplicate notifications
      requireInteraction: alert.priority === 'critical',
      actions: [
        { action: 'acknowledge', title: 'Acknowledge' },
        { action: 'view', title: 'View Details' }
      ]
    });

    notification.onclick = () => this.handleNotificationClick(alert);
  }

  // Browser notification with action buttons
  requestNotificationPermission(): Promise<boolean> {
    return Notification.requestPermission()
      .then(permission => permission === 'granted');
  }
}

// Advanced Filtering and Search
interface AdvancedFilters {
  dateRange: { start: Date; end: Date };
  staff: string[];
  priority: string[];
  status: string[];
  searchTerm: string;
  sortBy: 'created_at' | 'response_time' | 'priority';
  sortDirection: 'asc' | 'desc';
}

const AdvancedFilterPanel: React.FC<{
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
}> = ({ filters, onChange }) => {
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <DateRangePicker
            label="Date Range"
            value={[filters.dateRange.start, filters.dateRange.end]}
            onChange={(dates) => onChange({
              ...filters,
              dateRange: { start: dates[0], end: dates[1] }
            })}
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <MultiSelect
            label="Staff Members"
            options={staffOptions}
            value={filters.staff}
            onChange={(staff) => onChange({ ...filters, staff })}
          />
        </Grid>

        <Grid item xs={12} md={2}>
          <MultiSelect
            label="Priority"
            options={priorityOptions}
            value={filters.priority}
            onChange={(priority) => onChange({ ...filters, priority })}
          />
        </Grid>

        <Grid item xs={12} md={2}>
          <MultiSelect
            label="Status"
            options={statusOptions}
            value={filters.status}
            onChange={(status) => onChange({ ...filters, status })}
          />
        </Grid>

        <Grid item xs={12} md={2}>
          <TextField
            label="Search"
            value={filters.searchTerm}
            onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
            InputProps={{
              startAdornment: <SearchIcon />
            }}
          />
        </Grid>
      </Grid>
    </Paper>
  );
};
```

---

## Notification System Implementation

### Multi-Channel Notification Service

```typescript
// Notification Service Architecture
interface NotificationService {
  dashboard: DashboardNotificationService;
  email: EmailNotificationService;
  sms: SMSNotificationService;
  phone: PhoneNotificationService;
}

// Email Notification Implementation
class EmailNotificationService {
  private sendgrid: SendGridAPI;
  private templates: Map<string, EmailTemplate>;

  async sendEscalationAlert(escalation: Escalation, recipients: User[]): Promise<void> {
    const template = this.templates.get(`escalation_${escalation.priority_level}`);

    const emailData = {
      template_id: template.id,
      personalizations: recipients.map(recipient => ({
        to: [{ email: recipient.email, name: recipient.name }],
        dynamic_template_data: {
          escalation_id: escalation.id,
          priority: escalation.priority_level,
          description: escalation.description,
          patient_id: escalation.patient_id,
          created_at: escalation.created_at,
          dashboard_link: `${process.env.DASHBOARD_URL}/escalations/${escalation.id}`,
          acknowledge_link: `${process.env.API_URL}/escalations/${escalation.id}/acknowledge?token=${recipient.quick_action_token}`
        }
      }))
    };

    await this.sendgrid.send(emailData);
  }

  async sendPerformanceAlert(metric: PerformanceMetric, recipients: User[]): Promise<void> {
    const template = this.templates.get('performance_alert');

    const emailData = {
      template_id: template.id,
      personalizations: recipients.map(recipient => ({
        to: [{ email: recipient.email, name: recipient.name }],
        dynamic_template_data: {
          metric_type: metric.type,
          current_value: metric.value,
          threshold: metric.threshold,
          status: metric.status,
          trend: metric.trend,
          dashboard_link: `${process.env.DASHBOARD_URL}/performance`
        }
      }))
    };

    await this.sendgrid.send(emailData);
  }
}

// SMS Notification Implementation
class SMSNotificationService {
  private twilio: TwilioAPI;
  private templates: Map<string, SMSTemplate>;

  async sendEscalationAlert(escalation: Escalation, recipients: User[]): Promise<void> {
    const template = this.templates.get(`sms_escalation_${escalation.priority_level}`);

    const promises = recipients.map(async (recipient) => {
      if (!recipient.phone || !recipient.sms_enabled) return;

      const message = template.format({
        priority: escalation.priority_level.toUpperCase(),
        id: escalation.id.substring(0, 8),
        description: escalation.description.substring(0, 100),
        time: formatTime(escalation.created_at),
        link: `${process.env.DASHBOARD_URL}/m/${escalation.id}` // Mobile-optimized link
      });

      return this.twilio.messages.create({
        body: message,
        to: recipient.phone,
        from: process.env.TWILIO_PHONE_NUMBER
      });
    });

    await Promise.allSettled(promises);
  }
}

// Phone Call Escalation Service
class PhoneNotificationService {
  private twilio: TwilioAPI;
  private voiceTemplates: Map<string, VoiceTemplate>;

  async makeEscalationCall(escalation: Escalation, recipient: User): Promise<void> {
    if (escalation.priority_level !== 'critical') return; // Only for critical escalations

    const template = this.voiceTemplates.get('critical_escalation');
    const twiml = template.generate({
      priority: 'CRITICAL',
      description: escalation.description,
      patient_info: escalation.patient_id ? 'Patient involved' : 'System issue',
      callback_number: process.env.EMERGENCY_CALLBACK_NUMBER
    });

    await this.twilio.calls.create({
      twiml: twiml.toString(),
      to: recipient.phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      timeout: 30,
      record: true, // Record for compliance
      statusCallback: `${process.env.API_URL}/webhooks/call-status`,
      statusCallbackEvent: ['initiated', 'answered', 'completed']
    });
  }
}
```

### Notification Templates

```typescript
// Email Templates (SendGrid Dynamic Templates)
const EMAIL_TEMPLATES = {
  escalation_critical: {
    id: 'd-1234567890abcdef',
    subject: '🚨 CRITICAL: Voice AI Emergency - Immediate Action Required',
    content: `
      <h2 style="color: #d32f2f;">Critical Escalation Alert</h2>
      <p><strong>Time:</strong> {{created_at}}</p>
      <p><strong>Priority:</strong> <span style="color: #d32f2f; font-weight: bold;">{{priority}}</span></p>
      <p><strong>Description:</strong> {{description}}</p>
      <p><strong>Patient ID:</strong> {{patient_id}}</p>

      <div style="margin: 20px 0;">
        <a href="{{acknowledge_link}}" style="background: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
          Acknowledge Immediately
        </a>
        <a href="{{dashboard_link}}" style="background: #424242; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-left: 10px;">
          View in Dashboard
        </a>
      </div>

      <p style="color: #666; font-size: 12px;">Response required within 2 minutes. This alert will escalate if not acknowledged.</p>
    `
  },

  performance_alert: {
    id: 'd-fedcba0987654321',
    subject: '⚠️ Performance Alert: {{metric_type}} threshold exceeded',
    content: `
      <h2 style="color: #f57c00;">Performance Threshold Alert</h2>
      <p><strong>Metric:</strong> {{metric_type}}</p>
      <p><strong>Current Value:</strong> {{current_value}}</p>
      <p><strong>Threshold:</strong> {{threshold}}</p>
      <p><strong>Status:</strong> <span style="color: #f57c00;">{{status}}</span></p>
      <p><strong>Trend:</strong> {{trend}}</p>

      <div style="margin: 20px 0;">
        <a href="{{dashboard_link}}" style="background: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
          View Performance Dashboard
        </a>
      </div>
    `
  }
};

// SMS Templates
const SMS_TEMPLATES = {
  sms_escalation_critical: new SMSTemplate(`
🚨 CRITICAL ALERT
Priority: {priority}
ID: {id}
Issue: {description}
Time: {time}
Respond: {link}
`),

  sms_escalation_high: new SMSTemplate(`
⚠️ HIGH PRIORITY
Priority: {priority}
ID: {id}
Issue: {description}
Time: {time}
Dashboard: {link}
`)
};

// Voice Templates (TwiML)
const VOICE_TEMPLATES = {
  critical_escalation: new VoiceTemplate(`
    <Response>
      <Say voice="woman" language="en-US" rate="slow">
        Critical escalation alert for Capitol Eye Care Voice AI system.
        Priority: {priority}.
        Issue: {description}.
        {patient_info}.
        Please call {callback_number} immediately to respond.
        This message will repeat once.
      </Say>
      <Pause length="2"/>
      <Say voice="woman" language="en-US" rate="slow">
        Critical escalation alert for Capitol Eye Care Voice AI system.
        Priority: {priority}.
        Please call {callback_number} immediately.
      </Say>
    </Response>
  `)
};
```

---

## Security Implementation

### Authentication & Authorization

```typescript
// JWT Token Service
class JWTService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  generateToken(user: User): string {
    const payload = {
      sub: user.id,
      role: user.role,
      permissions: user.permissions,
      department: user.department,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      iss: this.issuer,
      aud: this.audience
    };

    return jwt.sign(payload, this.secret, { algorithm: 'HS256' });
  }

  verifyToken(token: string): JWTPayload {
    return jwt.verify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['HS256']
    }) as JWTPayload;
  }
}

// Role-Based Access Control Middleware
const rbacMiddleware = (requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userPermissions = req.user.permissions;

    const hasPermission = requiredPermissions.every(permission =>
      userPermissions.includes(permission) || userPermissions.includes('admin')
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermissions,
        provided: userPermissions
      });
    }

    next();
  };
};

// API Route Protection Examples
app.get('/api/escalations',
  authenticateToken,
  rbacMiddleware(['read_escalations']),
  getEscalations
);

app.post('/api/escalations/:id/acknowledge',
  authenticateToken,
  rbacMiddleware(['respond_escalations']),
  acknowledgeEscalation
);

app.put('/api/performance/thresholds',
  authenticateToken,
  rbacMiddleware(['configure_system']),
  updatePerformanceThresholds
);
```

### Data Encryption & Privacy

```typescript
// Sensitive Data Encryption
class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  encrypt(text: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key);
    cipher.setAAD(Buffer.from('additional-data'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encryptedData: EncryptedData): string {
    const decipher = crypto.createDecipher(this.algorithm, this.key);
    decipher.setAAD(Buffer.from('additional-data'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

// Audit Logging for Security Compliance
class AuditLogger {
  async logUserAction(action: UserAction): Promise<void> {
    const auditEntry = {
      user_id: action.userId,
      action_type: action.type,
      resource_type: action.resourceType,
      resource_id: action.resourceId,
      ip_address: action.ipAddress,
      user_agent: action.userAgent,
      timestamp: new Date(),
      details: action.details,
      success: action.success
    };

    // Store in separate audit database for compliance
    await this.auditDB.audit_logs.insert(auditEntry);

    // Also log to external audit service for immutability
    await this.externalAuditService.log(auditEntry);
  }
}
```

---

## Load Testing & Validation

### Performance Testing Framework

```typescript
// Load Testing Configuration
interface LoadTestConfig {
  concurrentUsers: number;
  testDuration: string; // '5m', '30m', '1h'
  endpoints: EndpointTest[];
  websocketConnections: number;
  expectedResponseTime: number; // milliseconds
  expectedThroughput: number; // requests per second
}

const LOAD_TEST_SCENARIOS = {
  normal_load: {
    concurrentUsers: 50,
    testDuration: '30m',
    endpoints: [
      { path: '/api/escalations', method: 'GET', weight: 40 },
      { path: '/api/performance/metrics', method: 'GET', weight: 30 },
      { path: '/api/escalations/:id/acknowledge', method: 'PUT', weight: 20 },
      { path: '/api/staff/performance', method: 'GET', weight: 10 }
    ],
    websocketConnections: 50,
    expectedResponseTime: 500,
    expectedThroughput: 100
  },

  peak_load: {
    concurrentUsers: 200,
    testDuration: '15m',
    endpoints: [
      { path: '/api/escalations', method: 'GET', weight: 35 },
      { path: '/api/escalations', method: 'POST', weight: 25 },
      { path: '/api/performance/metrics', method: 'GET', weight: 25 },
      { path: '/api/escalations/:id/acknowledge', method: 'PUT', weight: 15 }
    ],
    websocketConnections: 200,
    expectedResponseTime: 1000,
    expectedThroughput: 300
  },

  stress_test: {
    concurrentUsers: 500,
    testDuration: '10m',
    endpoints: [
      { path: '/api/escalations', method: 'GET', weight: 30 },
      { path: '/api/escalations', method: 'POST', weight: 30 },
      { path: '/api/performance/metrics', method: 'GET', weight: 20 },
      { path: '/api/escalations/:id/acknowledge', method: 'PUT', weight: 20 }
    ],
    websocketConnections: 500,
    expectedResponseTime: 2000,
    expectedThroughput: 400
  }
};

// Automated Performance Validation
class PerformanceValidator {
  async validateSLACompliance(): Promise<ValidationResult> {
    const results = {
      responseTime: await this.validateResponseTime(),
      throughput: await this.validateThroughput(),
      availability: await this.validateAvailability(),
      websocketLatency: await this.validateWebSocketPerformance()
    };

    return {
      passed: Object.values(results).every(result => result.passed),
      details: results
    };
  }

  private async validateResponseTime(): Promise<TestResult> {
    const testData = await this.runLoadTest(LOAD_TEST_SCENARIOS.normal_load);
    const averageResponseTime = testData.averageResponseTime;

    return {
      metric: 'response_time',
      actual: averageResponseTime,
      expected: 500,
      passed: averageResponseTime < 500,
      details: testData
    };
  }
}
```

---

## Deployment Configuration

### Environment Configuration

```yaml
# Production Environment
production:
  database:
    host: ${DB_HOST}
    port: ${DB_PORT}
    name: ${DB_NAME}
    user: ${DB_USER}
    password: ${DB_PASSWORD}
    ssl: true
    pool_size: 20
    connection_timeout: 30000

  redis:
    host: ${REDIS_HOST}
    port: ${REDIS_PORT}
    password: ${REDIS_PASSWORD}
    db: 0
    max_connections: 50

  websocket:
    port: ${WEBSOCKET_PORT}
    cors_origin: ${FRONTEND_URL}
    max_connections: 1000
    ping_timeout: 60000
    ping_interval: 25000

  notifications:
    sendgrid:
      api_key: ${SENDGRID_API_KEY}
      from_email: ${FROM_EMAIL}
      templates:
        escalation_critical: ${TEMPLATE_ESCALATION_CRITICAL}
        escalation_high: ${TEMPLATE_ESCALATION_HIGH}
        performance_alert: ${TEMPLATE_PERFORMANCE_ALERT}

    twilio:
      account_sid: ${TWILIO_ACCOUNT_SID}
      auth_token: ${TWILIO_AUTH_TOKEN}
      phone_number: ${TWILIO_PHONE_NUMBER}

  monitoring:
    prometheus:
      enabled: true
      port: 9090
      metrics_interval: 15000

    grafana:
      enabled: true
      port: 3000
      dashboards_path: ./monitoring/dashboards

  security:
    jwt_secret: ${JWT_SECRET}
    jwt_expiry: 24h
    bcrypt_rounds: 12
    rate_limit:
      window_ms: 900000 # 15 minutes
      max_requests: 100

  logging:
    level: info
    format: json
    file: ./logs/application.log
    rotation: daily
    retention: 30d
```

### Docker Configuration

```dockerfile
# Multi-stage Docker build for monitoring dashboard
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runtime

# Install production dependencies
RUN apk add --no-cache \
    curl \
    postgresql-client \
    redis

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S dashboard -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=dashboard:nodejs /app/dist ./dist
COPY --from=builder --chown=dashboard:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=dashboard:nodejs /app/package.json ./package.json

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Switch to non-root user
USER dashboard

EXPOSE ${PORT}

CMD ["node", "dist/server.js"]
```

---

## Success Metrics & Monitoring

### Key Performance Indicators

```typescript
// KPI Tracking System
interface KPIMetrics {
  slaCompliance: {
    critical: number; // Target: >98%
    high: number;     // Target: >95%
    normal: number;   // Target: >90%
    routine: number;  // Target: >95%
  };

  systemPerformance: {
    responseTime: number;     // Target: <500ms
    availability: number;     // Target: >99.9%
    throughput: number;       // Target: >100 RPS
    errorRate: number;        // Target: <0.1%
  };

  userExperience: {
    dashboardLoadTime: number;    // Target: <2s
    notificationDelivery: number; // Target: >99%
    alertAcknowledgment: number;  // Target: <30s average
  };

  businessImpact: {
    escalationVolume: number;     // Track trends
    resolutionTime: number;       // Target: <5min average
    patientSatisfaction: number;  // Target: >85%
    staffEfficiency: number;      // Target: 20% improvement
  };
}

// Automated KPI Reporting
class KPIReporter {
  async generateDailyReport(): Promise<DailyKPIReport> {
    const metrics = await this.collectKPIMetrics();
    const report = await this.analyzePerformance(metrics);

    // Send to stakeholders
    await this.sendReportToStakeholders(report);

    return report;
  }

  private async analyzePerformance(metrics: KPIMetrics): Promise<DailyKPIReport> {
    return {
      date: new Date(),
      slaCompliance: {
        overall: this.calculateOverallSLA(metrics.slaCompliance),
        byPriority: metrics.slaCompliance,
        trend: await this.calculateSLATrend()
      },
      alerts: await this.identifyPerformanceAlerts(metrics),
      recommendations: await this.generateRecommendations(metrics)
    };
  }
}
```

This comprehensive technical specification provides the foundation for implementing a production-ready monitoring dashboard that supports the Escalation SLAs and Monitoring Framework with real-time performance tracking, multi-channel notifications, and robust security measures.