# Epic 3: Appointment Scheduling Core

Deliver the core revenue-generating capability by implementing complete appointment scheduling workflow with real-time OpenEMR integration. This epic enables patients to book, reschedule, and cancel appointments 24/7 through natural voice interactions, directly addressing the $400-800 daily revenue loss identified in the project brief. The scheduling system includes conflict prevention, confirmation protocols, and seamless integration with existing practice workflows.

## Story 3.1: Appointment Availability Lookup
**As a** patient,  
**I want** to know when appointments are available,  
**so that** I can choose a convenient time for my eye exam without multiple phone calls.

### Acceptance Criteria
1. Implement real-time calendar lookup in OpenEMR showing available appointment slots for next 60 days
2. Create intelligent slot filtering based on appointment type (routine exam, follow-up, urgent)
3. Design natural language responses for availability queries ("What times are available next week?")
4. Implement business rule filtering (no appointments during lunch, buffer time between patients)
5. Handle multiple appointment type scenarios with appropriate time slot allocations
6. Test availability lookup performance under concurrent patient request load

## Story 3.2: New Appointment Booking
**As a** patient,  
**I want** to schedule a new appointment through voice conversation,  
**so that** I can secure my preferred time without waiting for business hours.

### Acceptance Criteria
1. Implement complete appointment booking workflow from availability check to OpenEMR confirmation
2. Create natural conversation flow that collects appointment type, preferred dates/times, and special requirements
3. Design confirmation protocol that repeats appointment details and requires explicit patient approval
4. Implement conflict detection and alternative suggestion when selected times become unavailable
5. Generate unique appointment confirmation numbers and provide multiple confirmation methods
6. Test booking workflow with various patient scenarios including first-time and returning patients

## Story 3.3: Appointment Rescheduling
**As a** patient,  
**I want** to change my existing appointment time,  
**so that** I can accommodate schedule changes without losing my appointment slot.

### Acceptance Criteria
1. Implement appointment lookup using patient verification and existing appointment identification
2. Create rescheduling workflow that shows current appointment details and available alternatives
3. Design cancellation and rebooking logic that preserves appointment priority when possible
4. Implement automatic notification to practice staff for rescheduled appointments requiring special preparation
5. Handle rescheduling restrictions (minimum advance notice, busy periods, same-day limitations)
6. Test rescheduling scenarios including last-minute changes and high-demand periods

## Story 3.4: Appointment Cancellation
**As a** patient,  
**I want** to cancel my appointment when necessary,  
**so that** the time slot becomes available for other patients and I follow proper cancellation protocol.

### Acceptance Criteria
1. Implement appointment cancellation with patient verification and appointment confirmation
2. Create cancellation confirmation process that provides cancellation reference numbers
3. Design automatic waitlist notification system for newly available appointment slots
4. Implement cancellation policy enforcement (minimum notice requirements, cancellation limits)
5. Generate staff notifications for cancellations that require follow-up or rescheduling assistance
6. Test cancellation scenarios including emergency cancellations and no-show prevention

## Story 3.5: Appointment Confirmation and Reminders
**As a** patient,  
**I want** to receive confirmation of my appointment details,  
**so that** I have accurate information and can prepare appropriately for my visit.

### Acceptance Criteria
1. Implement immediate appointment confirmation with complete details (date, time, location, preparation instructions)
2. Create multiple confirmation delivery options (voice confirmation, text message, email if available)
3. Design preparation instruction delivery based on appointment type and patient needs
4. Implement appointment detail lookup capability for patients who need to verify their appointment information
5. Create confirmation number system that staff can use to quickly locate appointments
6. Test confirmation delivery reliability and patient comprehension across different scenarios
