# OpenEMR API Integration Documentation

## Overview
This document outlines the integration patterns, capabilities, and limitations of the OpenEMR REST API integration for the Voice Agent scheduling service. The integration supports both standard REST API and FHIR R4 API endpoints for comprehensive appointment management.

## API Endpoints

### Base URLs
- **Standard API**: `https://your-openemr-instance.com/apis/default/api`
- **FHIR R4 API**: `https://your-openemr-instance.com/apis/default/fhir`
- **OAuth 2.0**: `https://your-openemr-instance.com/oauth2/default`

### Authentication Endpoints

#### OAuth 2.0 Token Endpoints
- **Authorization**: `GET /oauth2/{site}/authorize`
- **Token Exchange**: `POST /oauth2/{site}/token`
- **Token Refresh**: `POST /oauth2/{site}/token` (with refresh_token grant)
- **Logout**: `POST /oauth2/{site}/logout`

### Appointment Management Endpoints

#### FHIR R4 Endpoints (Recommended)
- **List Appointments**: `GET /fhir/Appointment`
  - Query Parameters:
    - `date=ge{startDate}` - Start date filter
    - `date=le{endDate}` - End date filter
    - `patient=Patient/{id}` - Filter by patient
    - `practitioner=Practitioner/{id}` - Filter by practitioner
    - `status={status}` - Filter by appointment status
    - `identifier={confirmationNumber}` - Search by confirmation number

- **Get Appointment**: `GET /fhir/Appointment/{id}`
- **Create Appointment**: `POST /fhir/Appointment`
- **Update Appointment**: `PUT /fhir/Appointment/{id}`
- **Cancel Appointment**: `PUT /fhir/Appointment/{id}` (with status='cancelled')

#### Slot Management Endpoints
- **Available Slots**: `GET /fhir/Slot`
  - Query Parameters:
    - `start=ge{startDate}` - Start date filter
    - `start=le{endDate}` - End date filter
    - `status=free` - Only available slots
    - `schedule.actor=Practitioner/{id}` - Filter by practitioner
    - `appointment-type={type}` - Filter by appointment type

#### Practitioner Endpoints
- **List Practitioners**: `GET /fhir/Practitioner`
- **Get Practitioner**: `GET /fhir/Practitioner/{id}`
- **Practitioner Schedule**: `GET /fhir/Schedule?actor=Practitioner/{id}`

#### Patient Endpoints
- **Patient Search**: `GET /fhir/Patient`
  - Query Parameters:
    - `telecom={phoneNumber}` - Search by phone
    - `name={name}` - Search by name
    - `birthdate={date}` - Search by birth date
- **Get Patient**: `GET /fhir/Patient/{id}`

### Standard REST API Endpoints (Legacy)
- **Create Appointment**: `POST /api/patient/{pid}/appointment`
- **Get Appointments**: `GET /api/patient/{pid}/appointment`
- **Update Appointment**: `PUT /api/patient/{pid}/appointment/{eid}`
- **Delete Appointment**: `DELETE /api/patient/{pid}/appointment/{eid}`

## Authentication Flow

### OAuth 2.0 Authorization Code Grant with PKCE

1. **Generate PKCE Challenge**
   ```javascript
   const codeVerifier = generateRandomString(128);
   const codeChallenge = sha256(codeVerifier);
   ```

2. **Authorization Request**
   ```
   GET /oauth2/default/authorize?
     response_type=code&
     client_id={client_id}&
     redirect_uri={redirect_uri}&
     scope=openid%20offline_access%20api:fhir&
     state={state}&
     code_challenge={code_challenge}&
     code_challenge_method=S256
   ```

3. **Token Exchange**
   ```
   POST /oauth2/default/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&
   code={authorization_code}&
   client_id={client_id}&
   client_secret={client_secret}&
   redirect_uri={redirect_uri}&
   code_verifier={code_verifier}
   ```

4. **Token Response**
   ```json
   {
     "access_token": "eyJ0eXAiOiJKV1QiLCJhbGci...",
     "refresh_token": "def50200ab0e3d2e7d...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "id_token": "eyJ0eXAiOiJKV1QiLCJhbGci..."
   }
   ```

