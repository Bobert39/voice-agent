/**
 * Comprehensive Test Suite for Story 3.4 Enhanced Cancellation System
 * 
 * Tests all aspects of the enhanced cancellation workflow including:
 * - Waitlist management and intelligent matching
 * - Enhanced confirmation with reference numbers
 * - Staff notifications with categorization
 * - Emergency cancellation protocols
 * - Conversation flow integration
 * - Accessibility and elderly-friendly patterns
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { Redis } from 'ioredis';
import { EnhancedCancellationService } from '../services/enhanced-cancellation-service';
import { WaitlistManagementService } from '../services/waitlist-management-service';
import { CancellationConfirmationService } from '../services/cancellation-confirmation-service';
import { StaffNotificationService } from '../services/staff-notification-service';
import { AppointmentManagementService } from '../services/appointment-management-service';
import { 
  EnhancedCancellationRequest,
  AppointmentDetails,
  WaitlistEntry,
  CancellationConfirmation 
} from '../types';

// Mock Redis and external services
jest.mock('ioredis');
jest.mock('@voice-agent/shared-utils', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Enhanced Cancellation System (Story 3.4)', () => {
  let redis: jest.Mocked<Redis>;
  let appointmentService: jest.Mocked<AppointmentManagementService>;
  let waitlistService: jest.Mocked<WaitlistManagementService>;
  let confirmationService: jest.Mocked<CancellationConfirmationService>;
  let staffNotificationService: jest.Mocked<StaffNotificationService>;
  let enhancedCancellationService: EnhancedCancellationService;

  const mockAppointment: AppointmentDetails = {
    id: 'apt_123',
    patientId: 'patient_456',
    patientName: 'John Doe',
    practitionerId: 'dr_789',
    practitionerName: 'Dr. Smith',
    datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours from now
    duration: 60,
    type: 'routine',
    status: 'scheduled',
    confirmationNumber: 'CE123ABC'
  };

  const mockWaitlistEntry: WaitlistEntry = {
    id: 'wl_456',
    patientId: 'patient_789',
    patientName: 'Jane Smith',
    phoneNumber: '555-123-4567',
    appointmentType: 'routine',
    preferredDates: [new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0]],
    preferredTimeOfDay: 'morning',
    priority: 'normal',
    createdAt: new Date().toISOString(),
    notificationPreferences: {
      methods: ['voice', 'sms'],
      immediateNotify: true,
      businessHoursOnly: false
    },
    maxWaitDays: 14
  };

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      zadd: jest.fn(),
      zrevrange: jest.fn(),
      lrange: jest.fn(),
      lpush: jest.fn(),
      expire: jest.fn()
    } as any;

    appointmentService = {
      modifyAppointment: jest.fn()
    } as any;

    waitlistService = {
      notifyWaitlistForCancelledSlot: jest.fn(),
      processWaitlistResponse: jest.fn(),
      addToWaitlist: jest.fn()
    } as any;

    confirmationService = {
      createCancellationConfirmation: jest.fn(),
      deliverConfirmation: jest.fn(),
      updateWaitlistNotificationStatus: jest.fn(),
      getCancellationConfirmation: jest.fn()
    } as any;

    staffNotificationService = {
      notifyStaffOfCancellation: jest.fn(),
      getActiveNotifications: jest.fn()
    } as any;

    enhancedCancellationService = new EnhancedCancellationService(
      appointmentService,
      waitlistService,
      confirmationService,
      staffNotificationService,
      redis
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Standard Cancellation Workflow', () => {
    it('should process complete standard cancellation workflow', async () => {
      // Setup mocks
      redis.get.mockResolvedValue(JSON.stringify(mockAppointment));
      
      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Appointment cancelled',
        cancellationFee: 25
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC123DEF',
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: mockAppointment,
        cancellationFee: 25,
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Confirmation delivered',
        confirmationDelivery: { voice: true }
      });

      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([]);

      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_123',
        type: 'late_cancellation',
        priority: 'normal',
        title: 'Late cancellation',
        message: 'Patient cancelled appointment',
        requiresAction: true,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      // Execute test
      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        reason: 'Schedule conflict',
        conversationId: 'conv_123'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.referenceNumber).toBe('CC123DEF');
      expect(result.cancellationFee).toBe(25);
      expect(result.waitlistNotified).toBe(false);
      expect(result.staffNotificationSent).toBe(true);
      expect(result.emergencyProtocolActivated).toBe(false);

      // Verify service calls
      expect(appointmentService.modifyAppointment).toHaveBeenCalledWith({
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        modificationType: 'cancel',
        reason: 'Schedule conflict',
        conversationId: 'conv_123'
      });

      expect(confirmationService.createCancellationConfirmation).toHaveBeenCalled();
      expect(confirmationService.deliverConfirmation).toHaveBeenCalled();
      expect(waitlistService.notifyWaitlistForCancelledSlot).toHaveBeenCalled();
      expect(staffNotificationService.notifyStaffOfCancellation).toHaveBeenCalled();
    });

    it('should handle appointment not found error', async () => {
      redis.get.mockResolvedValue(null);

      const request: EnhancedCancellationRequest = {
        appointmentId: 'nonexistent',
        patientId: 'patient_456',
        conversationId: 'conv_123'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(false);
      expect(result.message).toContain("couldn't find that appointment");
      expect(result.error).toContain('not found');
    });

    it('should handle ownership validation failure', async () => {
      const wrongPatientAppointment = { ...mockAppointment, patientId: 'different_patient' };
      redis.get.mockResolvedValue(JSON.stringify(wrongPatientAppointment));

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: 'patient_456',
        conversationId: 'conv_123'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(false);
      expect(result.message).toContain("couldn't find that appointment");
    });
  });

  describe('Emergency Cancellation Protocol', () => {
    it('should process emergency cancellation with no fees', async () => {
      // Setup emergency appointment (less than 24 hours)
      const emergencyAppointment = {
        ...mockAppointment,
        datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours from now
      };

      redis.get.mockResolvedValue(JSON.stringify(emergencyAppointment));

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Emergency cancellation processed',
        cancellationFee: 0
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC789EMG',
        appointmentId: emergencyAppointment.id,
        patientId: emergencyAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: emergencyAppointment,
        cancellationFee: 0,
        reason: 'EMERGENCY: Medical emergency',
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() },
          sms: { delivered: true, deliveredAt: new Date().toISOString(), phoneNumber: '555-123-4567' }
        },
        waitlistNotified: true,
        waitlistNotificationCount: 2
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Emergency confirmation delivered',
        confirmationDelivery: { voice: true, sms: true }
      });

      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([
        { id: 'wn_1', waitlistEntryId: 'wl_1' },
        { id: 'wn_2', waitlistEntryId: 'wl_2' }
      ]);

      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_emergency',
        type: 'emergency_cancellation',
        priority: 'critical',
        title: 'EMERGENCY: routine appointment cancelled',
        message: 'Emergency cancellation',
        requiresAction: true,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      // Execute emergency cancellation
      const request: EnhancedCancellationRequest = {
        appointmentId: emergencyAppointment.id,
        patientId: emergencyAppointment.patientId,
        emergency: true,
        emergencyReason: 'Medical emergency',
        preferredConfirmationMethods: ['voice', 'sms'],
        conversationId: 'conv_emergency'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.emergencyProtocolActivated).toBe(true);
      expect(result.cancellationFee).toBe(0);
      expect(result.waitlistNotified).toBe(true);
      expect(result.waitlistCount).toBe(2);
      expect(result.message).toContain('emergency');

      // Verify emergency-specific calls
      expect(appointmentService.modifyAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'EMERGENCY: Medical emergency'
        })
      );

      expect(staffNotificationService.notifyStaffOfCancellation).toHaveBeenCalledWith(
        emergencyAppointment,
        mockConfirmation,
        true, // emergency flag
        false
      );
    });

    it('should handle emergency cancellation system failure gracefully', async () => {
      redis.get.mockResolvedValue(JSON.stringify(mockAppointment));
      appointmentService.modifyAppointment.mockRejectedValue(new Error('System failure'));

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        emergency: true,
        emergencyReason: 'Medical emergency',
        conversationId: 'conv_emergency'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(false);
      expect(result.emergencyProtocolActivated).toBe(true);
      expect(result.message).toContain('emergency');
      expect(result.message).toContain('call our office immediately');
    });
  });

  describe('Waitlist Management', () => {
    it('should notify multiple waitlisted patients for cancelled appointment', async () => {
      redis.get.mockResolvedValue(JSON.stringify(mockAppointment));

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Appointment cancelled',
        cancellationFee: 0
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC456WL',
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: mockAppointment,
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Confirmation delivered',
        confirmationDelivery: { voice: true }
      });

      // Mock multiple waitlist notifications
      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([
        { id: 'wn_1', waitlistEntryId: 'wl_patient1', status: 'sent' },
        { id: 'wn_2', waitlistEntryId: 'wl_patient2', status: 'sent' },
        { id: 'wn_3', waitlistEntryId: 'wl_patient3', status: 'sent' }
      ]);

      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_waitlist',
        type: 'cancellation',
        priority: 'normal',
        title: 'Appointment cancelled',
        message: 'Patient cancelled appointment',
        requiresAction: false,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        conversationId: 'conv_waitlist'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(true);
      expect(result.waitlistNotified).toBe(true);
      expect(result.waitlistCount).toBe(3);

      // Verify waitlist service was called with correct criteria
      expect(waitlistService.notifyWaitlistForCancelledSlot).toHaveBeenCalledWith({
        appointmentType: mockAppointment.type,
        datetime: mockAppointment.datetime,
        practitionerId: mockAppointment.practitionerId,
        duration: mockAppointment.duration
      });

      // Verify confirmation was updated with waitlist results
      expect(confirmationService.updateWaitlistNotificationStatus).toHaveBeenCalledWith(
        'CC456WL',
        true,
        3
      );
    });
  });

  describe('Enhanced Confirmation System', () => {
    it('should deliver confirmation via multiple methods', async () => {
      redis.get.mockResolvedValue(JSON.stringify(mockAppointment));

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Appointment cancelled'
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC789MULTI',
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: mockAppointment,
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() },
          sms: { delivered: true, deliveredAt: new Date().toISOString(), phoneNumber: '555-123-4567' },
          email: { delivered: true, deliveredAt: new Date().toISOString(), emailAddress: 'patient@example.com' }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Multi-channel confirmation delivered',
        confirmationDelivery: { voice: true, sms: true, email: true }
      });

      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([]);
      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_multi',
        type: 'cancellation',
        priority: 'low',
        title: 'Appointment cancelled',
        message: 'Standard cancellation',
        requiresAction: false,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        preferredConfirmationMethods: ['voice', 'sms', 'email'],
        conversationId: 'conv_multi'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(true);
      expect(result.confirmationDelivery?.voice).toBe(true);
      expect(result.confirmationDelivery?.sms).toBe(true);
      expect(result.confirmationDelivery?.email).toBe(true);
    });

    it('should include elderly-friendly reference number pronunciation', async () => {
      redis.get.mockResolvedValue(JSON.stringify(mockAppointment));

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Appointment cancelled'
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC123ABC456',
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: mockAppointment,
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Your cancellation reference number is C C 1 2 3 A B C 4 5 6. Let me repeat that slowly: C C 1 2 3 A B C 4 5 6.',
        confirmationDelivery: { voice: true }
      });

      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([]);
      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_elderly',
        type: 'cancellation',
        priority: 'low',
        title: 'Appointment cancelled',
        message: 'Standard cancellation',
        requiresAction: false,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        conversationId: 'conv_elderly'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(true);
      expect(result.referenceNumber).toBe('CC123ABC456');
      expect(result.message).toContain('repeat that slowly');
    });
  });

  describe('Staff Notification System', () => {
    it('should create appropriate staff notifications for different cancellation types', async () => {
      // Test late cancellation notification
      const lateAppointment = {
        ...mockAppointment,
        datetime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // 12 hours from now
      };

      redis.get.mockResolvedValue(JSON.stringify(lateAppointment));

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Appointment cancelled',
        cancellationFee: 25
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC123LATE',
        appointmentId: lateAppointment.id,
        patientId: lateAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: lateAppointment,
        cancellationFee: 25,
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Confirmation delivered',
        confirmationDelivery: { voice: true }
      });

      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([]);

      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_late',
        type: 'late_cancellation',
        priority: 'normal',
        title: 'Late cancellation: routine appointment',
        message: 'Patient John Doe has cancelled their routine appointment with Dr. Smith. This is a late notice cancellation. Cancellation fee: $25.',
        appointmentId: lateAppointment.id,
        patientId: lateAppointment.patientId,
        requiresAction: true,
        actionType: 'billing_review',
        department: 'billing',
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      const request: EnhancedCancellationRequest = {
        appointmentId: lateAppointment.id,
        patientId: lateAppointment.patientId,
        conversationId: 'conv_late'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(true);
      expect(result.staffNotificationSent).toBe(true);

      // Verify staff notification was created with correct parameters
      expect(staffNotificationService.notifyStaffOfCancellation).toHaveBeenCalledWith(
        lateAppointment,
        mockConfirmation,
        false, // not emergency
        true   // is late notice
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle partial service failures gracefully', async () => {
      redis.get.mockResolvedValue(JSON.stringify(mockAppointment));

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Appointment cancelled'
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC123PARTIAL',
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: mockAppointment,
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Confirmation delivered',
        confirmationDelivery: { voice: true }
      });

      // Waitlist service fails
      waitlistService.notifyWaitlistForCancelledSlot.mockRejectedValue(new Error('Waitlist service unavailable'));

      // Staff notification succeeds
      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_partial',
        type: 'cancellation',
        priority: 'low',
        title: 'Appointment cancelled',
        message: 'Standard cancellation',
        requiresAction: false,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        conversationId: 'conv_partial'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      // Should still succeed overall even with waitlist failure
      expect(result.success).toBe(true);
      expect(result.waitlistNotified).toBe(false);
      expect(result.waitlistCount).toBe(0);
      expect(result.staffNotificationSent).toBe(true);
    });

    it('should handle cancelled appointment status', async () => {
      const cancelledAppointment = { ...mockAppointment, status: 'cancelled' };
      redis.get.mockResolvedValue(JSON.stringify(cancelledAppointment));

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        conversationId: 'conv_already_cancelled'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(false);
      expect(result.message).toContain("couldn't find that appointment");
    });

    it('should handle past appointment cancellation attempts', async () => {
      const pastAppointment = {
        ...mockAppointment,
        datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
      };
      redis.get.mockResolvedValue(JSON.stringify(pastAppointment));

      const request: EnhancedCancellationRequest = {
        appointmentId: mockAppointment.id,
        patientId: mockAppointment.patientId,
        conversationId: 'conv_past'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(false);
      expect(result.message).toContain("couldn't find that appointment");
    });

    it('should allow past appointment cancellation in emergency', async () => {
      const pastAppointment = {
        ...mockAppointment,
        datetime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      };
      redis.get.mockResolvedValue(JSON.stringify(pastAppointment));

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Emergency cancellation processed'
      });

      const mockConfirmation: CancellationConfirmation = {
        referenceNumber: 'CC123PAST',
        appointmentId: pastAppointment.id,
        patientId: pastAppointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: pastAppointment,
        cancellationFee: 0,
        deliveryMethods: {
          voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      confirmationService.createCancellationConfirmation.mockResolvedValue(mockConfirmation);
      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Emergency confirmation delivered',
        confirmationDelivery: { voice: true }
      });

      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([]);
      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_past_emergency',
        type: 'emergency_cancellation',
        priority: 'critical',
        title: 'EMERGENCY: routine appointment cancelled',
        message: 'Emergency cancellation',
        requiresAction: true,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      const request: EnhancedCancellationRequest = {
        appointmentId: pastAppointment.id,
        patientId: pastAppointment.patientId,
        emergency: true,
        emergencyReason: 'Medical emergency occurred',
        conversationId: 'conv_past_emergency'
      };

      const result = await enhancedCancellationService.processCancellation(request);

      expect(result.success).toBe(true);
      expect(result.emergencyProtocolActivated).toBe(true);
      expect(result.cancellationFee).toBe(0);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent cancellation requests', async () => {
      // Setup multiple appointments
      const appointments = Array.from({ length: 10 }, (_, i) => ({
        ...mockAppointment,
        id: `apt_${i}`,
        patientId: `patient_${i}`
      }));

      // Mock responses for all appointments
      redis.get.mockImplementation((key: string) => {
        const aptId = key.split(':')[1];
        const apt = appointments.find(a => a.id === aptId);
        return Promise.resolve(apt ? JSON.stringify(apt) : null);
      });

      appointmentService.modifyAppointment.mockResolvedValue({
        success: true,
        message: 'Appointment cancelled'
      });

      confirmationService.createCancellationConfirmation.mockImplementation((apt) => 
        Promise.resolve({
          referenceNumber: `CC${apt.id}`,
          appointmentId: apt.id,
          patientId: apt.patientId,
          cancellationDateTime: new Date().toISOString(),
          originalAppointment: apt,
          deliveryMethods: {
            voice: { delivered: true, confirmed: true, deliveredAt: new Date().toISOString() }
          },
          waitlistNotified: false,
          waitlistNotificationCount: 0
        })
      );

      confirmationService.deliverConfirmation.mockResolvedValue({
        success: true,
        message: 'Confirmation delivered',
        confirmationDelivery: { voice: true }
      });

      waitlistService.notifyWaitlistForCancelledSlot.mockResolvedValue([]);
      staffNotificationService.notifyStaffOfCancellation.mockResolvedValue({
        id: 'sn_concurrent',
        type: 'cancellation',
        priority: 'low',
        title: 'Appointment cancelled',
        message: 'Standard cancellation',
        requiresAction: false,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      });

      // Execute concurrent cancellations
      const requests = appointments.map(apt => ({
        appointmentId: apt.id,
        patientId: apt.patientId,
        conversationId: `conv_${apt.id}`
      }));

      const results = await Promise.all(
        requests.map(req => enhancedCancellationService.processCancellation(req))
      );

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      expect(results).toHaveLength(10);

      // Verify all services were called for each cancellation
      expect(appointmentService.modifyAppointment).toHaveBeenCalledTimes(10);
      expect(confirmationService.createCancellationConfirmation).toHaveBeenCalledTimes(10);
      expect(staffNotificationService.notifyStaffOfCancellation).toHaveBeenCalledTimes(10);
    });
  });
});