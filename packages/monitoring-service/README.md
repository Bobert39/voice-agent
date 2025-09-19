# Voice Agent Monitoring Service

Comprehensive performance monitoring and alerting service for the Capitol Eye Care AI Voice Agent system.

## Overview

This service implements Story 4.3 requirements for performance monitoring, alerting, and health checks. It provides:

- **Health Monitoring**: Real-time health checks for all external dependencies
- **Performance Metrics**: Application and business metrics collection via Prometheus
- **Alerting System**: Multi-channel alerting with PagerDuty, Slack, and email
- **Synthetic Monitoring**: End-to-end functional testing
- **Performance Analytics**: Grafana dashboards for system visibility

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Health Checks │    │     Metrics     │    │     Alerts      │
│                 │    │                 │    │                 │
│ • OpenEMR API   │    │ • Voice Service │    │ • PagerDuty     │
│ • Twilio Voice  │────┤ • API Performance├────┤ • Slack         │
│ • Database      │    │ • Business KPIs │    │ • Email         │
│ • Redis Cache   │    │ • Infrastructure │    │ • Webhooks      │
│ • AI Service    │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                     ┌─────────────────┐
                     │   Prometheus    │
                     │    Storage      │
                     └─────────────────┘
                                │
                     ┌─────────────────┐
                     │    Grafana      │
                     │   Dashboard     │
                     └─────────────────┘
