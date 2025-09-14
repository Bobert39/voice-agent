# AI Voice Agent for Optometry Practice

A HIPAA-compliant voice interaction system designed specifically for optometry practices, featuring OpenEMR integration and comprehensive patient data protection.

## 🏥 Overview

This AI Voice Agent automates voice interactions for optometry practices, enabling:
- **Voice-to-Voice Conversations**: Natural language patient interactions
- **Appointment Scheduling**: Seamless OpenEMR integration for booking appointments
- **Patient Verification**: HIPAA-compliant identity verification
- **Audit Logging**: Comprehensive compliance tracking
- **Admin Dashboard**: Real-time monitoring and management

## 🏗️ Architecture

### Monorepo Structure
```
voice-agent/
├── packages/
│   ├── shared-utils/          # Common utilities and types
│   ├── voice-ai-service/      # Voice processing (port 3001)
│   ├── scheduling-service/    # OpenEMR integration (port 3002)
│   ├── patient-verification/  # Identity verification (port 3003)
│   ├── audit-service/         # HIPAA audit logging (port 3004)
│   └── admin-dashboard/       # Web dashboard (port 3000)
├── infrastructure/            # AWS deployment configs
└── docs/                     # Architecture and PRD documentation
```

### Service Ports
| Service | Port | Purpose |
|---------|------|---------|
| **Admin Dashboard** | 3000 | Web interface and API gateway |
| **Voice AI Service** | 3001 | Speech-to-text, NLP, text-to-speech |
| **Scheduling Service** | 3002 | OpenEMR integration and appointments |
| **Patient Verification** | 3003 | HIPAA-compliant identity validation |
| **Audit Service** | 3004 | Compliance logging and audit trails |

## 🚀 Quick Start

### Prerequisites
- **Node.js**: 20.11.0 LTS or higher
- **npm**: 10.0.0 or higher  
- **PostgreSQL**: 15.4+ (for production)
- **Redis**: 7.2+ (for caching and sessions)
- **OpenEMR**: 7.0.3+ (for practice integration)

### Development Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd voice-agent
   npm install
   ```

2. **Environment Configuration**
   ```bash
   # Copy environment templates
   cp packages/voice-ai-service/.env.example packages/voice-ai-service/.env
   cp packages/scheduling-service/.env.example packages/scheduling-service/.env
   cp packages/patient-verification-service/.env.example packages/patient-verification-service/.env
   cp packages/audit-service/.env.example packages/audit-service/.env
   cp packages/admin-dashboard/.env.example packages/admin-dashboard/.env
   
   # Configure your actual API keys and database URLs
   # ⚠️  NEVER commit real secrets to version control
   ```

3. **Build All Services**
   ```bash
   npm run build
   ```

4. **Start Development Environment**
   ```bash
   # Start all services concurrently
   npm run dev:all
   
   # Or start individual services
   npm run dev --workspace=packages/admin-dashboard
   ```

5. **Access Services**
   - Admin Dashboard: http://localhost:3000
   - Voice AI Service: http://localhost:3001/health
   - Scheduling Service: http://localhost:3002/health
   - Patient Verification: http://localhost:3003/health
   - Audit Service: http://localhost:3004/health

## 🛠️ Development Commands

### Root Level Commands
```bash
# Build all packages
npm run build

# Run all tests
npm run test

# Lint all packages
npm run lint
npm run lint:fix

# Type checking
npm run typecheck

# Clean build artifacts
npm run clean

# Start all services in development
npm run dev:all
```

### Individual Package Commands
```bash
# Work with specific packages
npm run build --workspace=packages/voice-ai-service
npm run test --workspace=packages/scheduling-service
npm run dev --workspace=packages/admin-dashboard
```

## 🧪 Testing

### Running Tests
```bash
# All tests
npm run test

# Specific service
npm run test --workspace=packages/voice-ai-service

# With coverage
npm run test:coverage --workspace=packages/shared-utils

