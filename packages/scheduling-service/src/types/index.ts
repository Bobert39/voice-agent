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