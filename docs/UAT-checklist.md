# Voice Agent UAT Checklist
**Version:** 1.0
**Date:** September 17, 2025
**Project:** Capitol Eye Care Voice AI System

## Executive Summary
This checklist covers User Acceptance Testing for the Voice Agent system with 22 completed stories across 3 epics. Each section includes specific test scenarios, expected outcomes, and acceptance criteria.

## UAT Test Environment Requirements
- [ ] Twilio phone number configured
- [ ] OpenEMR test environment with sample patients
- [ ] Redis and PostgreSQL databases running
- [ ] All API keys configured (OpenAI, ElevenLabs, Twilio)
- [ ] Test phone numbers for elderly patient simulation
- [ ] Staff dashboard access for monitoring

---

## Epic 1: Foundation & Infrastructure

### Story 1.4: Basic Voice AI Telephony Integration
**Test Lead:** Operations Team
**Priority:** P0 - Critical

#### Test Scenarios:
- [ ] **TC-1.4.1:** Call the system and verify greeting message
  - Expected: Clear, elderly-friendly greeting at 160 WPM
  - Acceptance: Voice is clear and pace is appropriate

- [ ] **TC-1.4.2:** Ask for practice hours
  - Input: "What are your hours?" / "When are you open?"
  - Expected: Accurate current day hours with clear pronunciation

- [ ] **TC-1.4.3:** Test voice recognition accuracy
  - Input: Various accents and speaking speeds
  - Expected: >95% recognition accuracy

- [ ] **TC-1.4.4:** Verify graceful error handling
  - Input: Mumbled/unclear speech
  - Expected: Polite request for clarification

**Sign-off:** _______________

---

## Epic 2: Core Conversation Engine

### Story 2.1: Patient Identity Verification
**Test Lead:** Security Team
**Priority:** P0 - Critical

#### Test Scenarios:
- [ ] **TC-2.1.1:** Successful patient verification
  - Input: Valid patient name, DOB, phone
  - Expected: Verification success within 3 attempts

- [ ] **TC-2.1.2:** Failed verification escalation
  - Input: 3 incorrect attempts
  - Expected: Automatic escalation to staff

- [ ] **TC-2.1.3:** Session timeout handling
  - Test: Wait 15 minutes inactive
  - Expected: Session expires, requires restart

- [ ] **TC-2.1.4:** HIPAA compliance verification
  - Check: Audit logs created, PHI encrypted
  - Expected: Complete audit trail, no plain text PHI

**Sign-off:** _______________

### Story 2.2: Natural Language Understanding
**Test Lead:** QA Team
**Priority:** P0 - Critical

#### Test Scenarios:
- [ ] **TC-2.2.1:** Intent recognition accuracy
  - Test all 16 intents with variations
  - Expected: >85% accuracy across all intents

- [ ] **TC-2.2.2:** Elderly speech pattern handling
  - Input: Slow, repetitive speech
  - Expected: Patient handling without frustration

- [ ] **TC-2.2.3:** Medical terminology recognition
  - Input: "I need to see Dr. Smith for my cataracts"
  - Expected: Correct entity extraction

- [ ] **TC-2.2.4:** Ambiguous request clarification
  - Input: "I need an appointment"
  - Expected: Asks for appointment type/timeframe

**Sign-off:** _______________

### Story 2.3: Practice Information Response System
**Test Lead:** Operations Team
**Priority:** P1 - High

#### Test Scenarios:
- [ ] **TC-2.3.1:** Business hours inquiry
  - Test: Current day, tomorrow, specific days
  - Expected: Accurate hours with timezone

- [ ] **TC-2.3.2:** Location information
  - Input: "Where are you located?"
  - Expected: Full address with landmarks

- [ ] **TC-2.3.3:** Insurance inquiry
  - Input: "Do you take Medicare?"
  - Expected: Accurate insurance list

- [ ] **TC-2.3.4:** Holiday schedule handling
  - Test: Query during holiday week
  - Expected: Correct closure information