# Watch mode
npm run test:watch --workspace=packages/scheduling-service
```

### Test Structure
Each service follows the healthcare-focused test pyramid:
- **Unit Tests**: 85% coverage requirement
- **Integration Tests**: API endpoint validation
- **End-to-End Tests**: Complete workflow validation
- **HIPAA Compliance Tests**: Security and privacy validation

## 🔐 HIPAA Compliance

### Security Features
- **Encryption**: All PHI encrypted in transit and at rest
- **Audit Logging**: Comprehensive access and activity tracking
- **Access Control**: Role-based permissions and authentication
- **Data Minimization**: Only necessary data collection and processing
- **Secure Communication**: TLS 1.3 for all inter-service communication

### Compliance Standards
- HIPAA Security Rule compliance
- HIPAA Privacy Rule compliance
- SOC 2 Type II controls
- OWASP security best practices

## 🔧 Configuration

### Environment Variables
Each service uses environment-specific configuration:

**Required for All Services:**
- `NODE_ENV`: development|test|staging|production
- `LOG_LEVEL`: debug|info|warn|error
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string

**Service-Specific:**
- **Voice AI Service**: OpenAI, Twilio, ElevenLabs API keys
- **Scheduling Service**: OpenEMR credentials and endpoints
- **Patient Verification**: Encryption keys and audit settings
- **Audit Service**: AWS CloudWatch configuration
- **Admin Dashboard**: JWT secrets and React build settings

### OpenEMR Integration
1. Configure OAuth 2.0 client in OpenEMR admin panel
2. Set client credentials in scheduling service environment
3. Test connection using the connectivity test script:
   ```bash
   npm run test:openemr --workspace=packages/scheduling-service
   ```

## 📊 Monitoring & Logging

### Health Checks
All services expose health endpoints:
```bash
curl http://localhost:3001/health  # Voice AI Service
curl http://localhost:3002/health  # Scheduling Service
curl http://localhost:3003/health  # Patient Verification
curl http://localhost:3004/health  # Audit Service
curl http://localhost:3000/health  # Admin Dashboard
```

### Logging
- **Structured JSON Logging**: Winston with healthcare-specific formatting
- **No PII/PHI Logging**: Strict privacy protection in all log outputs  
- **Audit Trail**: Immutable audit logs for HIPAA compliance
- **Log Retention**: 7-year retention for audit logs, configurable for others

### Monitoring
- **Application Metrics**: Custom CloudWatch metrics
- **Performance Monitoring**: Response times and error rates
- **Security Monitoring**: Failed authentication attempts and suspicious activity
- **Compliance Monitoring**: Audit log integrity and access patterns

## 🚢 Deployment

### Production Deployment
```bash
# Build for production
NODE_ENV=production npm run build

# Start production server
npm start --workspace=packages/admin-dashboard
```

### Infrastructure
- **Cloud Provider**: AWS (HIPAA-compliant configuration)
- **Deployment**: AWS Lambda + API Gateway for microservices
- **Database**: Amazon RDS PostgreSQL with encryption
- **Caching**: Amazon ElastiCache Redis
- **Monitoring**: CloudWatch + AWS X-Ray
- **Security**: AWS WAF + IAM roles

See `infrastructure/` directory for complete deployment configurations.

## 🤝 Contributing

### Development Standards
- **TypeScript**: Strict mode enabled for type safety
- **ESLint**: Healthcare-specific linting rules
- **Prettier**: Consistent code formatting
- **Husky**: Pre-commit hooks for quality gates
- **Conventional Commits**: Standardized commit messages

### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with comprehensive tests
3. Ensure all quality gates pass:
   ```bash
   npm run typecheck
   npm run lint
   npm run test
   npm run build
   ```
4. Submit pull request with detailed description
5. Code review and approval required

## 📚 Documentation

### Architecture Documentation
- **High-Level Architecture**: `docs/architecture/high-level-architecture.md`
- **Database Schema**: `docs/architecture/database-schema.md`
- **API Specifications**: `docs/architecture/rest-api-spec.md`
- **Security Design**: `docs/architecture/security.md`
- **Testing Strategy**: `docs/architecture/test-strategy-and-standards.md`

### Integration Guides
- **OpenEMR Integration**: `docs/openemr-integration-guide.md`
- **Infrastructure Setup**: `infrastructure/README.md`

## 🆘 Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

**Service Connection Issues:**
- Verify environment variables are set correctly
- Check service health endpoints
- Review logs for specific error messages

**OpenEMR Connection:**
- Verify OpenEMR credentials in scheduling service .env
- Test OAuth 2.0 flow using integration test
- Check OpenEMR server accessibility and CORS settings

**Database Connection:**
- Verify PostgreSQL is running and accessible
- Check DATABASE_URL format and credentials
- Ensure database exists and migrations are applied

### Getting Help
- Check existing issues: [GitHub Issues](../../issues)
- Review documentation in `docs/` directory
- Contact development team for HIPAA-related questions

## 📄 License

This project is proprietary and confidential. All rights reserved.

**HIPAA Notice**: This system processes Protected Health Information (PHI). Access is restricted to authorized personnel only. All usage is logged and monitored for compliance purposes.

---

**🏥 Built specifically for optometry practices with HIPAA compliance and patient privacy as top priorities.**