### Client Credentials Grant (Server-to-Server)
For server-to-server communication without user context:

```
POST /oauth2/default/token
Authorization: Basic {base64(client_id:client_secret)}
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
scope=openid%20api:fhir
```

### Token Management
- **Access Token Lifetime**: 1 hour (3600 seconds)
- **Refresh Token Lifetime**: 3 months
- **Token Refresh**: Recommended when token expires in < 5 minutes
- **Storage**: Use AWS Secrets Manager for secure token storage

## Request/Response Examples

### Create Appointment Request
```json
POST /fhir/Appointment
Content-Type: application/fhir+json
Authorization: Bearer {access_token}

{
  "resourceType": "Appointment",
  "status": "proposed",
  "appointmentType": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v2-0276",
      "code": "ROUTINE",
      "display": "Routine appointment"
    }]
  },
  "start": "2025-01-20T10:00:00-05:00",
  "end": "2025-01-20T11:00:00-05:00",
  "participant": [
    {
      "actor": {
        "reference": "Patient/123"
      },
      "status": "needs-action"
    },
    {
      "actor": {
        "reference": "Practitioner/456"
      },
      "status": "accepted"
    }
  ],
  "description": "Annual eye exam"
}
```

### Search Available Slots Response
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "entry": [
    {
      "resource": {
        "resourceType": "Slot",
        "id": "789",
        "status": "free",
        "start": "2025-01-20T14:00:00-05:00",
        "end": "2025-01-20T14:30:00-05:00",
        "schedule": {
          "reference": "Schedule/dr-smith-schedule"
        }
      }
    }
  ]
}
```

## Rate Limiting & Performance

### Rate Limits
- **No documented hard limits** from OpenEMR
- **Client-side throttling**: Implement at 10 requests/second
- **Concurrent connections**: Maximum 5 parallel requests
- **Retry strategy**: Exponential backoff starting at 1 second

### Performance Optimization
- **Connection pooling**: Reuse HTTPS connections
- **Token caching**: Cache tokens until 5 minutes before expiry
- **Response caching**: Cache practitioner and slot data for 5 minutes
- **Batch operations**: Use FHIR batch/transaction when possible

## Error Handling

### Error Response Format
```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "invalid",
    "details": {
      "text": "Invalid appointment time"
    }
  }]
}
```

### Common Error Codes
- **400**: Bad Request - Invalid parameters or malformed request
- **401**: Unauthorized - Invalid or expired token
- **403**: Forbidden - Insufficient permissions
- **404**: Not Found - Resource does not exist
- **409**: Conflict - Scheduling conflict or duplicate resource
- **429**: Too Many Requests - Rate limit exceeded
- **500**: Internal Server Error - OpenEMR server issue

### Error Recovery Strategies
1. **401 Errors**: Refresh token and retry
2. **409 Conflicts**: Fetch latest data and retry with updated information
3. **429 Rate Limit**: Implement exponential backoff
4. **500 Errors**: Circuit breaker pattern with fallback

## Business Rules & Validation

### Appointment Scheduling Rules
- **Minimum advance booking**: 24 hours for routine appointments
- **Maximum booking window**: 60 days in advance
- **Appointment duration**:
  - Routine exam: 60 minutes
  - Follow-up: 30 minutes
  - Urgent: 45 minutes
  - Consultation: 45 minutes
- **Buffer time**: 10 minutes between appointments
- **Business hours**: Monday-Friday 8:00 AM - 5:00 PM (configurable)

### Conflict Detection
- Check for overlapping appointments with same practitioner
- Verify patient doesn't have conflicting appointments
- Validate against practitioner schedule/availability
- Check for blocked time slots (lunch, meetings)

## Known Limitations

### API Limitations
1. **No webhook support**: Must poll for appointment changes
2. **Limited batch operations**: Individual API calls for multiple operations
3. **No real-time notifications**: Cannot receive instant updates
4. **Limited search capabilities**: Basic filtering only
5. **No appointment waitlist**: Must implement separately

### Integration Workarounds
1. **Polling strategy**: Check for updates every 5 minutes
2. **Confirmation numbers**: Store in appointment identifier field
3. **Custom fields**: Use appointment description for additional data
4. **Waitlist management**: Implement in application layer
5. **Notification system**: Build separate notification service

## Security Considerations

### SSL/TLS Requirements
- **Minimum TLS version**: 1.2
- **Certificate validation**: Always validate server certificates
- **Certificate pinning**: Optional for additional security

### Token Security
- **Storage**: Never store tokens in code or logs
- **Transmission**: Always use HTTPS
- **Rotation**: Refresh tokens before expiry
- **Revocation**: Logout when session ends

### HIPAA Compliance
- **Audit logging**: Log all API access with patient data
- **Encryption**: Encrypt tokens at rest
- **Access control**: Implement role-based permissions
- **Data retention**: Follow 7-year retention policy

## Testing & Development

### Test Environment
- **URL**: `https://test.openemr.io/openemr/apis`
- **Test credentials**: Available from OpenEMR team
- **Test data**: Pre-populated test patients and appointments