**Sign-off:** _______________

### Story 2.4: Multi-Turn Conversation Management
**Test Lead:** QA Team
**Priority:** P0 - Critical

#### Test Scenarios:
- [ ] **TC-2.4.1:** Context preservation
  - Test: Multiple related questions
  - Expected: Remembers previous context

- [ ] **TC-2.4.2:** Topic change detection
  - Test: Switch from hours to appointment
  - Expected: Smooth transition

- [ ] **TC-2.4.3:** Pronoun resolution
  - Input: "What about tomorrow?" (after asking about today)
  - Expected: Understands reference

- [ ] **TC-2.4.4:** Session timeout warning
  - Test: 8-minute mark inactive
  - Expected: Warning message

**Sign-off:** _______________

### Story 2.5: Human Escalation Integration
**Test Lead:** Operations Team
**Priority:** P0 - Critical

#### Test Scenarios:
- [ ] **TC-2.5.1:** Emergency escalation
  - Input: "I have an eye emergency"
  - Expected: Immediate staff notification

- [ ] **TC-2.5.2:** Frustration detection
  - Input: Multiple "I don't understand"
  - Expected: Offers human assistance

- [ ] **TC-2.5.3:** Staff notification system
  - Test: Trigger escalation
  - Expected: WebSocket alert to dashboard

- [ ] **TC-2.5.4:** Context handoff
  - Test: Escalate mid-conversation
  - Expected: Full context transferred

**Sign-off:** _______________

---

## Epic 3: Appointment Management

### Story 3.3: Appointment Management and Changes
**Test Lead:** Scheduling Team
**Priority:** P0 - Critical

#### Test Scenarios:
- [ ] **TC-3.3.1:** Appointment lookup
  - Input: Confirmation number
  - Expected: Correct appointment details

- [ ] **TC-3.3.2:** Reschedule with policy
  - Test: <24hr notice
  - Expected: Fee warning, alternatives offered

- [ ] **TC-3.3.3:** Cancellation flow
  - Test: Various notice periods
  - Expected: Correct fees applied

- [ ] **TC-3.3.4:** Type change
  - Test: Routine to urgent
  - Expected: Duration adjustment

**Sign-off:** _______________

### Story 3.4: Enhanced Cancellation System
**Test Lead:** Operations Team
**Priority:** P1 - High

#### Test Scenarios:
- [ ] **TC-3.4.1:** Waitlist management
  - Test: Cancel with waitlist match
  - Expected: Automatic notification

- [ ] **TC-3.4.2:** Emergency cancellation
  - Input: "Family emergency"
  - Expected: No fees, priority handling

- [ ] **TC-3.4.3:** Confirmation delivery
  - Test: All channels (voice, SMS, email)
  - Expected: Reference number provided

- [ ] **TC-3.4.4:** Staff notifications
  - Test: Various priority levels
  - Expected: Correct SLA enforcement

**Sign-off:** _______________

### Story 3.5: Confirmation and Reminders
**Test Lead:** Operations Team
**Priority:** P1 - High

#### Test Scenarios:
- [ ] **TC-3.5.1:** Immediate confirmation
  - Test: Book appointment
  - Expected: Voice confirmation with number

- [ ] **TC-3.5.2:** 24-hour reminder
  - Test: Check reminder delivery
  - Expected: SMS/email 24hr before

- [ ] **TC-3.5.3:** Preparation instructions
  - Test: Eye exam appointment
  - Expected: "Don't wear contacts" instruction

- [ ] **TC-3.5.4:** Two-way SMS
  - Test: Reply "YES" to confirm
  - Expected: System acknowledges

**Sign-off:** _______________

### Appointment Availability System
**Test Lead:** Scheduling Team
**Priority:** P0 - Critical

#### Test Scenarios:
- [ ] **TC-3.A.1:** Natural language queries
  - Input: "Do you have anything tomorrow morning?"
  - Expected: Available slots or alternatives

