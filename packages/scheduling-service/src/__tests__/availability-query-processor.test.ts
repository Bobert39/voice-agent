/**
 * Tests for Appointment Availability Query Processor
 */

import { AvailabilityQueryProcessor } from '../services/availability-query-processor';
import { AvailabilityService } from '../services/availability-service';
import { AvailabilityResponseGenerator } from '../services/availability-response-generator';
import { logger } from '@voice-agent/shared-utils';

// Mock dependencies
jest.mock('@voice-agent/shared-utils', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('AvailabilityQueryProcessor', () => {
  let queryProcessor: AvailabilityQueryProcessor;
  let mockAvailabilityService: jest.Mocked<AvailabilityService>;
  let mockResponseGenerator: jest.Mocked<AvailabilityResponseGenerator>;

  beforeEach(() => {
    // Create mock services
    mockAvailabilityService = {
      getAvailableSlots: jest.fn(),
      parseNaturalDate: jest.fn(),
      getNextAvailableSlots: jest.fn(),
      invalidateCache: jest.fn()
    } as any;

    mockResponseGenerator = {
      generateAvailabilityResponse: jest.fn(),
      generateClarificationResponse: jest.fn(),
      generateBookingConfirmation: jest.fn(),
      generateSameDayOptions: jest.fn(),
      generateHumanHandoffMessage: jest.fn()
    } as any;

    queryProcessor = new AvailabilityQueryProcessor(
      mockAvailabilityService,
      mockResponseGenerator
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processQuery', () => {
    it('should process a basic availability query', async () => {
      const query = {
        rawQuery: "When can I come in next week?",
        intent: 'appointment_availability' as const,
        entities: [
          {
            type: 'relative_time' as const,
            value: 'next week',
            confidence: 0.9
          }
        ],
        context: {
          conversationId: 'test-123',
          patientVerified: true
        }
      };

      const mockSlots = [
        {
          datetime: '2025-09-22T10:00:00',
          practitioner: 'Dr. Smith',
          practitionerId: '123',
          duration: 60,
          appointmentType: 'routine',
          available: true
        }
      ];

      mockAvailabilityService.parseNaturalDate.mockReturnValue({
        startDate: '2025-09-22',
        endDate: '2025-09-28'
      });

      mockAvailabilityService.getAvailableSlots.mockResolvedValue(mockSlots);

      mockResponseGenerator.generateAvailabilityResponse.mockReturnValue(
        "I found 1 available appointment for you. Monday, September 22 at 10:00 AM with Dr. Smith."
      );

      const result = await queryProcessor.processQuery(query);

      expect(result.response).toContain('I found 1 available appointment');
      expect(result.slots).toEqual(mockSlots);
      expect(result.requiresFollowUp).toBe(true);

      expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalledWith({
        startDate: '2025-09-22',
        endDate: '2025-09-28',
        appointmentType: undefined,
        practitionerId: undefined,
        preferredTimeOfDay: undefined
      });
    });

    it('should handle time preference extraction', async () => {
      const query = {
        rawQuery: "Do you have any morning appointments?",
        intent: 'appointment_availability' as const,
        entities: [
          {
            type: 'time_preference' as const,
            value: 'morning',
            normalized: 'morning',
            confidence: 0.95
          }
        ],
        context: {
          conversationId: 'test-123',
          patientVerified: true
        }
      };

      mockAvailabilityService.getAvailableSlots.mockResolvedValue([]);
      mockResponseGenerator.generateAvailabilityResponse.mockReturnValue(
        "I don't see any available morning appointments."
      );

      const result = await queryProcessor.processQuery(query);

      expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredTimeOfDay: 'morning'
        })
      );
    });

    it('should handle appointment type extraction', async () => {
      const query = {
        rawQuery: "I need a routine eye exam",
        intent: 'appointment_availability' as const,
        entities: [
          {
            type: 'appointment_type' as const,
            value: 'routine eye exam',
            confidence: 0.85
          }
        ],
        context: {
          conversationId: 'test-123',
          patientVerified: true
        }
      };

      mockAvailabilityService.getAvailableSlots.mockResolvedValue([]);

      await queryProcessor.processQuery(query);

      expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentType: 'routine'
        })
      );
    });

    it('should request clarification when no date is provided', async () => {
      const query = {
        rawQuery: "I need an appointment",
        intent: 'appointment_availability' as const,
        entities: [],
        context: {
          conversationId: 'test-123',
          patientVerified: true
        }
      };

      mockResponseGenerator.generateClarificationResponse.mockReturnValue(
        "When would you like to come in? You can say things like 'next week' or 'Monday morning'."
      );

      const result = await queryProcessor.processQuery(query);

      expect(result.requiresFollowUp).toBe(true);
      expect(mockResponseGenerator.generateClarificationResponse).toHaveBeenCalledWith('date_range');
      expect(mockAvailabilityService.getAvailableSlots).not.toHaveBeenCalled();
    });

    it('should handle contextual refinements', async () => {
      const query = {
        rawQuery: "Do you have anything earlier?",
        intent: 'appointment_refinement' as const,
        entities: [],
        context: {
          conversationId: 'test-123',
          patientVerified: true,
          previousQuery: "appointments next week"
        }
      };

      mockAvailabilityService.getAvailableSlots.mockResolvedValue([]);

      await queryProcessor.processQuery(query);

      // Should adjust date range to prioritize earlier dates
      expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(String),
          endDate: expect.any(String)
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const query = {
        rawQuery: "When can I come in?",
        intent: 'appointment_availability' as const,
        entities: [],
        context: {
          conversationId: 'test-123',
          patientVerified: true
        }
      };

      mockAvailabilityService.getAvailableSlots.mockRejectedValue(new Error('Service unavailable'));

      const result = await queryProcessor.processQuery(query);

      expect(result.response).toContain("I'm having trouble checking appointment availability");
      expect(result.requiresFollowUp).toBe(true);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('normalizeQuery', () => {
    it('should normalize common appointment phrasings', () => {
      const phrasings = [
        'when can i come in',
        'do you have any openings',
        'what times are available',
        'when is the next available',
        'can i get an appointment'
      ];

      phrasings.forEach(phrase => {
        const normalized = queryProcessor.normalizeQuery(phrase);
        expect(normalized).toContain('appointment_availability');
      });
    });

    it('should normalize appointment types', () => {
      const normalized = queryProcessor.normalizeQuery('I need an eye exam');
      expect(normalized).toContain('routine');
    });
  });
});