# Voice Agent Development Setup

This guide helps you run the Voice Agent system locally for MVP development without requiring HIPAA-compliant AWS infrastructure.

## Prerequisites

- Node.js 20.11.0+ and npm 10.0.0+
- Docker and Docker Compose
- Git

## Quick Start (Docker - Recommended)

1. **Clone and setup the project:**
   ```bash
   git clone <repository-url>
   cd voice-agent
   npm install
   ```

2. **Start the development environment:**
   ```bash
   npm run setup:dev
   ```

   This will:
   - Copy development environment variables
   - Start PostgreSQL, Redis, LocalStack (AWS services)
   - Start mock OpenEMR API
   - Build and start all microservices
   - Set up Nginx reverse proxy

3. **Access the application:**
   - **Admin Dashboard**: http://localhost:8080
   - **Voice AI Service**: http://localhost:8080/api/voice/
   - **Patient Service**: http://localhost:8080/api/patient/
   - **Scheduling Service**: http://localhost:8080/api/scheduling/
   - **Audit Service**: http://localhost:8080/api/audit/
   - **Mock OpenEMR**: http://localhost:8080/api/openemr/

4. **Check system health:**
   ```bash
   npm run health:check
   # Should return: healthy
   ```

## Development Workflow

### Starting Development
```bash
# Start all services in the background
npm run docker:dev:detached

# View logs from all services
npm run docker:dev:logs

# View logs from specific service
docker-compose -f docker-compose.dev.yml logs -f voice-ai-service
```

### Making Code Changes
Code changes are automatically reflected in the running containers through volume mounts. Services will restart automatically when you modify files.

### Database Operations
```bash
# Reset database to clean state
npm run db:reset

# Run database migrations
npm run db:migrate

# Seed with development data
npm run db:seed
```

### Testing
```bash
# Run all tests
npm test

# Run integration tests
npm run test:integration

# Test OpenEMR connectivity
npm run openemr:test
```

### Stopping Services
```bash
# Stop all services
npm run docker:dev:down

# Stop and remove all data (clean slate)
npm run docker:dev:clean

# Rebuild everything from scratch
npm run docker:dev:rebuild
```

## Local Development (Without Docker)

If you prefer to run services directly on your machine:

1. **Install and start dependencies:**
   ```bash
   # Install PostgreSQL 15+ and Redis 7+
   # Start both services
   
   # Install LocalStack
   pip install localstack
   localstack start -d
   ```

2. **Setup environment:**
   ```bash
   npm run setup:local
   ```

3. **Start services:**
   ```bash
   npm run dev:all
   ```

## Service Architecture

### Core Services (Port Mapping)
- **voice-ai-service**: 3001 → handles voice interactions and escalations
- **patient-verification-service**: 3002 → manages patient identity verification
- **scheduling-service**: 3003 → handles appointment scheduling
- **audit-service**: 3004 → manages audit logs and compliance
- **admin-dashboard**: 3005 → staff management interface

### Infrastructure Services
- **postgres**: 5432 → main database
- **redis**: 6379 → session and cache store
- **localstack**: 4566 → AWS services mock (S3, SQS, etc.)
- **mock-openemr**: 8088 → OpenEMR API mock
- **nginx**: 8080 → reverse proxy and load balancer

## Configuration

### Environment Files
- **`.env.development`** → Development configuration (Docker)
- **`.env.example`** → Template for production settings

### Key Configuration Options
```bash
# Switch to mock OpenEMR (recommended for development)
USE_MOCK_API=true

# Enable development features
ENABLE_API_DOCUMENTATION=true
ENABLE_SWAGGER_UI=true
ENABLE_HOT_RELOAD=true

# Disable production security features for easier development
DISABLE_HTTPS_REDIRECT=true
ENABLE_CORS_ALL_ORIGINS=true
```

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   ```bash
   # Check what's using your ports
   lsof -i :5432  # PostgreSQL
   lsof -i :6379  # Redis
   lsof -i :8080  # Nginx proxy
   ```

2. **Docker issues:**
   ```bash
   # Clean everything and start fresh
   npm run docker:dev:clean
   docker system prune -f
   npm run docker:dev
   ```

3. **Database connection errors:**
   ```bash
   # Check database status
   docker-compose -f docker-compose.dev.yml logs postgres
   
   # Reset database
   npm run db:reset
   ```

4. **Service not responding:**
   ```bash
   # Check service logs
   docker-compose -f docker-compose.dev.yml logs [service-name]
   
   # Restart specific service
   docker-compose -f docker-compose.dev.yml restart [service-name]
   ```

### Health Check Endpoints
- Main health: http://localhost:8080/health
- Voice AI: http://localhost:3001/health
- Patient Service: http://localhost:3002/health
- Scheduling: http://localhost:3003/health
- Audit: http://localhost:3004/health
- Admin: http://localhost:3005/health

## Development Features

### Mock Data
- The system includes Capitol Eye Care practice data
- Mock patient records for testing
- Sample appointment schedules
- Pre-configured escalation scenarios

### API Documentation
When running in development mode:
- Swagger UI available at each service's `/docs` endpoint
- API documentation automatically generated
- Interactive testing interface

### Logging
- Structured JSON logging in development
- All service logs centralized through Docker Compose
- Debug level logging enabled by default

## Next Steps

Once you have the system running locally:

1. **Test the basic functionality:**
   - Patient verification flow
   - Escalation triggers
   - Mock OpenEMR integration

2. **Implement voice features:**
   - Twilio telephony integration
   - OpenAI Whisper speech-to-text
   - ElevenLabs text-to-speech

3. **Build conversation management:**
   - Multi-turn dialogue handling
   - Context preservation
   - Natural language understanding

## Getting Help

- Check service logs: `npm run docker:dev:logs`
- Review health endpoints for service status
- Consult individual service README files in `packages/*/`
- Check the main project documentation in `docs/`