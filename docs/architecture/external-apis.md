# External APIs

## OpenEMR API

- **Purpose:** Real-time appointment scheduling and patient data access for Capitol Eye Care's existing practice management system
- **Documentation:** https://github.com/openemr/openemr/blob/rel-703/API_README.md
- **Base URL(s):** https://your-openemr-instance.com/apis/default/api (Standard API), https://your-openemr-instance.com/apis/default/fhir (FHIR R4 API)
- **Authentication:** OAuth 2.0 Authorization Code Grant with SSL/TLS mandatory
- **Rate Limits:** No specific limits documented, implement client-side throttling at 10 requests/second

**Key Endpoints Used:**
- `GET /api/patient` - Retrieve patient demographics for verification
- `POST /api/patient/{pid}/appointment` - Create new appointments
- `GET /api/patient/{pid}/appointment` - Query existing appointments
- `PUT /api/patient/{pid}/appointment/{eid}` - Modify appointment details
- `DELETE /api/patient/{pid}/appointment/{eid}` - Cancel appointments
- `GET /fhir/Appointment` - FHIR-compliant appointment queries
- `POST /oauth2/{site}/token` - OAuth token management

**Integration Notes:** Access tokens valid for 1 hour, refresh tokens for 3 months. Implement robust token refresh logic. SSL certificate validation required. Use FHIR API for future-proofing and standards compliance.

## Twilio Voice API

- **Purpose:** SIP telephony integration for receiving patient calls and managing voice conversations
- **Documentation:** https://www.twilio.com/docs/voice/api
- **Base URL(s):** https://api.twilio.com/2010-04-01/Accounts/{AccountSid}
- **Authentication:** HTTP Basic Auth using Account SID and Auth Token
- **Rate Limits:** 1,000 requests per second per account, with burst capabilities

**Key Endpoints Used:**
- `POST /Calls.json` - Initiate outbound calls for confirmations
- `POST /Calls/{CallSid}.json` - Modify active call parameters
- `GET /Calls/{CallSid}/Recordings.json` - Access call recordings for audit
- `POST /IncomingPhoneNumbers.json` - Configure webhook endpoints
- `GET /Applications/{ApplicationSid}.json` - Manage TwiML applications

**Integration Notes:** Configure webhooks to point to Voice Processing Service. Implement SIP authentication for enhanced security. Use TwiML for call flow control. Store call recordings in encrypted S3 buckets for HIPAA compliance.

## OpenAI API

- **Purpose:** Speech recognition via Whisper and natural language processing via GPT-4 for intelligent patient conversations
- **Documentation:** https://platform.openai.com/docs/api-reference
- **Base URL(s):** https://api.openai.com/v1
- **Authentication:** Bearer token using API key
- **Rate Limits:** GPT-4: 10,000 requests/day, Whisper: 50 requests/minute per API key

**Key Endpoints Used:**
- `POST /audio/transcriptions` - Convert patient speech to text (Whisper)
- `POST /chat/completions` - Process natural language for appointment scheduling (GPT-4)
- `POST /audio/translations` - Handle non-English patient interactions
- `GET /models` - Verify available model versions

**Integration Notes:** Implement exponential backoff for rate limit handling. Use streaming for real-time conversation processing. Configure custom prompts for medical terminology and elderly speech patterns. Ensure PHI is not logged in OpenAI requests.

## ElevenLabs API

- **Purpose:** High-quality text-to-speech synthesis with elderly-friendly voice profiles for patient communications
- **Documentation:** https://docs.elevenlabs.io/api-reference
- **Base URL(s):** https://api.elevenlabs.io/v1
- **Authentication:** API key via xi-api-key header
- **Rate Limits:** 10,000 characters per month on free tier, contact for healthcare pricing

**Key Endpoints Used:**
- `POST /text-to-speech/{voice_id}` - Generate voice responses
- `GET /voices` - List available voice profiles
- `POST /voices/add` - Create custom elderly-friendly voice
- `GET /user/subscription` - Monitor usage limits

**Integration Notes:** Select voice profile optimized for elderly patients (slower pace, clear enunciation). Implement audio caching to reduce API costs. Use SSML for pronunciation of medical terms. Stream audio directly to Twilio for real-time conversation.

## AWS Services (Internal APIs)

- **Purpose:** Cloud infrastructure services for hosting, storage, and HIPAA-compliant operations
- **Documentation:** https://docs.aws.amazon.com/
- **Base URL(s):** Various AWS service endpoints (region-specific)
- **Authentication:** AWS IAM roles and policies with least privilege access
- **Rate Limits:** Service-specific, generally high for healthcare workloads

**Key Endpoints Used:**
- **S3:** Store encrypted audio recordings and backups
- **KMS:** Encrypt/decrypt patient data and PHI
- **Secrets Manager:** Rotate API keys and database credentials
- **CloudWatch:** Monitor system health and compliance metrics
- **SQS/SNS:** Process audit logs and staff notifications

**Integration Notes:** Configure VPC for network isolation. Use HIPAA-eligible services only. Implement AWS HealthLake for FHIR compliance if needed. Enable AWS Config for compliance monitoring.
