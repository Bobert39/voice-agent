# Tech Stack

## Cloud Infrastructure

- **Provider:** AWS (Amazon Web Services)
- **Key Services:** Lambda, API Gateway, RDS PostgreSQL, ElastiCache Redis, SQS, SNS, CloudWatch, S3, Secrets Manager, VPC
- **Deployment Regions:** us-west-2 (primary), us-east-1 (failover)

## Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|----------|
| **Language** | TypeScript | 5.3.3 | Primary development language | Strong typing for healthcare reliability, excellent tooling, PRD requirement |
| **Runtime** | Node.js | 20.11.0 LTS | JavaScript runtime | LTS version for stability, matches OpenEMR compatibility |
| **Framework** | Express.js | 4.18.2 | HTTP server framework | PRD requirement, extensive middleware ecosystem |
| **Microservices** | AWS Lambda | Runtime nodejs20.x | Serverless compute | Cost-effective for variable call volume, auto-scaling |
| **API Gateway** | AWS API Gateway | v2 | API management | Built-in rate limiting, CORS, SSL termination |
| **Database** | PostgreSQL | 15.4 | Primary data storage | HIPAA compliant, ACID compliance for appointments |
| **Cache** | Redis | 7.2 | Session/token storage | Fast OAuth token caching, conversation context |
| **Message Queue** | AWS SQS | - | Async audit processing | HIPAA audit trail reliability, dead letter queues |
| **Event Bus** | AWS SNS | - | Event distribution | Service decoupling, HIPAA audit events |
| **Container** | Docker | 24.0 | Local development | Consistent dev/prod environments |
| **IaC** | AWS CDK | 2.114.0 | Infrastructure as Code | TypeScript-native, better than CloudFormation |
| **Testing** | Jest | 29.7.0 | Unit testing | Best TypeScript support, healthcare reliability |
| **E2E Testing** | Playwright | 1.40.1 | Integration testing | Test voice flows and admin dashboard |
| **Logging** | Winston | 3.11.0 | HIPAA audit logging | Structured logs, CloudWatch integration |
| **Monitoring** | AWS CloudWatch | - | Low-cost monitoring | Native AWS, custom metrics, alarms |
| **APM** | AWS X-Ray | - | Distributed tracing | Debug microservice calls, included in AWS |
| **Voice/Telephony** | Twilio | 4.19.0 | SIP integration | PRD requirement, HIPAA compliant |
| **Speech-to-Text** | OpenAI Whisper API | v1 | Voice recognition | Medical terminology optimized |
| **NLP** | OpenAI GPT-4 | gpt-4-0125-preview | Natural language processing | Medical context understanding |
| **Text-to-Speech** | ElevenLabs | v1 | Voice synthesis | Elderly-friendly, professional voices |
| **API Docs** | OpenAPI | 3.0.0 | API specification | Standard for healthcare APIs |
| **Validation** | Zod | 3.22.4 | Schema validation | TypeScript-first, HIPAA data validation |
| **HTTP Client** | Axios | 1.6.2 | HTTP requests | OpenEMR API calls, retry logic |
| **Database ORM** | Prisma | 5.7.1 | Type-safe queries | PostgreSQL optimized, migrations |
| **Security Headers** | Helmet | 7.1.0 | Express security | OWASP security best practices |
| **OAuth 2.0** | node-oauth2-server | 4.3.0 | OpenEMR authentication | OAuth Authorization Code Grant |
| **JWT** | jsonwebtoken | 9.0.2 | Token management | OpenEMR token handling |
| **Encryption** | node-forge | 1.3.1 | Additional encryption | PHI encryption beyond DB |
| **FHIR** | @types/fhir | 0.0.37 | FHIR R4 types | OpenEMR FHIR API integration |
| **Local Dev** | nodemon | 3.0.2 | Development server | Auto-restart during development |
| **Local Dev** | ts-node | 10.9.2 | TypeScript execution | Direct TS execution in dev |
| **Code Quality** | ESLint | 8.56.0 | Code linting | Healthcare code standards |
| **Code Quality** | Prettier | 3.1.1 | Code formatting | Consistent team formatting |
| **Git Hooks** | Husky | 8.0.3 | Pre-commit validation | Prevent non-compliant commits |
| **Secrets** | AWS Secrets Manager | - | Credential rotation | OpenEMR API keys, automatic rotation |
| **Backup** | AWS Backup | - | Automated backups | HIPAA retention requirements |
| **Cost Monitoring** | AWS Budgets | - | Budget alerts | Stay within $2-3K monthly |

## HIPAA Compliance Additions:

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|----------|
| **Compliance** | AWS CloudTrail | - | Immutable audit logs | HIPAA 2025 audit requirements |
| **Compliance** | AWS Config | - | Resource compliance | Track security configuration changes |
| **Vulnerability** | AWS Inspector | - | Bi-annual vulnerability scans | HIPAA 2025 enhanced requirements |
| **Encryption** | AWS KMS | - | Key management | Centralized key rotation for PHI |
| **Network Security** | AWS WAF | - | Web application firewall | Protect against OWASP Top 10 |
| **Identity** | AWS IAM | - | Role-based access | Principle of least privilege |

## OpenEMR Integration Specifics:

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|----------|
| **OpenEMR Client** | Custom OAuth2 Client | - | OpenEMR 7.0.3 integration | Authorization Code Grant flow |
| **FHIR Support** | @smile-cdr/fhirpath | 2.3.0 | FHIR R4 query support | Navigate FHIR resources |
| **HL7/FHIR** | fhir-kit-client | 1.9.0 | FHIR client library | Robust FHIR operations |
| **Medical Validation** | Custom validators | - | Medical data validation | Appointment time slots, patient data |
