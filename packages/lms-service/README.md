# Learning Management System (LMS) Service

Staff training and documentation system for the AI voice agent platform.

## Features

- **Learning Modules**: Structured training content with assessments
- **Training Scenarios**: Interactive simulations for hands-on practice
- **Progress Tracking**: Individual and team progress monitoring
- **Quick Reference Guides**: Easy access to troubleshooting and procedures
- **HIPAA Compliance**: Built-in privacy protection and audit logging
- **Analytics**: Comprehensive training effectiveness reporting

## API Endpoints

### Learning Modules
- `GET /api/learning-modules` - Get all modules
- `GET /api/learning-modules/:id` - Get specific module
- `GET /api/learning-modules/difficulty/:level` - Filter by difficulty
- `POST /api/learning-modules` - Create module (admin)
- `PUT /api/learning-modules/:id` - Update module (admin)
- `DELETE /api/learning-modules/:id` - Delete module (admin)

### Training Scenarios
- `GET /api/training-scenarios` - Get all scenarios
- `GET /api/training-scenarios/:id` - Get specific scenario
- `GET /api/training-scenarios/type/:type` - Filter by type
- `GET /api/training-scenarios/difficulty/:level` - Filter by difficulty
- `POST /api/training-scenarios` - Create scenario (admin)

### User Progress
- `GET /api/user-progress/:userId` - Get user progress
- `PUT /api/user-progress/:userId/module/:moduleId` - Update progress
- `POST /api/user-progress/:userId/module/:moduleId/complete` - Complete module
- `GET /api/analytics/training` - Training analytics (admin)

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

## Default Training Modules

1. **AI System Fundamentals** - Understanding AI capabilities and limitations
2. **Dashboard Navigation** - Mastering the staff dashboard interface
3. **Escalation Handling** - Managing patient escalations effectively
4. **HIPAA Compliance** - Privacy protection in AI-enhanced workflows
5. **Troubleshooting** - Resolving common technical issues

## Quick Reference Guides

- **Escalation Priority Guide** - Response times and priority levels
- **Troubleshooting Common Issues** - Technical problem resolution
- **HIPAA Compliance Checklist** - Privacy protection guidelines

## Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test learningModuleService.test.ts
```

## Environment Variables

```env
PORT=3006
NODE_ENV=development
JWT_SECRET=your-secret-key
LOG_LEVEL=info
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Authentication

The service uses JWT tokens for authentication. Demo endpoints are available for testing:

```bash
# Get demo user token
POST /auth/demo-login
{
  "role": "staff"  // or "admin"
}
```

## Logging & Audit

All user actions are logged for HIPAA compliance:
- User access events
- Data modifications
- Security events
- Performance metrics

## Development

The service follows microservices architecture principles:
- TypeScript for type safety
- Express.js for HTTP API
- Zod for schema validation
- Winston for structured logging
- Jest for testing