```

## Service Level Objectives (SLOs)

### Availability
- **Business Hours**: 99.9% (43.2 seconds downtime/month)
- **After Hours**: 99.5% (3.6 hours downtime/month)

### Latency Targets
- **Voice Response**: P95 < 800ms, P99 < 1.5s
- **OpenEMR API**: P95 < 500ms, P99 < 1s
- **Scheduling API**: P95 < 400ms, P99 < 800ms

### Error Rates
- **Overall**: < 0.1%
- **Patient Verification**: < 0.5%
- **Appointment Booking**: < 0.1%
- **Voice Recognition**: < 2%

## Quick Start

### Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

### Production Deployment

1. **Using Docker Compose (Recommended)**
   ```bash
   docker-compose up -d
   ```

2. **Manual Docker Build**
   ```bash
   docker build -t voice-agent-monitoring .
   docker run -p 3006:3006 --env-file .env voice-agent-monitoring
   ```

## API Endpoints

### Health Check
```http
GET /health
```
Returns overall system health status and individual service checks.

### Metrics Export
```http
GET /metrics
```
Prometheus-formatted metrics for scraping.

### Status Dashboard
```http
GET /status
```
Human-readable status summary with SLO compliance.

### Synthetic Test Results
```http
GET /synthetic
```
Current synthetic test results and failure tracking.

### Alert Webhook
```http
POST /alerts/webhook
```
Endpoint for receiving external alerts.

## Configuration

### Environment Variables

#### Core Service
- `MONITORING_PORT`: Service port (default: 3006)
- `NODE_ENV`: Environment (development/production)

#### Database Connections
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string

#### External APIs
- `OPENEMR_BASE_URL`: OpenEMR API base URL
- `OPENEMR_ACCESS_TOKEN`: OpenEMR API token
- `TWILIO_ACCOUNT_SID`: Twilio account identifier
- `TWILIO_AUTH_TOKEN`: Twilio authentication token
- `OPENAI_API_KEY`: OpenAI API key

#### Alerting
- `PAGERDUTY_CRITICAL_KEY`: PagerDuty service key for critical alerts
- `PAGERDUTY_WARNING_KEY`: PagerDuty service key for warnings
- `SLACK_WEBHOOK_URL`: Slack webhook for notifications
- `ALERT_EMAIL_FROM`: Email sender address
- `ALERT_EMAIL_TO`: Email recipient for alerts

#### Grafana
- `GRAFANA_ADMIN_PASSWORD`: Grafana admin password

## Health Checks

The service monitors these critical dependencies:

1. **OpenEMR API**: Patient record system connectivity
2. **Twilio Voice**: Telephony service availability and balance
3. **Database**: PostgreSQL connection and query performance
4. **Redis Cache**: Session storage and performance
5. **AI Service**: OpenAI API availability and quota

Each health check includes:
- Response time measurement
- Status classification (healthy/degraded/unhealthy)
- Detailed error messages
- Service-specific metadata

## Metrics Collection

### Application Metrics
- Active voice calls
- Call duration distribution
- Speech recognition accuracy
- Text-to-speech latency
- API request rates and latency
- Database connection usage

### Business Metrics
- Patient verification success rate
- Appointment booking completion
- Conversation abandonment rate
- AI confidence scores
- Human escalation frequency

### Infrastructure Metrics
- CPU and memory usage
- Network latency
- Disk I/O performance
- Service restart counts

## Alerting Rules

### Critical Alerts (PagerDuty)
- Service completely down (>1 minute)
- Database connection pool exhausted (>90%)
- Health check failures (>2 minutes)

### Warning Alerts (Slack)
- High error rate (>1% for 5 minutes)
- High latency (P95 >1s for 10 minutes)
- Call capacity warning (>80% for 5 minutes)
- Low verification success rate (<80% for 15 minutes)

### Info Alerts (Slack)
- High escalation rate (>15% for 30 minutes)
- Low AI confidence (<60% for 10 minutes)

## Synthetic Monitoring

Automated tests run continuously to validate system functionality:

1. **End-to-End Call Flow** (every 15 minutes)
   - Complete voice interaction simulation
   - Patient verification workflow
   - Response time validation

2. **Appointment Booking** (hourly)
   - Full booking workflow test
   - OpenEMR integration validation
   - Error handling verification

3. **NLU Processing** (every 30 minutes)
   - Natural language understanding accuracy
   - Intent recognition validation
   - Response appropriateness

4. **External Dependencies** (every 5 minutes)
   - API connectivity tests
   - Service availability checks
   - Authentication validation

5. **Performance Baseline** (every 2 hours)
   - Load testing simulation
   - Latency threshold validation
   - Capacity stress testing

## Grafana Dashboards

### System Overview
- Current availability percentage
- Active calls and capacity utilization
- Error rates and response times
- Alert summary

### Call Metrics
- Calls per minute timeline
- Call duration distribution
- Recognition accuracy trends
- Abandonment rate analysis

### API Performance
- Request rates by endpoint
- Response time percentiles
- Error breakdown by service
- Database query performance

### Infrastructure Health
- Resource utilization (CPU/Memory/Disk)
- Network throughput and latency
- Container health and restarts
- Dependency status matrix

### Business Intelligence
- Daily/weekly appointment trends
- Verification success rates
- Popular inquiry types
- Peak usage patterns

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks in health checks
   - Restart service if usage >80%
   - Monitor Redis connection pool

2. **Prometheus Scraping Failures**
   - Verify `/metrics` endpoint accessibility
   - Check network connectivity to Prometheus
   - Validate metrics format

3. **Alert Delivery Issues**
   - Verify webhook endpoints are accessible
   - Check PagerDuty/Slack credentials
   - Review alert routing configuration

4. **Synthetic Test Failures**
   - Check external service availability
   - Validate test credentials and endpoints
   - Review test timeout configurations

### Log Analysis

Service logs include structured JSON with:
- Timestamp and log level
- Component and operation context
- Performance metrics
- Error details and stack traces

### Emergency Procedures

1. **Service Down**: Restart container, check dependencies
2. **High Alert Volume**: Review and adjust thresholds
3. **Dashboard Issues**: Verify Grafana/Prometheus connectivity
4. **Performance Degradation**: Check resource usage and scaling

## Development

### Adding New Health Checks

1. Implement check method in `HealthCheckService`
2. Add to `getHealthChecks()` configuration
3. Create tests in `__tests__/monitoring-service.test.ts`
4. Update documentation

### Adding New Metrics

1. Define metric in `prometheus-metrics.ts`
2. Add collection logic in relevant service
3. Create Grafana dashboard panel
4. Set up alerting rules if needed

### Adding New Alerts

1. Define rule in `AlertManager.getAlertRules()`
2. Configure notification channels
3. Test alert conditions
4. Document runbook procedures

## Security Considerations

- All API keys stored in environment variables
- Health check credentials rotated regularly
- Webhook endpoints use authentication
- Metrics exclude sensitive data
- Access logs monitored for anomalies

## Performance

- Health checks run with configurable timeouts
- Metrics collection uses efficient sampling
- Alert deduplication prevents spam
- Graceful degradation during high load
- Resource usage monitored and alerted