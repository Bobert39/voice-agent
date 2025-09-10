# Technical Assumptions

## Repository Structure: Monorepo
**Decision:** Monorepo with separate packages for voice AI service, API backend, admin dashboard, and OpenEMR integration modules to enable modular development and testing while maintaining single developer manageability.

## Service Architecture
**CRITICAL DECISION:** Microservices approach with dedicated services for:
- Voice processing service (speech-to-text, NLP, text-to-speech)
- Appointment scheduling service (OpenEMR integration)
- Patient verification service (identity validation)
- Audit logging service (HIPAA compliance)
- Staff notification service (escalation handling)

This enables independent scaling, better fault isolation, and supports the future platform business model while remaining manageable for single developer implementation.

## Testing Requirements
**CRITICAL DECISION:** Full testing pyramid approach including:
- Unit tests for all business logic and API endpoints
- Integration tests for OpenEMR connectivity and voice AI services
- End-to-end tests for complete patient interaction workflows
- Manual testing convenience methods for HIPAA audit trails and voice AI tuning

Healthcare applications require comprehensive testing due to patient safety and regulatory compliance requirements.

## Additional Technical Assumptions and Requests

**Backend Technology Stack:**
- **Language:** Node.js with TypeScript for type safety and rapid development leveraging existing JavaScript expertise
- **Framework:** Express.js with middleware for authentication, logging, and error handling
- **Database:** PostgreSQL for core application data with HIPAA-compliant encryption at rest, Redis for session management and caching

**Voice AI Technology Stack:**
- **Speech Recognition:** OpenAI Whisper with healthcare-optimized models for medical terminology and elderly speech patterns
- **Natural Language Processing:** GPT-4 with fine-tuning for appointment scheduling workflows and medical practice context
- **Text-to-Speech:** ElevenLabs with customizable voice profiles designed for elderly-friendly, professional healthcare communication
- **Telephony Integration:** Twilio cloud telephony service with SIP integration for existing practice phone systems

**Infrastructure and Deployment:**
- **Hosting:** HIPAA-compliant cloud infrastructure using AWS HIPAA-eligible services with redundancy and backup systems for 99.9% availability
- **Security:** End-to-end encryption, OAuth 2.0 authentication, role-based access control, automated backup systems, and regular security vulnerability scanning
- **Monitoring:** Real-time performance monitoring, error tracking, and automated alerting for system health and patient interaction quality

**OpenEMR Integration:**
- **API Access:** RESTful API integration using existing MySQL database connections with secure endpoints and rate limiting
- **Authentication:** OAuth 2.0 with role-based access control for different staff permission levels
- **Data Synchronization:** Real-time appointment scheduling with conflict prevention and immediate calendar updates

**Development Constraints:**
- **Budget:** $15,000-25,000 initial development budget with $2,000-3,000 monthly operational costs
- **Timeline:** 3-6 months MVP development with 2-4 week pilot program launch target
- **Resources:** Single developer with JavaScript expertise, requiring outsourced healthcare IT consultation for HIPAA compliance
