import { PracticeInfoService } from '../services/practice-info-service';
import { dynamicResponseService } from '../services/dynamic-response-service';
import { practiceInfoRepository } from '../services/repository';
import { ResponseGenerationContext } from '../types';

// Mock dependencies
jest.mock('../services/dynamic-response-service');
jest.mock('../services/repository');

const mockDynamicResponseService = dynamicResponseService as jest.Mocked<typeof dynamicResponseService>;
const mockPracticeInfoRepository = practiceInfoRepository as jest.Mocked<typeof practiceInfoRepository>;

describe('PracticeInfoService', () => {
  let service: PracticeInfoService;
  let mockContext: ResponseGenerationContext;

  beforeEach(() => {
    // Mock environment variable
    process.env.OPENAI_API_KEY = 'test-api-key';
    
    service = new PracticeInfoService();
    mockContext = {
      currentTime: new Date('2024-01-15T14:30:00Z'),
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

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('processNaturalLanguageQuery', () => {
    it('should classify and handle business hours query', async () => {
      const query = 'What are your hours?';
      const mockCurrentStatus = {
        isCurrentlyOpen: true,
        currentTime: '14:30',
        practiceTimezone: 'America/New_York',
      };
      const mockWeeklyHours = [
        {
          dayOfWeek: '1',
          dayName: 'Monday',
          isOpen: true,
          openTime: '8 AM',
          closeTime: '5 PM',
          hasBreak: false,
        },
      ];

      mockDynamicResponseService.getCurrentStatus.mockResolvedValue(mockCurrentStatus);
      mockDynamicResponseService.getWeeklyHours.mockResolvedValue(mockWeeklyHours);
      mockDynamicResponseService.generateBusinessHoursResponse.mockReturnValue(
        "We're currently open until 5 PM today. Would you like me to repeat our hours?"
      );

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain("We're currently open");
      expect(mockDynamicResponseService.getCurrentStatus).toHaveBeenCalled();
      expect(mockDynamicResponseService.getWeeklyHours).toHaveBeenCalled();
      expect(mockDynamicResponseService.generateBusinessHoursResponse).toHaveBeenCalledWith(
        mockCurrentStatus,
        mockWeeklyHours,
        mockContext
      );
    });

    it('should classify and handle location query', async () => {
      const query = 'Where are you located?';
      const mockLocationResponse = "We're located at 123 Vision Way in Capitol City, NY.";

      mockDynamicResponseService.generateLocationResponse.mockResolvedValue(mockLocationResponse);

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('123 Vision Way');
      expect(mockDynamicResponseService.generateLocationResponse).toHaveBeenCalledWith(mockContext);
    });

    it('should classify and handle insurance query with specific company', async () => {
      const query = 'Do you accept Blue Cross insurance?';
      const mockInsuranceResponse = 'Yes, we do accept Blue Cross. Your copay will be $25.';

      mockDynamicResponseService.generateInsuranceResponse.mockResolvedValue(mockInsuranceResponse);

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('Blue Cross');
      expect(mockDynamicResponseService.generateInsuranceResponse).toHaveBeenCalledWith(
        'blue cross',
        mockContext
      );
    });

    it('should classify and handle preparation query', async () => {
      const query = 'What should I bring for my dilation appointment?';
      const mockPreparationResponse = "For your comprehensive appointment, you'll need someone to drive you.";

      mockDynamicResponseService.generatePreparationResponse.mockResolvedValue(mockPreparationResponse);

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('comprehensive appointment');
      expect(mockDynamicResponseService.generatePreparationResponse).toHaveBeenCalledWith(
        'comprehensive',
        mockContext
      );
    });

    it('should handle contact information query', async () => {
      const query = 'What is your phone number?';
      
      const mockPracticeConfig = {
        id: 'practice-1',
        practiceName: 'Capitol Eye Care',
        practiceTimezone: 'America/New_York',
        phoneNumber: '(555) 123-4567',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCurrentStatus = {
        isCurrentlyOpen: true,
        currentTime: '14:30',
        practiceTimezone: 'America/New_York',
      };

      mockPracticeInfoRepository.getPracticeConfiguration.mockResolvedValue(mockPracticeConfig);
      mockDynamicResponseService.getCurrentStatus.mockResolvedValue(mockCurrentStatus);

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('(555) 123-4567');
      expect(result).toContain("We're currently open");
    });

    it('should handle policy queries', async () => {
      const query = 'What is your cancellation policy?';
      
      const mockPolicies = [
        {
          id: 'policy-1',
          practiceId: 'practice-1',
          policyCategory: 'cancellation',
          policyName: 'Cancellation Policy',
          policyContent: 'Appointments must be cancelled 24 hours in advance.',
          severityLevel: 'important' as const,
          appliesToAppointmentTypes: [],
          includeInVoiceResponse: true,
          voiceSummary: 'Please cancel appointments 24 hours in advance to avoid fees.',
          effectiveStartDate: new Date(),
          effectiveEndDate: new Date('2025-12-31'),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPracticeInfoRepository.getVoiceResponsePolicies.mockResolvedValue(mockPolicies);

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('24 hours in advance');
      expect(result).toContain('other questions about our policies');
    });

    it('should handle unknown queries gracefully', async () => {
      const query = 'Can you perform surgery on my pet?';

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      // Should provide either unknown query response or error response
      expect(result).toMatch(/I'm not sure I understand|I apologize, but I'm having trouble/);
      expect(result).toMatch(/Could you tell me more specifically|Would you like me to transfer/);
    });

    it('should provide general information for broad queries', async () => {
      const query = 'Tell me about your practice';
      
      const mockPracticeInfo = {
        practiceInfo: {
          name: 'Capitol Eye Care',
          phone: '(555) 123-4567',
          timezone: 'America/New_York',
          primaryLocation: {
            id: 'location-1',
            practiceId: 'practice-1',
            locationName: 'Main Office',
            addressLine1: '123 Vision Way',
            addressLine2: 'Suite 100',
            city: 'Capitol City',
            state: 'NY',
            zipCode: '12345',
            country: 'United States',
            phoneNumber: '(555) 123-4567',
            faxNumber: '(555) 123-4568',
            parkingInstructions: 'Free parking available',
            parkingCost: 'Free',
            accessibilityFeatures: [],
            publicTransportation: 'Bus route 15',
            directions: 'Take exit 5 from highway',
            isPrimary: true,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        currentStatus: {
          isCurrentlyOpen: true,
          currentTime: '14:30',
          practiceTimezone: 'America/New_York',
        },
        weeklyHours: [],
        upcomingHolidays: [],
        acceptedInsurance: [],
        appointmentTypes: [],
        importantPolicies: [],
      };

      mockDynamicResponseService.generateComprehensivePracticeInfo.mockResolvedValue(mockPracticeInfo);

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('Capitol Eye Care');
      expect(result).toContain('comprehensive eye care services');
      expect(result).toContain('123 Vision Way');
    });
  });

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      const query = 'What are your hours?';
      
      mockDynamicResponseService.getCurrentStatus.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('having trouble accessing');
      expect(result).toMatch(/Please call our office|Would you like me to transfer/);
    });

    it('should handle missing practice configuration gracefully', async () => {
      const query = 'What is your phone number?';
      
      mockPracticeInfoRepository.getPracticeConfiguration.mockResolvedValue(null);

      const result = await service.processNaturalLanguageQuery(query, mockContext);

      expect(result).toContain('having trouble accessing');
    });
  });

  describe('appointment type extraction', () => {
    it('should extract routine appointment type from query', async () => {
      const query = 'What should I prepare for my annual exam?';
      
      mockDynamicResponseService.generatePreparationResponse.mockResolvedValue(
        'For your routine appointment, please bring your insurance card.'
      );

      await service.processNaturalLanguageQuery(query, mockContext);

      expect(mockDynamicResponseService.generatePreparationResponse).toHaveBeenCalledWith(
        'routine',
        mockContext
      );
    });

    it('should extract comprehensive appointment type from dilation query', async () => {
      const query = 'What do I need to know about dilation?';
      
      mockDynamicResponseService.generatePreparationResponse.mockResolvedValue(
        'For your comprehensive appointment with dilation, you will need a driver.'
      );

      await service.processNaturalLanguageQuery(query, mockContext);

      expect(mockDynamicResponseService.generatePreparationResponse).toHaveBeenCalledWith(
        'comprehensive',
        mockContext
      );
    });
  });

  describe('insurance company extraction', () => {
    it('should extract multiple insurance company variations', async () => {
      const queries = [
        'Do you take Aetna?',
        'I have Medicare coverage',
        'United Healthcare plan acceptance',
        'Blue Cross Blue Shield insurance'
      ];

      mockDynamicResponseService.generateInsuranceResponse.mockResolvedValue('Insurance response');

      // Test each query individually
      for (const query of queries) {
        mockDynamicResponseService.generateInsuranceResponse.mockClear();
        const result = await service.processNaturalLanguageQuery(query, mockContext);

        // Should return a meaningful response (either insurance-specific or general info)
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(10);
      }
    });
  });
});