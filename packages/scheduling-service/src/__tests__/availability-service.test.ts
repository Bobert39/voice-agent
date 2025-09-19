/**
 * Availability Service Test Suite
 * Story 3.1: Appointment Availability Lookup
 * Coverage: Unit tests ≥90%, Integration tests ≥80%, Performance tests
 */

import { AvailabilityService } from '../services/availability-service';
import { AvailabilityNLPProcessor } from '../services/availability-nlp-processor';
import { OpenEMRSchedulingClient } from '../services/openemr-client';
import { Redis } from 'ioredis';

// Mock dependencies
jest.mock('../services/openemr-client');
jest.mock('ioredis');
jest.mock('@voice-agent/shared-utils', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('AvailabilityService', () => {
  let availabilityService: AvailabilityService;
  let openemrClient: jest.Mocked<OpenEMRSchedulingClient>;
  let redis: jest.Mocked<Redis>;
  let nlpProcessor: AvailabilityNLPProcessor;

  const mockBusinessRules = {
    businessHours: {
      monday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      tuesday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      wednesday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      thursday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      friday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
    },
    appointmentDurations: {
      routine: 60,
      'follow-up': 30,
      urgent: 45
    },
    bufferTimes: {
      standard: 10,
      complex: 15
    },
    holidays: ['2025-01-20', '2025-02-17'], // MLK Day, Presidents Day
    blockedTimes: [
      {
        dayOfWeek: 'wednesday',
        startTime: '14:00',
        endTime: '15:00',
        reason: 'Staff meeting'
      }
    ]
  };

  beforeEach(() => {
    openemrClient = new OpenEMRSchedulingClient({
      baseUrl: 'http://test',
      clientId: 'test',
      clientSecret: 'test',
      scope: 'test'
    }) as jest.Mocked<OpenEMRSchedulingClient>;

    redis = new Redis() as jest.Mocked<Redis>;
    redis.get = jest.fn();
    redis.setex = jest.fn();
    redis.keys = jest.fn();
    redis.del = jest.fn();

    availabilityService = new AvailabilityService(
      openemrClient,
      redis,
      mockBusinessRules,
      true
    );

    nlpProcessor = new AvailabilityNLPProcessor();
  });

  describe('getAvailableSlots', () => {
    it('should return available slots for 60-day window', async () => {
      // Mock OpenEMR response
      const mockSlots = [
        {
          id: 'slot-1',
          start: '2025-01-22T09:00:00Z',
          end: '2025-01-22T10:00:00Z',
          status: 'free' as const,
          schedule: 'Schedule/123'
        },
        {
          id: 'slot-2',
          start: '2025-01-22T10:00:00Z',
          end: '2025-01-22T11:00:00Z',
          status: 'free' as const,
          schedule: 'Schedule/123'
        }
      ];

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([
        { id: '123', name: 'Dr. Smith', specialty: 'Optometry' }
      ]);

      const query = {
        startDate: '2025-01-22',
        endDate: '2025-03-23', // 60 days
        appointmentType: 'routine' as const
      };

      const result = await availabilityService.getAvailableSlots(query);

      expect(result).toHaveLength(2);
      expect(result[0].datetime).toBe('2025-01-22T09:00:00Z');
      expect(result[0].duration).toBe(60);
      expect(result[0].appointmentType).toBe('routine');
    });

    it('should filter slots during lunch hours', async () => {
      const mockSlots = [
        {
          id: 'slot-1',
          start: '2025-01-22T11:30:00Z',
          end: '2025-01-22T12:30:00Z',
          status: 'free' as const
        },
        {
          id: 'slot-2',
          start: '2025-01-22T12:30:00Z', // During lunch
          end: '2025-01-22T13:00:00Z',
          status: 'free' as const
        },
        {
          id: 'slot-3',
          start: '2025-01-22T13:30:00Z',
          end: '2025-01-22T14:00:00Z',
          status: 'free' as const
        }
      ];

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      const query = {
        startDate: '2025-01-22',
        endDate: '2025-01-22',
        appointmentType: 'routine' as const
      };

      const result = await availabilityService.getAvailableSlots(query);

      // Should filter out the lunch hour slot
      expect(result).toHaveLength(2);
      expect(result.find(s => s.datetime === '2025-01-22T12:30:00Z')).toBeUndefined();
    });

    it('should respect appointment type durations', async () => {
      const mockSlots = [
        {
          id: 'slot-1',
          start: '2025-01-22T16:00:00Z',
          end: '2025-01-22T17:00:00Z',
          status: 'free' as const
        }
      ];

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      // Test routine appointment (60 min + 10 min buffer)
      let query = {
        startDate: '2025-01-22',
        endDate: '2025-01-22',
        appointmentType: 'routine' as const
      };

      let result = await availabilityService.getAvailableSlots(query);
      expect(result).toHaveLength(0); // Should be filtered out (16:00 + 70min > 17:00)

      // Test follow-up appointment (30 min + 10 min buffer)
      query.appointmentType = 'follow-up';
      result = await availabilityService.getAvailableSlots(query);
      expect(result).toHaveLength(1); // Should be available (16:00 + 40min < 17:00)
    });

    it('should handle cache hit for performance', async () => {
      const cachedData = JSON.stringify([
        {
          datetime: '2025-01-22T09:00:00Z',
          practitioner: 'Dr. Smith',
          duration: 60,
          appointmentType: 'routine',
          available: true
        }
      ]);

      redis.get.mockResolvedValueOnce(cachedData);

      const query = {
        startDate: '2025-01-22',
        endDate: '2025-01-22',
        appointmentType: 'routine' as const
      };

      const result = await availabilityService.getAvailableSlots(query);

      expect(result).toHaveLength(1);
      expect(openemrClient.getAvailableSlots).not.toHaveBeenCalled();
      expect(redis.get).toHaveBeenCalledWith('availability:2025-01-22:2025-01-22:routine:any:any');
    });
  });

  describe('parseNaturalDate', () => {
    it('should parse "tomorrow" correctly', () => {
      const result = availabilityService.parseNaturalDate('tomorrow');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(result?.startDate).toBe(tomorrow.toISOString().split('T')[0]);
      expect(result?.endDate).toBe(tomorrow.toISOString().split('T')[0]);
    });

    it('should parse "next week" correctly', () => {
      const result = availabilityService.parseNaturalDate('next week');
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const endOfWeek = new Date(nextWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      expect(result?.startDate).toBe(nextWeek.toISOString().split('T')[0]);
      expect(result?.endDate).toBe(endOfWeek.toISOString().split('T')[0]);
    });

    it('should parse specific day names', () => {
      const result = availabilityService.parseNaturalDate('next Monday');
      expect(result).not.toBeNull();

      const date = new Date(result!.startDate);
      expect(date.getDay()).toBe(1); // Monday
    });
  });

  describe('NLP Processing', () => {
    it('should process natural language query for availability', async () => {
      const query = "What appointments are available next Tuesday morning?";
      const nlpResult = await nlpProcessor.processQuery(query);

      expect(nlpResult.intent).toBe('availability');
      expect(nlpResult.entities.timePreference).toBe('morning');
      expect(nlpResult.entities.relative_time).toBe('specific_day');
      expect(nlpResult.confidence).toBeGreaterThan(0.7);
    });

    it('should extract appointment type from query', async () => {
      const query = "I need to schedule my annual eye exam";
      const nlpResult = await nlpProcessor.processQuery(query);

      expect(nlpResult.entities.appointmentType).toBe('routine');
    });

    it('should handle urgent appointment requests', async () => {
      const query = "I need to see the doctor as soon as possible";
      const nlpResult = await nlpProcessor.processQuery(query);

      expect(nlpResult.entities.appointmentType).toBe('urgent');
      expect(nlpResult.intent).toBe('next_available');
    });

    it('should generate patient-friendly responses', () => {
      const slots = [
        {
          datetime: '2025-01-22T09:00:00Z',
          practitioner: 'Dr. Smith',
          duration: 60,
          appointmentType: 'routine',
          available: true
        },
        {
          datetime: '2025-01-22T14:00:00Z',
          practitioner: 'Dr. Jones',
          duration: 60,
          appointmentType: 'routine',
          available: true
        }
      ];

      const query = {
        rawText: 'next available',
        intent: 'next_available' as const,
        entities: {},
        confidence: 0.9
      };

      const response = nlpProcessor.generatePatientFriendlyResponse(slots, query);

      expect(response).toContain('I have a few appointments available');
      expect(response).not.toContain('military time');
      expect(response).toContain('Which one would work best for you?');
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent availability queries efficiently', async () => {
      const mockSlots = Array.from({ length: 100 }, (_, i) => ({
        id: `slot-${i}`,
        start: `2025-01-22T${String(9 + Math.floor(i / 12)).padStart(2, '0')}:${String((i % 12) * 5).padStart(2, '0')}:00Z`,
        end: `2025-01-22T${String(9 + Math.floor(i / 12)).padStart(2, '0')}:${String(((i % 12) * 5) + 30).padStart(2, '0')}:00Z`,
        status: 'free' as const
      }));

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      const startTime = Date.now();

      // Simulate 50 concurrent requests
      const promises = Array.from({ length: 50 }, () =>
        availabilityService.getAvailableSlots({
          startDate: '2025-01-22',
          endDate: '2025-01-22',
          appointmentType: 'routine'
        })
      );

      await Promise.all(promises);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should complete within 2 seconds even with 50 concurrent requests
      expect(responseTime).toBeLessThan(2000);
    });

    it('should maintain cache hit ratio above 90%', async () => {
      const cachedData = JSON.stringify([
        {
          datetime: '2025-01-22T09:00:00Z',
          practitioner: 'Dr. Smith',
          duration: 60,
          appointmentType: 'routine',
          available: true
        }
      ]);

      // First request - cache miss
      redis.get.mockResolvedValueOnce(null);
      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue([]);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      await availabilityService.getAvailableSlots({
        startDate: '2025-01-22',
        endDate: '2025-01-22'
      });

      // Next 9 requests - cache hits
      for (let i = 0; i < 9; i++) {
        redis.get.mockResolvedValueOnce(cachedData);
        await availabilityService.getAvailableSlots({
          startDate: '2025-01-22',
          endDate: '2025-01-22'
        });
      }

      // OpenEMR should only be called once (first request)
      expect(openemrClient.getAvailableSlots).toHaveBeenCalledTimes(1);
      // Redis get should be called 10 times
      expect(redis.get).toHaveBeenCalledTimes(10);
    });
  });

  describe('Business Rule Filtering', () => {
    it('should filter holidays correctly', async () => {
      const mockSlots = [
        {
          id: 'slot-1',
          start: '2025-01-20T09:00:00Z', // MLK Day
          end: '2025-01-20T10:00:00Z',
          status: 'free' as const
        },
        {
          id: 'slot-2',
          start: '2025-01-21T09:00:00Z',
          end: '2025-01-21T10:00:00Z',
          status: 'free' as const
        }
      ];

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      const result = await availabilityService.getAvailableSlots({
        startDate: '2025-01-20',
        endDate: '2025-01-21'
      });

      // Should filter out MLK Day
      expect(result).toHaveLength(1);
      expect(result[0].datetime).toBe('2025-01-21T09:00:00Z');
    });

    it('should handle blocked times (staff meetings)', async () => {
      const mockSlots = [
        {
          id: 'slot-1',
          start: '2025-01-22T14:00:00Z', // Wednesday staff meeting time
          end: '2025-01-22T14:30:00Z',
          status: 'free' as const
        },
        {
          id: 'slot-2',
          start: '2025-01-22T15:30:00Z',
          end: '2025-01-22T16:00:00Z',
          status: 'free' as const
        }
      ];

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      const result = await availabilityService.getAvailableSlots({
        startDate: '2025-01-22',
        endDate: '2025-01-22'
      });

      // Should filter out staff meeting time
      expect(result).toHaveLength(1);
      expect(result[0].datetime).toBe('2025-01-22T15:30:00Z');
    });

    it('should apply buffer times correctly', async () => {
      const mockSlots = [
        {
          id: 'slot-1',
          start: '2025-01-22T16:30:00Z', // 30 min before close
          end: '2025-01-22T17:00:00Z',
          status: 'free' as const
        }
      ];

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      // Follow-up (30 min + 10 min buffer = 40 min) won't fit
      let result = await availabilityService.getAvailableSlots({
        startDate: '2025-01-22',
        endDate: '2025-01-22',
        appointmentType: 'follow-up'
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenEMR connection failures gracefully', async () => {
      openemrClient.getAvailableSlots = jest.fn().mockRejectedValue(
        new Error('Connection timeout')
      );

      await expect(
        availabilityService.getAvailableSlots({
          startDate: '2025-01-22',
          endDate: '2025-01-22'
        })
      ).rejects.toThrow('Connection timeout');
    });

    it('should handle cache failures gracefully', async () => {
      redis.get.mockRejectedValue(new Error('Redis connection lost'));

      const mockSlots = [{
        id: 'slot-1',
        start: '2025-01-22T09:00:00Z',
        end: '2025-01-22T10:00:00Z',
        status: 'free' as const
      }];

      openemrClient.getAvailableSlots = jest.fn().mockResolvedValue(mockSlots);
      openemrClient.getPractitioners = jest.fn().mockResolvedValue([]);

      // Should fall back to OpenEMR when cache fails
      const result = await availabilityService.getAvailableSlots({
        startDate: '2025-01-22',
        endDate: '2025-01-22'
      });

      expect(result).toHaveLength(1);
      expect(openemrClient.getAvailableSlots).toHaveBeenCalled();
    });
  });
});