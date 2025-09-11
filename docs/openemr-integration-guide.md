# OpenEMR Integration Guide

## Overview

This guide documents the integration between the Voice Agent system and OpenEMR's REST API for Capitol Eye Care. The integration provides secure patient verification, appointment management, and calendar operations with full HIPAA compliance.

## Architecture

```
Voice Agent ←→ OpenEMR Client ←→ OAuth2 ←→ OpenEMR REST API
    ↓               ↓              ↓           ↓
Conversation    Authentication   Security   Patient Data
Management      & Authorization  Layer      & Scheduling
```

## Authentication Methods

### 1. Authorization Code Grant (PRODUCTION)
**Recommended for production use** - Most secure OAuth2 flow

```typescript
// Step 1: Redirect user to authorization URL
const authUrl = client.getAuthorizationUrl('unique-state-value');

// Step 2: Handle callback and exchange code for tokens
const tokens = await client.exchangeCodeForToken(code, redirectUri);
```

### 2. Password Grant (DEVELOPMENT ONLY)
**Only for development/testing** - Less secure, disabled by default in OpenEMR

```typescript
const tokens = await client.authenticateWithPassword(username, password);
```

### 3. Client Credentials Grant (SYSTEM ACCESS)
**For system-to-system integration** - Uses JWKS authentication

## Core Capabilities

### Patient Identity Verification

The system implements secure patient verification using multiple factors:

```typescript
const patient = await client.verifyPatient(
  firstName: 'Margaret',
  lastName: 'Smith', 
  dob: '1942-03-15',
  phone: '555-0101'
);
```

**Verification Process:**
1. Search patients by name and date of birth
2. Match phone number (home or cell)
3. Return patient only if single exact match found
4. Log verification attempts for HIPAA audit trail

### Appointment Management

#### Available Time Slots
```typescript
const slots = await client.getAvailableSlots(
  providerId: '1',
  date: '2025-09-12',
  duration: 30
);
```

#### Conflict Detection
```typescript
const conflict = await client.checkAppointmentConflict(
  providerId: '1',
  startDate: '2025-09-12T10:00:00Z',
  duration: 30
);

if (conflict.hasConflict) {
  // Handle scheduling conflict
  console.log('Conflict:', conflict.reason);
}
```

#### Create Appointment
```typescript
const appointment = await client.createAppointment({
  patient_id: '1',
  provider_id: '1', 
  start_date: '2025-09-12T10:00:00Z',
  duration: 30,
  appointment_type: 'routine_exam',
  reason: 'Annual eye examination'
});
```

## API Endpoints

### OpenEMR REST API Structure

Base URL: `https://your-openemr.com/apis/default/api`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/patient` | GET | List patients |
| `/patient/{id}` | GET | Get patient details |
| `/patient/{id}/appointment` | GET | Get patient appointments |
| `/appointment` | GET/POST | List/create appointments |
| `/appointment/{id}` | PUT/DELETE | Update/cancel appointments |

### OAuth2 Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/oauth2/default/registration` | Client registration |
| `/oauth2/default/authorize` | Authorization request |
| `/oauth2/default/token` | Token exchange/refresh |
| `/oauth2/default/logout` | Token revocation |

## Security Implementation

### Required Scopes

```
openid offline_access api:oemr 
user/patient.read user/patient.write 
user/appointment.read user/appointment.write
```

### Token Management

```typescript
// Automatic token refresh before expiry
private async ensureValidToken(): Promise<void> {
  if (this.tokenExpiry && this.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
    await this.refreshAccessToken();
  }
}
```

### HIPAA Compliance Features

1. **Audit Logging**: All API calls logged with timestamp and user
2. **Encryption**: All data encrypted in transit (TLS) and at rest
3. **Access Control**: Role-based permissions via OAuth2 scopes
4. **Session Management**: Automatic timeout and token expiration
5. **PHI Protection**: No PHI stored in logs or temporary files

## Error Handling

### Common Error Scenarios

```typescript
try {
  const patient = await client.verifyPatient(...);
} catch (error) {
  if (error.message.includes('Authentication failed')) {
    // Handle auth failure - redirect to login
  } else if (error.message.includes('Patient not found')) {
    // Handle verification failure - escalate to staff
  } else {
    // Handle system error - fallback to manual process
  }
}
```

### Error Response Format

```json
{
  "validationErrors": [],
  "internalErrors": ["Error message"],
  "data": null
}
```

