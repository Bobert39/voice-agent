/**
 * Appointment Management Service Tests
 * 
 * Comprehensive test suite for Story 3.3 appointment management functionality
 */

import { AppointmentLookupService } from '../services/appointment-lookup-service';
import { AppointmentManagementService } from '../services/appointment-management-service';
import { OpenEMRSchedulingClient } from '../services/openemr-client';
import { AvailabilityService } from '../services/availability-service';
import { AvailabilityResponseGenerator } from '../services/availability-response-generator';
import { Redis } from 'ioredis';

// Mock dependencies
jest.mock('ioredis');
jest.mock('../services/openemr-client');
jest.mock('../services/availability-service');
jest.mock('../services/availability-response-generator');

describe('Appointment Management Services', () => {
  let mockRedis: jest.Mocked<Redis>;
  let mockOpenEMRClient: jest.Mocked<OpenEMRSchedulingClient>;
  let mockAvailabilityService: jest.Mocked<AvailabilityService>;
  let mockResponseGenerator: jest.Mocked<AvailabilityResponseGenerator>;
  let appointmentLookupService: AppointmentLookupService;
  let appointmentManagementService: AppointmentManagementService;

  const mockAppointment = {
    id: 'apt_123',
    patientId: 'patient_456',
    patientName: 'John Doe',
    practitionerId: 'practitioner_789',
    practitionerName: 'Dr. Smith',
    datetime: '2025-09-20T10:00:00Z',
    duration: 60,
    type: 'routine',
    status: 'booked',
    reason: 'Annual eye exam',
    confirmationNumber: 'CE12345'
  };

  const mockCancellationPolicy = {
    minimumNoticeHours: 24,
    feeSchedule: {
      sameDay: 50,
      lessThan24Hours: 25,
      lessThan48Hours: 0,
      moreThan48Hours: 0
    },
    emergencyExceptions: true,
    noShowFee: 75
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      quit: jest.fn()
    } as any;

    mockOpenEMRClient = {
      searchAppointments: jest.fn(),
      searchPatientsByPhone: jest.fn(),
      getPatientDetails: jest.fn(),
      updateAppointment: jest.fn(),
      cancelAppointment: jest.fn(),
      checkSlotAvailability: jest.fn()
    } as any;

    mockAvailabilityService = {
      getAvailableSlots: jest.fn(),
      invalidateCache: jest.fn(),
      checkSlotAvailability: jest.fn()
    } as any;

    mockResponseGenerator = {
      generateAvailabilityResponse: jest.fn(),
      generateClarificationResponse: jest.fn(),
      generateBookingConfirmation: jest.fn()
    } as any;

    appointmentLookupService = new AppointmentLookupService(mockOpenEMRClient, mockRedis);
    appointmentManagementService = new AppointmentManagementService(
      mockOpenEMRClient,
      mockAvailabilityService,
      mockResponseGenerator,
      mockRedis,
      mockCancellationPolicy
    );
  });

  describe('AppointmentLookupService', () => {
    describe('lookupAppointments', () => {
      it('should find appointment by confirmation number', async () => {
        const request = {
          conversationId: 'conv_123',
          confirmationNumber: 'CE12345'
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(mockAppointment));

        const result = await appointmentLookupService.lookupAppointments(request);

        expect(result.success).toBe(true);
        expect(result.appointments).toHaveLength(1);
        expect(result.appointments![0].confirmationNumber).toBe('CE12345');
        expect(mockRedis.get).toHaveBeenCalledWith('appointment:confirmation:CE12345');
      });

      it('should find appointments by phone number with verification', async () => {
        const request = {
          conversationId: 'conv_123',
          phoneNumber: '555-123-4567'
        };

        const mockPatients = [{ id: 'patient_456', name: 'John Doe' }];
        mockOpenEMRClient.searchPatientsByPhone.mockResolvedValue(mockPatients);
        mockRedis.get.mockResolvedValue(JSON.stringify([mockAppointment]));

        const result = await appointmentLookupService.lookupAppointments(request);

        expect(result.success).toBe(true);
        expect(result.requiresVerification).toBe(true);
        expect(result.verificationMethod).toBe('dob');
        expect(mockOpenEMRClient.searchPatientsByPhone).toHaveBeenCalledWith('555-123-4567');
      });

      it('should handle no appointments found', async () => {
        const request = {
          conversationId: 'conv_123',
          confirmationNumber: 'INVALID'
        };

        mockRedis.get.mockResolvedValue(null);

        const result = await appointmentLookupService.lookupAppointments(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("couldn't find an appointment");
      });

      it('should filter out past appointments', async () => {
        const pastAppointment = {
          ...mockAppointment,
          datetime: '2020-01-01T10:00:00Z'
        };

        const request = {
          conversationId: 'conv_123',
          confirmationNumber: 'CE12345'
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(pastAppointment));

        const result = await appointmentLookupService.lookupAppointments(request);

        expect(result.success).toBe(true);
        expect(result.appointments).toHaveLength(0);
        expect(result.message).toContain("no upcoming ones");
      });
    });

    describe('verifyAppointmentAccess', () => {
      it('should verify patient with correct information', async () => {
        const conversationId = 'conv_123';
        
        // Setup stored appointments and verification status
        mockRedis.get
          .mockResolvedValueOnce(JSON.stringify([mockAppointment]))
          .mockResolvedValueOnce(JSON.stringify({
            method: 'phone_dob',
            verified: false,
            attempts: 0,
            maxAttempts: 3
          }));

        // Mock patient details for verification
        mockOpenEMRClient.getPatientDetails.mockResolvedValue({
          id: 'patient_456',
          phoneNumber: '555-123-4567',
          dateOfBirth: '1990-01-01'
        });

        const result = await appointmentLookupService.verifyAppointmentAccess(conversationId, {
          phoneNumber: '555-123-4567',
          dateOfBirth: '1990-01-01',
          method: 'phone_dob',
          verified: false,
          attempts: 1,
          maxAttempts: 3
        });

        expect(result.success).toBe(true);
        expect(result.appointments).toHaveLength(1);
      });

      it('should handle max verification attempts', async () => {
        const conversationId = 'conv_123';
        
        mockRedis.get
          .mockResolvedValueOnce(JSON.stringify([mockAppointment]))
          .mockResolvedValueOnce(JSON.stringify({
            method: 'phone_dob',
            verified: false,
            attempts: 2,
            maxAttempts: 3
          }));

        mockOpenEMRClient.getPatientDetails.mockResolvedValue({
          id: 'patient_456',
          phoneNumber: '555-999-9999', // Wrong phone
          dateOfBirth: '1990-01-01'
        });

        const result = await appointmentLookupService.verifyAppointmentAccess(conversationId, {
          phoneNumber: '555-123-4567',
          dateOfBirth: '1990-01-01',
          method: 'phone_dob',
          verified: false,
          attempts: 3,
          maxAttempts: 3
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain("transfer you to our staff");
      });
    });
  });

  describe('AppointmentManagementService', () => {
    beforeEach(() => {
      // Mock getting appointment details
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('appointment:')) {
          return Promise.resolve(JSON.stringify(mockAppointment));
        }
        return Promise.resolve(null);
      });
    });

    describe('modifyAppointment', () => {
      it('should cancel appointment successfully', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          modificationType: 'cancel' as const,
          reason: 'Personal reasons',
          conversationId: 'conv_123'
        };

        // Mock appointment in future (48+ hours)
        const futureAppointment = {
          ...mockAppointment,
          datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(futureAppointment));
        mockOpenEMRClient.cancelAppointment.mockResolvedValue(undefined);

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(true);
        expect(result.message).toContain("cancelled");
        expect(result.cancellationFee).toBeUndefined(); // No fee for 48+ hours notice
        expect(mockOpenEMRClient.cancelAppointment).toHaveBeenCalledWith('apt_123', 'Personal reasons');
      });

      it('should apply cancellation fee for short notice', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          modificationType: 'cancel' as const,
          reason: 'Emergency',
          conversationId: 'conv_123'
        };

        // Mock appointment in 12 hours (less than 24)
        const soonAppointment = {
          ...mockAppointment,
          datetime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(soonAppointment));
        mockOpenEMRClient.cancelAppointment.mockResolvedValue(undefined);

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(true);
        expect(result.cancellationFee).toBe(25); // Less than 24 hours fee
        expect(result.message).toContain("$25 cancellation fee");
      });

      it('should handle appointment not found', async () => {
        const request = {
          appointmentId: 'invalid_id',
          patientId: 'patient_456',
          modificationType: 'cancel' as const,
          conversationId: 'conv_123'
        };

        mockRedis.get.mockResolvedValue(null);

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("couldn't find that appointment");
      });

      it('should verify appointment ownership', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'wrong_patient',
          modificationType: 'cancel' as const,
          conversationId: 'conv_123'
        };

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("couldn't find an appointment with that information");
      });

      it('should prevent modification of past appointments', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          modificationType: 'cancel' as const,
          conversationId: 'conv_123'
        };

        const pastAppointment = {
          ...mockAppointment,
          datetime: '2020-01-01T10:00:00Z'
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(pastAppointment));

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("already passed");
      });
    });

    describe('rescheduleAppointment', () => {
      it('should find available slots for rescheduling', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          conversationId: 'conv_123'
        };

        const futureAppointment = {
          ...mockAppointment,
          datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        };

        const mockSlots = [
          {
            datetime: '2025-09-25T10:00:00Z',
            practitioner: 'Dr. Smith',
            practitionerId: 'practitioner_789',
            duration: 60,
            appointmentType: 'routine',
            available: true
          }
        ];

        mockRedis.get.mockResolvedValue(JSON.stringify(futureAppointment));
        mockAvailabilityService.getAvailableSlots.mockResolvedValue(mockSlots);

        const result = await appointmentManagementService.rescheduleAppointment(request);

        expect(result.success).toBe(true);
        expect(result.availableSlots).toHaveLength(1);
        expect(result.requiresConfirmation).toBe(true);
        expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalled();
      });

      it('should enforce minimum notice for rescheduling', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          conversationId: 'conv_123'
        };

        const soonAppointment = {
          ...mockAppointment,
          datetime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(soonAppointment));

        const result = await appointmentManagementService.rescheduleAppointment(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("24 hours notice");
      });

      it('should handle no available slots', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          conversationId: 'conv_123'
        };

        const futureAppointment = {
          ...mockAppointment,
          datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(futureAppointment));
        mockAvailabilityService.getAvailableSlots.mockResolvedValue([]);

        const result = await appointmentManagementService.rescheduleAppointment(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("don't see any available appointments");
      });
    });

    describe('confirmReschedule', () => {
      it('should successfully reschedule appointment', async () => {
        const appointmentId = 'apt_123';
        const patientId = 'patient_456';
        const newSlotId = 'slot_789';
        const conversationId = 'conv_123';

        const newSlot = {
          datetime: '2025-09-25T14:00:00Z',
          practitioner: 'Dr. Smith',
          practitionerId: 'practitioner_789',
          duration: 60
        };

        const updatedAppointment = {
          ...mockAppointment,
          datetime: newSlot.datetime,
          confirmationNumber: 'CE67890'
        };

        mockRedis.get
          .mockResolvedValueOnce(JSON.stringify(mockAppointment)) // Original appointment
          .mockResolvedValueOnce(JSON.stringify(newSlot)); // New slot

        mockOpenEMRClient.updateAppointment.mockResolvedValue(updatedAppointment);

        const result = await appointmentManagementService.confirmReschedule(
          appointmentId,
          patientId,
          newSlotId,
          conversationId
        );

        expect(result.success).toBe(true);
        expect(result.updatedAppointment?.datetime).toBe(newSlot.datetime);
        expect(result.newConfirmationNumber).toBeDefined();
        expect(mockOpenEMRClient.updateAppointment).toHaveBeenCalled();
      });

      it('should handle slot no longer available', async () => {
        const appointmentId = 'apt_123';
        const patientId = 'patient_456';
        const newSlotId = 'invalid_slot';
        const conversationId = 'conv_123';

        mockRedis.get
          .mockResolvedValueOnce(JSON.stringify(mockAppointment))
          .mockResolvedValueOnce(null); // Slot not found

        const result = await appointmentManagementService.confirmReschedule(
          appointmentId,
          patientId,
          newSlotId,
          conversationId
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain("no longer available");
      });
    });

    describe('Error Handling', () => {
      it('should handle OpenEMR service failures gracefully', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          modificationType: 'cancel' as const,
          conversationId: 'conv_123'
        };

        mockOpenEMRClient.cancelAppointment.mockRejectedValue(new Error('OpenEMR unavailable'));

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("having trouble");
      });

      it('should handle Redis connection failures', async () => {
        const request = {
          conversationId: 'conv_123',
          confirmationNumber: 'CE12345'
        };

        mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));

        const result = await appointmentLookupService.lookupAppointments(request);

        expect(result.success).toBe(false);
        expect(result.message).toContain("having trouble");
      });
    });

    describe('Business Logic Edge Cases', () => {
      it('should handle same-day cancellation with emergency exception', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          modificationType: 'cancel' as const,
          reason: 'Medical emergency',
          conversationId: 'conv_123'
        };

        const todayAppointment = {
          ...mockAppointment,
          datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours from now
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(todayAppointment));
        mockOpenEMRClient.cancelAppointment.mockResolvedValue(undefined);

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(true);
        expect(result.cancellationFee).toBe(50); // Same day fee
      });

      it('should handle appointment type changes with duration adjustments', async () => {
        const request = {
          appointmentId: 'apt_123',
          patientId: 'patient_456',
          modificationType: 'change_type' as const,
          newAppointmentType: 'follow-up' as const,
          conversationId: 'conv_123'
        };

        const routineAppointment = {
          ...mockAppointment,
          type: 'routine',
          duration: 60
        };

        mockRedis.get.mockResolvedValue(JSON.stringify(routineAppointment));
        mockOpenEMRClient.updateAppointment.mockResolvedValue({
          ...routineAppointment,
          type: 'follow-up',
          duration: 30
        });

        const result = await appointmentManagementService.modifyAppointment(request);

        expect(result.success).toBe(true);
        expect(result.message).toContain("changed your appointment to a follow-up");
        expect(result.message).toContain("30 minutes");
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete reschedule workflow', async () => {
      // 1. Lookup appointment
      const lookupRequest = {
        conversationId: 'conv_123',
        confirmationNumber: 'CE12345'
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockAppointment));

      const lookupResult = await appointmentLookupService.lookupAppointments(lookupRequest);
      expect(lookupResult.success).toBe(true);

      // 2. Reschedule appointment
      const rescheduleRequest = {
        appointmentId: 'apt_123',
        patientId: 'patient_456',
        conversationId: 'conv_123'
      };

      const futureAppointment = {
        ...mockAppointment,
        datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      };

      const mockSlots = [{
        datetime: '2025-09-25T14:00:00Z',
        practitioner: 'Dr. Smith',
        practitionerId: 'practitioner_789',
        duration: 60,
        appointmentType: 'routine',
        available: true
      }];

      mockRedis.get.mockResolvedValue(JSON.stringify(futureAppointment));
      mockAvailabilityService.getAvailableSlots.mockResolvedValue(mockSlots);

      const rescheduleResult = await appointmentManagementService.rescheduleAppointment(rescheduleRequest);
      expect(rescheduleResult.success).toBe(true);
      expect(rescheduleResult.availableSlots).toHaveLength(1);

      // 3. Confirm reschedule
      const confirmResult = await appointmentManagementService.confirmReschedule(
        'apt_123',
        'patient_456',
        'slot_789',
        'conv_123'
      );

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(futureAppointment))
        .mockResolvedValueOnce(JSON.stringify(mockSlots[0]));

      mockOpenEMRClient.updateAppointment.mockResolvedValue({
        ...futureAppointment,
        datetime: mockSlots[0].datetime
      });

      expect(confirmResult.success).toBe(true);
    });
  });
});