### Testing Checklist
- [ ] OAuth 2.0 authorization flow
- [ ] Token refresh mechanism
- [ ] All CRUD operations
- [ ] Conflict detection
- [ ] Error handling
- [ ] Rate limiting compliance
- [ ] Performance under load
- [ ] HIPAA compliance validation

## Troubleshooting Guide

### Common Issues and Solutions

#### Authentication Failures
- **Issue**: 401 Unauthorized errors
- **Solution**: Check token expiry, refresh if needed
- **Debug**: Log token claims, verify scope

#### Scheduling Conflicts
- **Issue**: 409 Conflict errors
- **Solution**: Fetch latest availability, retry with different slot
- **Debug**: Check practitioner schedule, existing appointments

#### Performance Issues
- **Issue**: Slow API responses
- **Solution**: Implement caching, connection pooling
- **Debug**: Monitor API response times, check network

#### Data Synchronization
- **Issue**: Stale appointment data
- **Solution**: Reduce cache TTL, implement polling
- **Debug**: Compare local vs remote timestamps

## Integration Patterns

### Pattern 1: Real-time Availability Check
```javascript
async function checkAvailability(date, practitioner) {
  // 1. Check cache first
  const cached = await cache.get(`slots:${date}:${practitioner}`);
  if (cached) return cached;

  // 2. Fetch from API
  const slots = await openemr.getAvailableSlots(date, date, practitioner);

  // 3. Cache for 5 minutes
  await cache.set(`slots:${date}:${practitioner}`, slots, 300);

  return slots;
}
```

### Pattern 2: Appointment Booking with Confirmation
```javascript
async function bookAppointment(patientId, slot) {
  // 1. Verify slot is still available
  const available = await checkSlotAvailability(slot);
  if (!available) throw new ConflictError('Slot no longer available');

  // 2. Create appointment
  const appointment = await openemr.createAppointment({
    patientId,
    ...slot
  });

  // 3. Generate confirmation number
  const confirmationNumber = generateConfirmationNumber();

  // 4. Update with confirmation
  await openemr.updateAppointment(appointment.id, {
    identifier: confirmationNumber
  });

  return { appointment, confirmationNumber };
}
```

### Pattern 3: Robust Error Recovery
```javascript
async function apiCallWithRetry(operation, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (error.status === 401) {
        await refreshToken();
        continue;
      }

      if (error.status === 429 || error.status >= 500) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      throw error; // Non-retryable error
    }
  }

  throw lastError;
}
```

## Maintenance & Monitoring

### Health Checks
- Monitor token refresh success rate
- Track API response times
- Alert on authentication failures
- Monitor conflict rate

### Metrics to Track
- Average API response time
- Token refresh frequency
- Error rate by endpoint
- Conflict detection rate
- Cache hit rate

### Regular Maintenance
- Review and update token rotation
- Monitor OpenEMR API changes
- Update test data regularly
- Review error logs for patterns

## Contact & Support

### OpenEMR Support
- **Documentation**: https://www.open-emr.org/wiki/index.php/OpenEMR_API
- **GitHub**: https://github.com/openemr/openemr
- **Community Forum**: https://community.open-emr.org/

### Internal Support
- **Team**: Voice Agent Development Team
- **Slack Channel**: #voice-agent-dev
- **Documentation**: This document and inline code documentation