- [ ] **TC-3.A.2:** Business rules application
  - Test: Buffer times, lunch breaks
  - Expected: Correct filtering

- [ ] **TC-3.A.3:** Provider-specific availability
  - Input: "I want to see Dr. Johnson"
  - Expected: Only Dr. Johnson's slots

- [ ] **TC-3.A.4:** No availability handling
  - Test: Fully booked day
  - Expected: Suggests alternatives

**Sign-off:** _______________

---

## Integration Testing

### Cross-Story Integration Tests
**Test Lead:** QA Team
**Priority:** P0 - Critical

#### End-to-End Scenarios:
- [ ] **TC-INT-1:** Complete appointment booking flow
  1. Call system
  2. Verify identity
  3. Request appointment
  4. Check availability
  5. Book appointment
  6. Receive confirmation
  - Expected: Seamless flow completion

- [ ] **TC-INT-2:** Appointment modification flow
  1. Call system
  2. Verify identity
  3. Lookup existing appointment
  4. Request reschedule
  5. Check new availability
  6. Confirm change
  - Expected: Successful modification

- [ ] **TC-INT-3:** Information inquiry flow
  1. Call system
  2. Ask about hours
  3. Ask about insurance
  4. Ask about location
  - Expected: All information accurate

- [ ] **TC-INT-4:** Escalation flow
  1. Call system
  2. Express confusion/frustration
  3. System offers human help
  4. Staff receives notification
  - Expected: <2min staff response

**Sign-off:** _______________

---

## Performance & Reliability Testing

### System Performance Metrics
**Test Lead:** DevOps Team
**Priority:** P1 - High

#### Performance Benchmarks:
- [ ] **Response Time:** <2 seconds for all queries
- [ ] **Concurrent Calls:** Handle 10+ simultaneous
- [ ] **Voice Recognition:** >95% accuracy
- [ ] **System Uptime:** 99.9% availability
- [ ] **Error Rate:** <0.1% failed interactions

**Sign-off:** _______________

---

## Accessibility Testing

### Elderly User Acceptance
**Test Lead:** UX Team
**Priority:** P0 - Critical

#### Accessibility Requirements:
- [ ] **Speech Rate:** 150-170 WPM verified
- [ ] **Pause Duration:** 0.5-1s between prompts
- [ ] **Clarity:** No medical jargon
- [ ] **Repetition:** Tolerates repeated questions
- [ ] **Volume:** Clear at normal phone volume

**Test Group:** 5+ users age 65+
**Acceptance Rate Required:** >80% satisfaction

**Sign-off:** _______________

---

## Security & Compliance Testing

### HIPAA Compliance Verification
**Test Lead:** Security Team
**Priority:** P0 - Critical

#### Security Checklist:
- [ ] **PHI Encryption:** All data encrypted
- [ ] **Audit Logging:** Complete trail exists
- [ ] **Access Control:** Role-based access works
- [ ] **Data Retention:** 7-year policy configured
- [ ] **Session Security:** Timeouts enforced

**Sign-off:** _______________

---

## UAT Acceptance Criteria

### Pass Criteria:
- All P0 test cases: 100% pass
- P1 test cases: >95% pass
- P2 test cases: >90% pass
- No critical bugs unresolved
- Performance metrics met
- Elderly user acceptance >80%

### UAT Sign-off

**Operations Manager:** _______________ Date: _______

**Medical Director:** _______________ Date: _______

**IT Manager:** _______________ Date: _______

**Compliance Officer:** _______________ Date: _______

---

## Issues Log

| ID | Test Case | Issue Description | Severity | Status | Resolution |
|----|-----------|------------------|----------|--------|------------|
| | | | | | |
| | | | | | |
| | | | | | |

---

## Notes & Observations

_Space for additional testing notes and observations during UAT_

---

**Document Version Control:**
- v1.0 - Initial UAT checklist creation (Sept 17, 2025)