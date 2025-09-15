/**
 * TypeScript type definitions for Scheduling Service
 */

export interface SchedulingServiceConfig {
  openemr: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    site?: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  cache: {
    enabled: boolean;
    ttl: number;
  };
  businessRules: BusinessRules;
}

export interface BusinessRules {
  businessHours: BusinessHours;
  appointmentDurations: AppointmentDurations;
  bufferTimes: BufferTimes;
  holidays: string[];
  blockedTimes: BlockedTime[];
}

export interface BusinessHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  lunchStart?: string;
  lunchEnd?: string;
}

export interface AppointmentDurations {
  routine: number;
  'follow-up': number;
  urgent: number;
}

export interface BufferTimes {
  standard: number;
  complex: number;
}

export interface BlockedTime {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface AvailabilityRequest {
  query: string;
  patientId?: string;
  conversationId: string;
  context?: {
    preferredProvider?: string;
    lastAppointmentType?: string;
    specialNeeds?: string[];
  };
}

export interface AvailabilityResponse {
  success: boolean;
  message: string;
  slots?: TimeSlot[];
  requiresClarification?: boolean;
  clarificationType?: string;
  error?: string;
}

export interface TimeSlot {
  datetime: string;
  practitioner: string;
  practitionerId: string;
  duration: number;
  appointmentType: string;
  available: boolean;
}

export interface BookingRequest {
  slotId: string;
  patientId: string;
  appointmentType: 'routine' | 'follow-up' | 'urgent';
  reason?: string;
  specialRequirements?: string[];
  conversationId: string;
}

export interface BookingResponse {
  success: boolean;
  appointmentId?: string;
  confirmationNumber?: string;
  message: string;
  error?: string;
}

export interface CancellationRequest {
  appointmentId: string;
  patientId: string;
  reason?: string;
  conversationId: string;
}

export interface CancellationResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface AppointmentDetails {
  id: string;
  patientId: string;
  patientName: string;
  practitionerId: string;
  practitionerName: string;
  datetime: string;
  duration: number;
  type: string;
  status: string;
  reason?: string;
  specialRequirements?: string[];
  confirmationNumber: string;
}

export interface SchedulingMetrics {
  totalQueries: number;
  successfulBookings: number;
  failedBookings: number;
  cancellations: number;
  averageResponseTime: number;
  cacheHitRate: number;
  popularTimeSlots: Record<string, number>;
  popularProviders: Record<string, number>;
}

// Story 3.3: Appointment Management Types

export interface AppointmentLookupRequest {
  // Support multiple lookup methods
  confirmationNumber?: string;
  phoneNumber?: string;
  patientId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  conversationId: string;
}

export interface AppointmentLookupResponse {
  success: boolean;
  message: string;
  appointments?: AppointmentDetails[];
  requiresVerification?: boolean;
  verificationMethod?: 'phone' | 'dob' | 'name';
  error?: string;
}

export interface AppointmentModificationRequest {
  appointmentId: string;
  patientId: string;
  modificationType: 'reschedule' | 'cancel' | 'change_type';
  newDateTime?: string;
  newAppointmentType?: 'routine' | 'follow-up' | 'urgent';
  reason?: string;
  conversationId: string;
}

export interface AppointmentModificationResponse {
  success: boolean;
  message: string;
  updatedAppointment?: AppointmentDetails;
  newConfirmationNumber?: string;
  cancellationFee?: number;
  requiresApproval?: boolean;
  error?: string;
}

export interface RescheduleRequest {
  appointmentId: string;
  patientId: string;
  preferredDateTime?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  dateRange?: {
    start: string;
    end: string;
  };
  conversationId: string;
}

export interface RescheduleResponse {
  success: boolean;
  message: string;
  availableSlots?: TimeSlot[];
  originalAppointment?: AppointmentDetails;
  requiresConfirmation?: boolean;
  conflictWarning?: string;
  error?: string;
}

export interface CancellationPolicy {
  minimumNoticeHours: number;
  feeSchedule: {
    sameDay: number;
    lessThan24Hours: number;
    lessThan48Hours: number;
    moreThan48Hours: number;
  };
  emergencyExceptions: boolean;
  noShowFee: number;
}

export interface AppointmentChangeHistory {
  id: string;
  appointmentId: string;
  changeType: 'created' | 'rescheduled' | 'cancelled' | 'type_changed';
  previousDetails?: Partial<AppointmentDetails>;
  newDetails?: Partial<AppointmentDetails>;
  reason?: string;
  changedBy: string;
  timestamp: string;
  cancellationFee?: number;
}

export interface AppointmentVerification {
  method: 'confirmation_number' | 'phone_dob' | 'name_dob';
  confirmationNumber?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  lastName?: string;
  verified: boolean;
  attempts: number;
  maxAttempts: number;
}

export interface ModificationConflict {
  type: 'time_conflict' | 'provider_unavailable' | 'room_conflict' | 'policy_violation';
  message: string;
  suggestion?: string;
  alternativeSlots?: TimeSlot[];
}

export interface AppointmentNotification {
  type: 'modification' | 'cancellation' | 'confirmation';
  appointmentId: string;
  patientId: string;
  method: 'voice' | 'sms' | 'email';
  content: string;
  timestamp: string;
  delivered: boolean;
  attempts: number;
}

// Story 3.4: Enhanced Cancellation and Waitlist Types

export interface WaitlistEntry {
  id: string;
  patientId: string;
  patientName: string;
  phoneNumber: string;
  appointmentType: 'routine' | 'follow-up' | 'urgent';
  preferredDates: string[];
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  preferredProvider?: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  createdAt: string;
  notificationPreferences: {
    methods: ('voice' | 'sms' | 'email')[];
    immediateNotify: boolean;
    businessHoursOnly: boolean;
  };
  maxWaitDays: number;
  specialRequirements?: string[];
}

export interface WaitlistNotification {
  id: string;
  waitlistEntryId: string;
  availableSlot: TimeSlot;
  notificationMethod: 'voice' | 'sms' | 'email';
  sentAt: string;
  responseDeadline: string;
  status: 'sent' | 'delivered' | 'responded' | 'expired';
  response?: 'accepted' | 'declined' | 'no_response';
  attempts: number;
  maxAttempts: number;
}

export interface CancellationConfirmation {
  referenceNumber: string;
  appointmentId: string;
  patientId: string;
  cancellationDateTime: string;
  originalAppointment: AppointmentDetails;
  cancellationFee?: number;
  reason?: string;
  deliveryMethods: {
    voice: {
      delivered: boolean;
      deliveredAt?: string;
      confirmed: boolean;
    };
    sms?: {
      delivered: boolean;
      deliveredAt?: string;
      phoneNumber: string;
    };
    email?: {
      delivered: boolean;
      deliveredAt?: string;
      emailAddress: string;
    };
  };
  waitlistNotified: boolean;
  waitlistNotificationCount: number;
}

export interface StaffNotification {
  id: string;
  type: 'cancellation' | 'emergency_cancellation' | 'late_cancellation' | 'waitlist_response';
  priority: 'critical' | 'high' | 'normal' | 'low';
  title: string;
  message: string;
  appointmentId?: string;
  patientId?: string;
  waitlistEntryId?: string;
  requiresAction: boolean;
  actionType?: 'follow_up' | 'reschedule_assistance' | 'billing_review' | 'chart_update';
  createdAt: string;
  assignedTo?: string;
  department?: 'reception' | 'medical' | 'billing' | 'management';
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  notes?: string;
}

export interface WaitlistMatchingCriteria {
  appointmentType: 'routine' | 'follow-up' | 'urgent';
  datetime: string;
  practitionerId: string;
  duration: number;
}

export interface WaitlistMatchResult {
  entry: WaitlistEntry;
  matchScore: number;
  matchReasons: string[];
  estimatedResponse: 'immediate' | 'quick' | 'delayed';
}

export interface EnhancedCancellationRequest extends CancellationRequest {
  emergency?: boolean;
  emergencyReason?: string;
  requestMultipleConfirmation?: boolean;
  preferredConfirmationMethods?: ('voice' | 'sms' | 'email')[];
}

export interface EnhancedCancellationResponse extends CancellationResponse {
  referenceNumber?: string;
  cancellationFee?: number;
  waitlistNotified?: boolean;
  waitlistCount?: number;
  confirmationDelivery?: {
    voice: boolean;
    sms?: boolean;
    email?: boolean;
  };
  staffNotificationSent?: boolean;
  emergencyProtocolActivated?: boolean;
}

// Story 3.5: Appointment Confirmation and Reminders Types

export interface AppointmentConfirmationRequest {
  appointmentId: string;
  patientId: string;
  patientName: string;
  contactInfo: {
    phoneNumber: string;
    email?: string;
  };
  preferredMethods: ('voice' | 'sms' | 'email')[];
  immediateDelivery?: boolean;
  includePreparationInstructions?: boolean;
}

export interface AppointmentConfirmationResponse {
  success: boolean;
  confirmationNumber: string;
  message: string;
  deliveryStatus: {
    voice: ConfirmationDeliveryStatus;
    sms?: ConfirmationDeliveryStatus;
    email?: ConfirmationDeliveryStatus;
  };
  preparationInstructions?: PreparationInstruction[];
  error?: string;
}

export interface ConfirmationDeliveryStatus {
  attempted: boolean;
  delivered: boolean;
  deliveredAt?: string;
  failureReason?: string;
  retryCount: number;
  pronunciationOptimized?: boolean; // For voice confirmations
}

export interface PreparationInstruction {
  type: 'medication' | 'fasting' | 'documents' | 'special_requirements' | 'arrival_time';
  title: string;
  description: string;
  timeframe?: string; // e.g., "24 hours before", "morning of appointment"
  mandatory: boolean;
  elderlyFriendly: boolean;
}

export interface ReminderConfiguration {
  enabled: boolean;
  timingOptions: ReminderTiming[];
  contentCustomization: boolean;
  weatherIntegration: boolean;
  twoWayInteraction: boolean;
}

export interface ReminderTiming {
  offsetHours: number; // Hours before appointment
  label: string; // e.g., "24 hours", "2 hours", "30 minutes"
  appointmentTypes: ('routine' | 'follow-up' | 'urgent')[];
  deliveryMethods: ('voice' | 'sms' | 'email')[];
  priority: 'high' | 'normal' | 'low';
}

export interface AppointmentReminder {
  id: string;
  appointmentId: string;
  patientId: string;
  scheduledFor: string;
  actualSentAt?: string;
  reminderType: 'initial' | 'follow_up' | 'final';
  offsetHours: number;
  deliveryMethod: 'voice' | 'sms' | 'email';
  content: ReminderContent;
  status: 'scheduled' | 'sent' | 'delivered' | 'failed' | 'responded' | 'cancelled';
  response?: ReminderResponse;
  retryCount: number;
  maxRetries: number;
  weatherData?: WeatherData;
}

export interface ReminderContent {
  subject: string;
  message: string;
  preparationInstructions?: PreparationInstruction[];
  appointmentDetails: AppointmentSummary;
  actionRequired?: boolean;
  confirmationRequired?: boolean;
  elderlyOptimized: boolean;
}

export interface ReminderResponse {
  timestamp: string;
  responseType: 'confirmed' | 'reschedule_requested' | 'cancel_requested' | 'question';
  responseContent?: string;
  processed: boolean;
  staffNotificationSent?: boolean;
}

export interface AppointmentSummary {
  date: string;
  time: string;
  provider: string;
  type: string;
  duration: number;
  location: PracticeLocation;
  confirmationNumber: string;
}

export interface PracticeLocation {
  name: string;
  address: string;
  directions?: string;
  parkingInstructions?: string;
  accessibilityNotes?: string;
}

export interface WeatherData {
  condition: string;
  temperature: number;
  precipitation: number;
  advisory?: string; // For travel conditions
}

export interface ConfirmationNumberConfig {
  prefix: string; // e.g., "CE" for Capitol Eye
  length: number;
  includeTimestamp: boolean;
  voiceOptimized: boolean;
  collisionCheckEnabled: boolean;
}

export interface ConfirmationAnalytics {
  totalConfirmationsSent: number;
  deliverySuccessRate: {
    voice: number;
    sms: number;
    email: number;
  };
  averageDeliveryTime: number;
  patientEngagementRate: number;
  attendanceCorrelation: {
    withConfirmation: number;
    withoutConfirmation: number;
  };
  methodPreferences: Record<string, number>;
  preparationInstructionCompliance: number;
}

export interface ReminderAnalytics {
  totalRemindersSent: number;
  responseRate: number;
  attendanceImpact: {
    withReminders: number;
    withoutReminders: number;
  };
  optimalTimingAnalysis: Record<string, number>;
  methodEffectiveness: Record<string, number>;
  weatherImpactCorrelation: number;
}

export interface ConfirmationTemplate {
  id: string;
  name: string;
  appointmentType: 'routine' | 'follow-up' | 'urgent';
  deliveryMethod: 'voice' | 'sms' | 'email';
  content: {
    subject?: string;
    greeting: string;
    appointmentDetails: string;
    preparationInstructions: string;
    contactInfo: string;
    closing: string;
  };
  elderlyOptimizations: {
    slowerPace: boolean;
    simplifiedLanguage: boolean;
    repetitionEnabled: boolean;
    clearPronunciation: boolean;
  };
  variables: string[]; // Placeholders like {patientName}, {appointmentDate}
}

export interface ConfirmationFailure {
  id: string;
  appointmentId: string;
  patientId: string;
  failureType: 'invalid_contact' | 'delivery_failed' | 'system_error' | 'patient_unreachable';
  attemptedMethod: 'voice' | 'sms' | 'email';
  failureReason: string;
  timestamp: string;
  retryScheduled: boolean;
  alternativeMethodUsed?: 'voice' | 'sms' | 'email';
  staffNotified: boolean;
  resolved: boolean;
}

export interface PatientCommunicationPreferences {
  patientId: string;
  preferredMethods: ('voice' | 'sms' | 'email')[];
  methodPriority: Record<string, number>;
  contactTiming: {
    businessHoursOnly: boolean;
    timeZone: string;
    preferredHours?: {
      start: string;
      end: string;
    };
  };
  accessibilityNeeds: {
    largeText: boolean;
    slowSpeech: boolean;
    repetitionRequired: boolean;
    translationNeeded: boolean;
    language?: string;
  };
  optOutStatus: {
    confirmations: boolean;
    reminders: boolean;
    marketingCommunications: boolean;
  };
  lastUpdated: string;
}