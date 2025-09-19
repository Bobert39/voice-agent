# Test Levels Framework

## Overview
This framework defines when to use Unit, Integration, and E2E tests to optimize test coverage while maintaining efficiency.

## Test Level Decision Criteria

### Unit Tests
**Purpose**: Test isolated logic, algorithms, and calculations

**Use Unit Tests When**:
- Testing pure functions with no external dependencies
- Validating business logic and calculations
- Testing data transformations and formatting
- Verifying input validation and error handling
- Testing utility functions and helpers

**Characteristics**:
- Fast execution (<100ms per test)
- No database, network, or file system access
- Fully deterministic and repeatable
- Mock all external dependencies
- Test individual methods/functions in isolation

**Examples for Voice Agent**:
- Appointment duration calculations
- Date/time formatting for elderly-friendly display
- Confirmation number generation algorithms
- Business hours validation logic
- Phone number formatting

### Integration Tests
**Purpose**: Test component interactions and external integrations

**Use Integration Tests When**:
- Testing database operations (CRUD)
- Verifying API endpoint functionality
- Testing service-to-service communication
- Validating external API integrations (OpenEMR, Twilio, etc.)
- Testing Redis session management
- Verifying message queue operations

**Characteristics**:
- Moderate execution time (100ms-5s per test)
- May use test databases or containers
- Tests multiple components working together
- Some external dependencies may be mocked
- Focus on interface contracts and data flow

**Examples for Voice Agent**:
- Patient verification service with OpenEMR
- Appointment booking workflow
- Conversation state management in Redis
- Voice processing pipeline (STT/TTS)
- Multi-service escalation flow

### End-to-End (E2E) Tests
**Purpose**: Validate critical user journeys and compliance requirements

**Use E2E Tests When**:
- Testing complete user workflows
- Validating HIPAA compliance scenarios
- Testing critical business processes
- Verifying accessibility requirements
- Testing error recovery and escalation paths
- Validating multi-channel communication flows

**Characteristics**:
- Slow execution (>5s per test)
- Uses real or production-like environment
- Tests entire system integration
- Minimal mocking (only external third parties)
- Focus on user experience and business outcomes

**Examples for Voice Agent**:
- Complete appointment booking call flow
- Patient verification with escalation
- Emergency appointment handling
- Multi-turn conversation with context preservation
- Appointment confirmation delivery across channels

## Decision Matrix

| Scenario | Unit | Integration | E2E | Reasoning |
|----------|------|-------------|-----|-----------|
| Business rule validation | ✅ | ❌ | ❌ | Pure logic, no dependencies |
| Database CRUD operations | ❌ | ✅ | ❌ | Requires DB interaction |
| API endpoint testing | ❌ | ✅ | ❌ | Service boundary testing |
| User authentication flow | ❌ | ✅ | ✅ | Security critical path |
| Appointment booking journey | ❌ | ✅ | ✅ | Core business function |
| Date/time calculations | ✅ | ❌ | ❌ | Pure function logic |
| Voice recognition accuracy | ❌ | ✅ | ❌ | External service integration |
| HIPAA compliance flow | ❌ | ❌ | ✅ | Regulatory requirement |
| Error message formatting | ✅ | ❌ | ❌ | Pure transformation |
| Multi-service orchestration | ❌ | ✅ | ✅ | Complex interaction |

## Test Pyramid Guidelines

### Ideal Distribution
- **Unit Tests**: 70% - Fast feedback, high coverage
- **Integration Tests**: 20% - Critical integrations
- **E2E Tests**: 10% - Essential user journeys

### Anti-Patterns to Avoid
1. **Ice Cream Cone**: Too many E2E tests, few unit tests
2. **Hourglass**: Many unit and E2E tests, few integration tests
3. **Rectangle**: Equal distribution (inefficient)

## Best Practices

### Unit Tests
- Use test doubles (mocks, stubs, fakes) for dependencies
- Test edge cases and error conditions
- Keep tests focused on single behavior
- Use descriptive test names
- Aim for <100ms execution time

### Integration Tests
- Use test containers for databases
- Reset state between tests
- Test happy paths and error scenarios
- Verify data persistence and retrieval
- Focus on service boundaries

### E2E Tests
- Prioritize critical user journeys
- Use page object pattern for maintainability
- Implement retry logic for flakiness
- Run in CI/CD pipeline
- Generate visual test reports

## Framework Application

When designing tests for a new feature:
1. Start with unit tests for business logic
2. Add integration tests for service interactions
3. Create E2E tests only for critical paths
4. Review test distribution against pyramid
5. Optimize for fast feedback and reliability