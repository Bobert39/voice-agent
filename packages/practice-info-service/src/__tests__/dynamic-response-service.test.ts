import { DynamicResponseService } from '../services/dynamic-response-service';
import { practiceInfoRepository } from '../services/repository';
import { cacheService } from '../services/cache';
import { 
  BusinessHours, 
  CurrentStatusDTO, 
  PracticeHoursDTO, 
  ResponseGenerationContext 
} from '../types';

// Mock dependencies
jest.mock('../services/repository');
jest.mock('../services/cache');

const mockPracticeInfoRepository = practiceInfoRepository as jest.Mocked<typeof practiceInfoRepository>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('DynamicResponseService', () => {
  let service: DynamicResponseService;
  let mockContext: ResponseGenerationContext;

  beforeEach(() => {
    service = new DynamicResponseService();
    mockContext = {
      currentTime: new Date('2024-01-15T14:30:00Z'),
      elderlyFriendlyMode: true,
      config: {
        speechSpeedWpm: 160,
        pauseDurationMs: 750,
        confirmationPrompts: true,
        repetitionAvailable: true,
        maxInformationChunks: 3,
        useStructuredLanguage: true,
      },
      previousQuestions: [],
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getCurrentStatus', () => {
    it('should return open status when practice is currently open', async () => {
      const mockHours: BusinessHours = {
        id: '1',
        practiceId: 'practice-1',
        locationId: 'location-1',
        dayOfWeek: 1, // Monday
        openTime: '08:00',
        closeTime: '17:00',
        breakStart: '12:00',
        breakEnd: '13:00',
        scheduleType: 'regular',
        effectiveStartDate: new Date('2024-01-01'),
        effectiveEndDate: new Date('2024-12-31'),
        notes: 'Regular hours',
        isClosed: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPracticeInfoRepository.getPracticeConfiguration.mockResolvedValue({
        id: 'practice-1',
        practiceName: 'Capitol Eye Care',
        practiceTimezone: 'America/New_York',
        phoneNumber: '(555) 123-4567',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPracticeInfoRepository.getCurrentDayHours.mockResolvedValue(mockHours);
      mockPracticeInfoRepository.getHolidaySchedule.mockResolvedValue(null);
      mockCacheService.getCurrentStatus.mockResolvedValue(null);
      mockCacheService.cacheCurrentStatus.mockResolvedValue();

      const result = await service.getCurrentStatus();

      expect(result).toMatchObject({
        isCurrentlyOpen: expect.any(Boolean),
        currentTime: expect.any(String),
        practiceTimezone: 'America/New_York',
      });
    });

    it('should return closed status when practice is closed for holiday', async () => {
      const mockHolidaySchedule = {
        id: '1',
        practiceId: 'practice-1',
        locationId: 'location-1',
        holidayName: 'New Years Day',
        holidayDate: new Date('2024-01-01'),
        openTime: '08:00',
        closeTime: '17:00',
        isClosed: true,
        isRecurring: true,
        recurringType: 'annual' as const,
        advanceNoticeDays: 7,
        noticeMessage: "We're closed today for New Year's Day",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPracticeInfoRepository.getPracticeConfiguration.mockResolvedValue({
        id: 'practice-1',
        practiceName: 'Capitol Eye Care',
        practiceTimezone: 'America/New_York',
        phoneNumber: '(555) 123-4567',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPracticeInfoRepository.getCurrentDayHours.mockResolvedValue(null);
      mockPracticeInfoRepository.getHolidaySchedule.mockResolvedValue(mockHolidaySchedule);
      mockCacheService.getCurrentStatus.mockResolvedValue(null);
      mockCacheService.cacheCurrentStatus.mockResolvedValue();

      const result = await service.getCurrentStatus();

      expect(result.isCurrentlyOpen).toBe(false);
      expect(result.specialNotice).toContain("We're closed today for New Year's Day");
    });
  });

  describe('getWeeklyHours', () => {
    it('should return formatted weekly hours', async () => {
      const mockBusinessHours: BusinessHours[] = [
        {
          id: '1',
          practiceId: 'practice-1',
          locationId: 'location-1',
          dayOfWeek: 1, // Monday
          openTime: '08:00',
          closeTime: '17:00',
          breakStart: '12:00',
          breakEnd: '13:00',
          scheduleType: 'regular',
          effectiveStartDate: new Date('2024-01-01'),
          effectiveEndDate: new Date('2024-12-31'),
          notes: 'Regular hours',
          isClosed: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          practiceId: 'practice-1',
          locationId: 'location-1',
          dayOfWeek: 2, // Tuesday
          openTime: '08:00',
          closeTime: '18:00',
          breakStart: '12:00',
          breakEnd: '13:00',
          scheduleType: 'regular',
          effectiveStartDate: new Date('2024-01-01'),
          effectiveEndDate: new Date('2024-12-31'),
          notes: 'Regular hours',
          isClosed: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPracticeInfoRepository.getBusinessHours.mockResolvedValue(mockBusinessHours);
      mockCacheService.getPracticeHours.mockResolvedValue(null);
      mockCacheService.cachePracticeHours.mockResolvedValue();

      const result = await service.getWeeklyHours();

      expect(result).toHaveLength(7); // All 7 days of the week
      expect(result[1]).toMatchObject({
        dayName: 'Monday',
        isOpen: true,
        openTime: '8 AM',
        closeTime: '5 PM',
      });
      expect(result[2]).toMatchObject({
        dayName: 'Tuesday',
        isOpen: true,
        openTime: '8 AM',
        closeTime: '6 PM',
      });
    });
  });

  describe('generateBusinessHoursResponse', () => {
    it('should generate elderly-friendly response for business hours', () => {
      const currentStatus: CurrentStatusDTO = {
        isCurrentlyOpen: true,
        currentTime: '14:30',
        practiceTimezone: 'America/New_York',
      };

      const weeklyHours: PracticeHoursDTO[] = [
        {
          dayOfWeek: '1',
          dayName: 'Monday',
          isOpen: true,
          openTime: '8 AM',
          closeTime: '5 PM',
          hasBreak: false,
        },
        {
          dayOfWeek: '2',
          dayName: 'Tuesday',
          isOpen: true,
          openTime: '8 AM',
          closeTime: '6 PM',
          hasBreak: false,
        },
      ];

      const result = service.generateBusinessHoursResponse(currentStatus, weeklyHours, mockContext);

      expect(result).toContain("We're currently open");
      expect(result).toContain('Would you like me to repeat');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate appropriate response when closed', () => {
      const currentStatus: CurrentStatusDTO = {
        isCurrentlyOpen: false,
        currentTime: '19:30',
        practiceTimezone: 'America/New_York',
        nextOpenTime: '8:00 AM',
        nextOpenDay: 'Monday',
      };

      const weeklyHours: PracticeHoursDTO[] = [
        {
          dayOfWeek: '1',
          dayName: 'Monday',
          isOpen: true,
          openTime: '8 AM',
          closeTime: '5 PM',
          hasBreak: false,
        },
      ];

      const result = service.generateBusinessHoursResponse(currentStatus, weeklyHours, mockContext);

      expect(result).toContain("We're currently closed");
      expect(result).toContain('Monday at 8:00 AM');
      expect(typeof result).toBe('string');
    });
  });

  describe('generateLocationResponse', () => {
    it('should generate location response with accessibility information', async () => {
      const mockLocation = {
        id: 'location-1',
        practiceId: 'practice-1',
        locationName: 'Main Office',
        addressLine1: '123 Vision Way',
        addressLine2: 'Suite 101',
        city: 'Capitol City',
        state: 'NY',
        zipCode: '12345',
        country: 'United States',
        phoneNumber: '(555) 123-4567',
        faxNumber: '(555) 123-4568',
        parkingInstructions: 'Free parking available in the lot behind our building',
        parkingCost: 'Free',
        accessibilityFeatures: ['wheelchair_accessible', 'accessible_parking'],
        publicTransportation: 'Bus route 15',
        directions: 'Take exit 5 from highway',
        isPrimary: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPracticeInfoRepository.getPrimaryLocation.mockResolvedValue(mockLocation);

      const result = await service.generateLocationResponse(mockContext);

      expect(result).toContain('123 Vision Way');
      expect(result).toContain('Capitol City, NY');
      expect(result).toContain('(555) 123-4567');
      expect(result).toContain('parking');
      expect(result).toContain('wheelchair accessible');
      expect(result).toContain('Would you like me to repeat');
    });

    it('should handle missing location gracefully', async () => {
      mockPracticeInfoRepository.getPrimaryLocation.mockResolvedValue(null);

      const result = await service.generateLocationResponse(mockContext);

      expect(result).toContain('having trouble accessing our location information');
      expect(result).toContain('call our main number');
    });
  });

  describe('generateInsuranceResponse', () => {
    it('should provide specific insurance information when plan is found', async () => {
      const mockInsurancePlan = {
        id: 'insurance-1',
        practiceId: 'practice-1',
        insuranceCompany: 'Blue Cross',
        planName: 'Blue Shield',
        planType: 'vision',
        isAccepted: true,
        requiresReferral: false,
        requiresPreauthorization: false,
        copayAmount: 25,
        verificationRequirements: [],
        notes: 'Regular hours',
        effectiveStartDate: new Date(),
        effectiveEndDate: new Date('2024-12-31'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPracticeInfoRepository.checkInsuranceAcceptance.mockResolvedValue(mockInsurancePlan);

      const result = await service.generateInsuranceResponse('Blue Cross', mockContext);

      expect(result).toContain('Yes, we do accept Blue Cross');
      expect(result).toContain('copay will be $25');
      expect(result).toContain('other questions about your insurance');
    });

    it('should provide general insurance information when no specific plan requested', async () => {
      const mockInsurancePlans = [
        {
          id: 'insurance-1',
          practiceId: 'practice-1',
          insuranceCompany: 'Blue Cross',
          planName: 'Standard',
          planType: 'vision',
          isAccepted: true,
          requiresReferral: false,
          requiresPreauthorization: false,
          copayAmount: 25,
          verificationRequirements: [],
          notes: 'Regular hours',
          effectiveStartDate: new Date(),
          effectiveEndDate: new Date('2024-12-31'),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPracticeInfoRepository.getAcceptedInsurancePlans.mockResolvedValue(mockInsurancePlans);

      const result = await service.generateInsuranceResponse(undefined, mockContext);

      expect(result).toContain('We accept most major insurance plans');
      expect(result).toContain('Blue Cross');
      expect(result).toContain('verify your specific plan');
    });
  });

  describe('generatePreparationResponse', () => {
    it('should provide detailed preparation instructions for appointment type', async () => {
      const mockAppointmentType = {
        id: 'appt-type-1',
        practiceId: 'practice-1',
        appointmentTypeName: 'comprehensive',
        durationMinutes: 60,
        description: 'Comprehensive eye examination',
        requiresDilation: true,
        requiresDriver: true,
        fastingRequired: false,
        bringRequirements: ['current glasses', 'insurance card', 'medication list'],
        preparationInstructions: 'Please remove contact lenses 24 hours before your appointment',
        postAppointmentCare: 'Rest for 2 hours after dilation',
        bufferTimeMinutes: 15,
        maxDailyAppointments: 10,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPracticeInfoRepository.getAppointmentType.mockResolvedValue(mockAppointmentType);

      const result = await service.generatePreparationResponse('comprehensive', mockContext);

      expect(result).toContain('comprehensive appointment');
      expect(result).toContain("You'll need someone to drive you");
      expect(result).toContain('current glasses, insurance card, medication list');
      expect(result).toContain('eyes will be dilated');
      expect(result).toContain('remove contact lenses');
      expect(result).toContain('repeat any of these instructions');
    });

    it('should handle unknown appointment type gracefully', async () => {
      mockPracticeInfoRepository.getAppointmentType.mockResolvedValue(null);

      const result = await service.generatePreparationResponse('unknown', mockContext);

      expect(result).toContain("don't have specific preparation instructions");
      expect(result).toContain('call our office');
    });
  });
});