## Testing & Development

### Mock API for Development

When OpenEMR is not available for development:

```typescript
import { MockOpenEMRAPI } from './services/openemr-mock-api';

const mockAPI = new MockOpenEMRAPI();
const scenarios = mockAPI.getElderlyPatientScenarios();
```

### Connectivity Test Suite

Run comprehensive integration tests:

```bash
npm run test:openemr-connectivity
```

**Test Coverage:**
- ✅ OAuth2 registration and authentication
- ✅ Patient verification with various scenarios  
- ✅ Appointment retrieval and creation
- ✅ Conflict detection algorithms
- ✅ Token refresh mechanisms
- ✅ Error handling and recovery

### Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Update with your OpenEMR credentials
OPENEMR_BASE_URL=https://your-openemr-instance.com/openemr
OPENEMR_CLIENT_ID=your_registered_client_id
OPENEMR_CLIENT_SECRET=your_client_secret
```

## Capitol Eye Care Specific Implementation

### Patient Demographics
- **Target Users**: Adult patients (18+ years)
- **Common Scenarios**: Routine exams, cataract follow-ups, glaucoma monitoring, contact lens fittings
- **Accessibility**: Clear audio, intuitive voice interface, multi-generational friendly

### Appointment Types

| Type | Duration | Description |
|------|----------|-------------|
| `routine_exam` | 30 min | Annual comprehensive eye exam |
| `follow_up` | 15 min | Post-procedure check-up |
| `consultation` | 45 min | New patient consultation |
| `emergency` | 30 min | Urgent eye care needs |

### Provider Schedule
- **Dr. Sarah Mitchell**: Mon-Fri, 8 AM - 5 PM (General)
- **Dr. Michael Chen**: Tue/Thu/Fri, 9 AM - 4 PM (Retina Specialist)  
- **Dr. Jennifer Davis**: Mon/Wed/Fri, 8 AM - 3 PM (Pediatric)

### Business Rules

1. **Appointment Buffers**: 15-minute buffer between appointments
2. **Double Booking**: Not allowed by default
3. **Emergency Slots**: Reserved slots held until 2 PM daily
4. **Cancellation Policy**: 24-hour advance notice required
5. **Insurance Verification**: Required for new patients

## Deployment Considerations

### Production Requirements

1. **SSL Certificate**: Valid TLS certificate for HTTPS
2. **Firewall Configuration**: Allow OpenEMR API access
3. **Backup Strategy**: Regular database backups
4. **Monitoring**: API health checks and performance monitoring
5. **Compliance**: HIPAA audit logs and security controls

### Performance Optimization

```typescript
// Connection pooling for high volume
const client = new OpenEMRClient({
  baseUrl: process.env.OPENEMR_BASE_URL,
  // ... config
  connectionPool: {
    maxConnections: 10,
    timeout: 30000
  }
});
```

### Monitoring Endpoints

```typescript
// Health check endpoint
app.get('/health/openemr', async (req, res) => {
  const result = await client.testConnection();
  res.status(result.success ? 200 : 503).json(result);
});
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check client credentials
   - Verify OAuth2 is enabled in OpenEMR
   - Ensure proper scopes are requested

2. **403 Forbidden** 
   - Verify user has required permissions
   - Check API scope restrictions
   - Confirm client registration is active

3. **404 Not Found**
   - Verify OpenEMR URL and site name
   - Check API endpoints are enabled
   - Confirm OpenEMR version compatibility

4. **Connection Timeout**
   - Check network connectivity
   - Verify firewall settings
   - Increase timeout values if needed

### Debug Mode

```typescript
// Enable detailed logging
const client = new OpenEMRClient({
  // ... config
  debug: true,
  logLevel: 'verbose'
});
```

## Next Steps

1. **Complete OAuth2 Setup**: Register production client with OpenEMR
2. **Implement Voice Integration**: Connect with Twilio/ElevenLabs
3. **Add HIPAA Audit Logging**: Comprehensive audit trail
4. **Performance Testing**: Load testing with realistic patient data
5. **Staff Training**: Train Capitol Eye Care staff on escalation procedures

## Support Resources

- [OpenEMR API Documentation](https://www.open-emr.org/wiki/index.php/OpenEMR_7.0.3_API)
- [OAuth2 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [Capitol Eye Care Internal Documentation](./practice-data.txt)