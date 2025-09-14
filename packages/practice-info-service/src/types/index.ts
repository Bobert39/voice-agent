// Practice Information Service Types

export interface PracticeConfiguration {
  id: string;
  practiceName: string;
  practiceTimezone: string;
  phoneNumber: string;
  websiteUrl?: string;
  email?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PracticeLocation {
  id: string;
  practiceId: string;
  locationName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phoneNumber?: string;
  faxNumber?: string;
  parkingInstructions?: string;
  parkingCost?: string;
  accessibilityFeatures: string[];
  publicTransportation?: string;
  directions?: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessHours {
  id: string;
  practiceId: string;
  locationId?: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  openTime?: string; // HH:MM format
  closeTime?: string; // HH:MM format
  breakStart?: string;
  breakEnd?: string;
  scheduleType: 'regular' | 'holiday' | 'seasonal';
  effectiveStartDate?: Date;
  effectiveEndDate?: Date;
  notes?: string;
  isClosed: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HolidaySchedule {
  id: string;
  practiceId: string;
  locationId?: string;
  holidayName: string;
  holidayDate: Date;
  openTime?: string;
  closeTime?: string;
  isRecurring: boolean;
  recurringType?: 'annual' | 'monthly' | 'weekly';
  advanceNoticeDays: number;
  noticeMessage?: string;
  isClosed: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsurancePlan {
  id: string;
  practiceId: string;
  insuranceCompany: string;
  planName: string;
  planType?: string;
  isAccepted: boolean;
  requiresReferral: boolean;
  requiresPreauthorization: boolean;
  copayAmount?: number;
  verificationRequirements: string[];
  notes?: string;
  effectiveStartDate: Date;
  effectiveEndDate?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentType {
  id: string;
  practiceId: string;
  appointmentTypeName: string;
  durationMinutes: number;
  description?: string;
  requiresDilation: boolean;
  requiresDriver: boolean;
  fastingRequired: boolean;
  bringRequirements: string[];
  preparationInstructions?: string;
  postAppointmentCare?: string;
  bufferTimeMinutes: number;
  maxDailyAppointments?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PracticePolicy {
  id: string;
  practiceId: string;
  policyCategory: string;
  policyName: string;
  policyContent: string;
  severityLevel: 'info' | 'standard' | 'important' | 'critical';
  appliesToAppointmentTypes: string[];
  includeInVoiceResponse: boolean;
  voiceSummary?: string;
  effectiveStartDate: Date;
  effectiveEndDate?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PracticeFAQ {
  id: string;
  practiceId: string;
  questionCategory: string;
  questionText: string;
  answerText: string;
  voiceResponseText?: string;
  confirmationPrompt?: string;
  usageCount: number;
  lastUsedAt?: Date;
  keywords: string[];
  intentCategories: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeasonalSchedule {
  id: string;
  practiceId: string;
  locationId?: string;
  seasonName: string;
  startDate: Date;
  endDate: Date;
  mondayOpen?: string;
  mondayClose?: string;
  tuesdayOpen?: string;
  tuesdayClose?: string;
  wednesdayOpen?: string;
  wednesdayClose?: string;
  thursdayOpen?: string;
  thursdayClose?: string;
  fridayOpen?: string;
  fridayClose?: string;
  saturdayOpen?: string;
  saturdayClose?: string;
  sundayOpen?: string;
  sundayClose?: string;
  overridesRegularHours: boolean;
  advanceNoticeMessage?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// DTOs for API responses
export interface PracticeHoursDTO {
  dayOfWeek: string;
  dayName: string;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  hasBreak: boolean;
  breakStart?: string;
  breakEnd?: string;
  notes?: string;
}

export interface CurrentStatusDTO {
  isCurrentlyOpen: boolean;
  nextOpenTime?: string;
  nextOpenDay?: string;
  currentTime: string;
  practiceTimezone: string;
  specialNotice?: string;
}

export interface PracticeInfoResponseDTO {
  practiceInfo: {
    name: string;
    phone: string;
    timezone: string;
    primaryLocation: PracticeLocation;
  };
  currentStatus: CurrentStatusDTO;
  weeklyHours: PracticeHoursDTO[];
  upcomingHolidays: HolidaySchedule[];
  acceptedInsurance: InsurancePlan[];
  appointmentTypes: AppointmentType[];
  importantPolicies: PracticePolicy[];
}

// Response generation configuration
export interface ElderlyFriendlyConfig {
  speechSpeedWpm: number;
  pauseDurationMs: number;
  confirmationPrompts: boolean;
  repetitionAvailable: boolean;
  maxInformationChunks: number;
  useStructuredLanguage: boolean;
}

export interface ResponseGenerationContext {
  currentTime: Date;
  userTimezone?: string;
  previousQuestions: string[];
  conversationContext?: any;
  elderlyFriendlyMode: boolean;
  config: ElderlyFriendlyConfig;
}

// Cache keys for Redis
export enum CacheKeys {
  PRACTICE_HOURS = 'practice:hours',
  PRACTICE_LOCATION = 'practice:location:info',
  INSURANCE_ACCEPTED = 'practice:insurance:accepted',
  PRACTICE_POLICIES = 'practice:policies:general',
  PREPARATION_INSTRUCTIONS = 'practice:preparation',
  CURRENT_STATUS = 'practice:status:current',
  FAQ_RESPONSES = 'practice:faqs',
}

// Error types specific to practice information
export class PracticeInfoError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'PracticeInfoError';
  }
}

export class ScheduleNotFoundError extends PracticeInfoError {
  constructor(message: string = 'Schedule information not found') {
    super(message, 404, 'SCHEDULE_NOT_FOUND');
  }
}

export class InvalidTimeRangeError extends PracticeInfoError {
  constructor(message: string = 'Invalid time range specified') {
    super(message, 400, 'INVALID_TIME_RANGE');
  }
}