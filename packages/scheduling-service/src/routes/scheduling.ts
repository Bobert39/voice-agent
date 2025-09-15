/**
 * Scheduling Service REST API Routes
 * 
 * Provides endpoints for appointment availability queries,
 * bookings, cancellations, and management
 */

import { Router, Request, Response } from 'express';
import { SchedulingService } from '../services/scheduling-service';
import { 
  AvailabilityRequest,
  BookingRequest,
  CancellationRequest,
  // Story 3.3 types
  AppointmentLookupRequest,
  AppointmentModificationRequest,
  RescheduleRequest,
  // Story 3.4 types
  EnhancedCancellationRequest,
  WaitlistEntry,
  // Story 3.5 types
  AppointmentConfirmationRequest
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export function createSchedulingRoutes(schedulingService: SchedulingService): Router {
  const router = Router();

  /**
   * Process natural language availability query
   * POST /api/v1/availability/query
   */
  router.post('/api/v1/availability/query', async (req: Request, res: Response) => {
    try {
      const { query, patientId, sessionId } = req.body;

      if (!query || !sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: query and sessionId'
        });
      }

      const response = await schedulingService.processNaturalLanguageQuery(query, patientId, sessionId);
      
      res.json(response);
    } catch (error) {
      logger.error('Error processing availability query', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        response: "I'm having trouble checking our appointment system right now. Would you like me to connect you with our scheduling team?",
        requiresFollowUp: true
      });
    }
  });

  /**
   * Query appointment availability
   * POST /api/scheduling/availability
   */
  router.post('/availability', async (req: Request, res: Response) => {
    try {
      const request: AvailabilityRequest = {
        query: req.body.query,
        patientId: req.body.patientId,
        conversationId: req.body.conversationId,
        context: req.body.context
      };

      if (!request.query || !request.conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: query and conversationId'
        });
      }

      const response = await schedulingService.processAvailabilityQuery(request);
      
      res.json(response);
    } catch (error) {
      logger.error('Error processing availability query', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Book an appointment
   * POST /api/scheduling/book
   */
  router.post('/book', async (req: Request, res: Response) => {
    try {
      const request: BookingRequest = {
        slotId: req.body.slotId,
        patientId: req.body.patientId,
        appointmentType: req.body.appointmentType,
        reason: req.body.reason,
        specialRequirements: req.body.specialRequirements,
        conversationId: req.body.conversationId
      };

      if (!request.slotId || !request.patientId || !request.appointmentType || !request.conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: slotId, patientId, appointmentType, and conversationId'
        });
      }

      const response = await schedulingService.bookAppointment(request);
      
      res.json(response);
    } catch (error) {
      logger.error('Error booking appointment', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Cancel an appointment
   * POST /api/scheduling/cancel
   */
  router.post('/cancel', async (req: Request, res: Response) => {
    try {
      const request: CancellationRequest = {
        appointmentId: req.body.appointmentId,
        patientId: req.body.patientId,
        reason: req.body.reason,
        conversationId: req.body.conversationId
      };

      if (!request.appointmentId || !request.patientId || !request.conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appointmentId, patientId, and conversationId'
        });
      }

      const response = await schedulingService.cancelAppointment(request);
      
      res.json(response);
    } catch (error) {
      logger.error('Error cancelling appointment', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Get scheduling metrics
   * GET /api/scheduling/metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = schedulingService.getMetrics();
      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Error retrieving metrics', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Get next available slots (convenience endpoint)
   * GET /api/scheduling/next-available
   */
  router.get('/next-available', async (req: Request, res: Response) => {
    try {
      const appointmentType = req.query.type as 'routine' | 'follow-up' | 'urgent' || 'routine';
      const maxSlots = parseInt(req.query.limit as string) || 3;
      const practitionerId = req.query.practitioner as string;

      const availabilityService = (schedulingService as any).availabilityService;
      const slots = await availabilityService.getNextAvailableSlots(
        appointmentType,
        maxSlots,
        practitionerId
      );

      res.json({
        success: true,
        slots
      });
    } catch (error) {
      logger.error('Error getting next available slots', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Clear availability cache (admin endpoint)
   * POST /api/scheduling/cache/clear
   */
  router.post('/cache/clear', async (req: Request, res: Response) => {
    try {
      // This should be protected with authentication in production
      const startDate = req.body.startDate;
      const endDate = req.body.endDate;

      const availabilityService = (schedulingService as any).availabilityService;
      await availabilityService.invalidateCache(startDate, endDate);

      res.json({
        success: true,
        message: 'Cache cleared successfully'
      });
    } catch (error) {
      logger.error('Error clearing cache', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Story 3.3: Appointment Management Routes

  /**
   * Lookup appointments using various criteria
   * POST /api/scheduling/lookup
   */
  router.post('/lookup', async (req: Request, res: Response) => {
    try {
      const request: AppointmentLookupRequest = {
        confirmationNumber: req.body.confirmationNumber,
        phoneNumber: req.body.phoneNumber,
        patientId: req.body.patientId,
        dateRange: req.body.dateRange,
        conversationId: req.body.conversationId
      };

      if (!request.conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: conversationId'
        });
      }

      if (!request.confirmationNumber && !request.phoneNumber && !request.patientId) {
        return res.status(400).json({
          success: false,
          error: 'At least one lookup criteria required: confirmationNumber, phoneNumber, or patientId'
        });
      }

      const response = await schedulingService.lookupAppointments(request);
      res.json(response);
    } catch (error) {
      logger.error('Error looking up appointments', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble finding appointment information right now. Please try again or speak with our staff."
      });
    }
  });

  /**
   * Verify patient identity for appointment access
   * POST /api/scheduling/verify
   */
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const { conversationId, phoneNumber, dateOfBirth, lastName } = req.body;

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: conversationId'
        });
      }

      const response = await schedulingService.verifyAppointmentAccess(
        conversationId,
        phoneNumber,
        dateOfBirth,
        lastName
      );
      
      res.json(response);
    } catch (error) {
      logger.error('Error verifying appointment access', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble verifying your information. Let me transfer you to our staff for assistance."
      });
    }
  });

  /**
   * Modify an existing appointment
   * POST /api/scheduling/modify
   */
  router.post('/modify', async (req: Request, res: Response) => {
    try {
      const request: AppointmentModificationRequest = {
        appointmentId: req.body.appointmentId,
        patientId: req.body.patientId,
        modificationType: req.body.modificationType,
        newDateTime: req.body.newDateTime,
        newAppointmentType: req.body.newAppointmentType,
        reason: req.body.reason,
        conversationId: req.body.conversationId
      };

      if (!request.appointmentId || !request.patientId || !request.modificationType || !request.conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appointmentId, patientId, modificationType, and conversationId'
        });
      }

      const response = await schedulingService.modifyAppointment(request);
      res.json(response);
    } catch (error) {
      logger.error('Error modifying appointment', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble modifying your appointment right now. Please try again or speak with our staff."
      });
    }
  });

  /**
   * Reschedule an appointment
   * POST /api/scheduling/reschedule
   */
  router.post('/reschedule', async (req: Request, res: Response) => {
    try {
      const request: RescheduleRequest = {
        appointmentId: req.body.appointmentId,
        patientId: req.body.patientId,
        preferredDateTime: req.body.preferredDateTime,
        preferredTimeOfDay: req.body.preferredTimeOfDay,
        dateRange: req.body.dateRange,
        conversationId: req.body.conversationId
      };

      if (!request.appointmentId || !request.patientId || !request.conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appointmentId, patientId, and conversationId'
        });
      }

      const response = await schedulingService.rescheduleAppointment(request);
      res.json(response);
    } catch (error) {
      logger.error('Error rescheduling appointment', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble finding new appointment times. Please try again or speak with our staff."
      });
    }
  });

  /**
   * Confirm a reschedule with specific time slot
   * POST /api/scheduling/reschedule/confirm
   */
  router.post('/reschedule/confirm', async (req: Request, res: Response) => {
    try {
      const { appointmentId, patientId, newSlotId, conversationId } = req.body;

      if (!appointmentId || !patientId || !newSlotId || !conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appointmentId, patientId, newSlotId, and conversationId'
        });
      }

      const response = await schedulingService.confirmReschedule(
        appointmentId,
        patientId,
        newSlotId,
        conversationId
      );
      
      res.json(response);
    } catch (error) {
      logger.error('Error confirming reschedule', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm sorry, I couldn't complete the reschedule. The time slot may no longer be available."
      });
    }
  });

  /**
   * Process natural language appointment management query
   * POST /api/scheduling/management/query
   */
  router.post('/management/query', async (req: Request, res: Response) => {
    try {
      const { query, conversationId, patientId } = req.body;

      if (!query || !conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: query and conversationId'
        });
      }

      const response = await schedulingService.processAppointmentManagementQuery(
        query,
        conversationId,
        patientId
      );
      
      res.json(response);
    } catch (error) {
      logger.error('Error processing appointment management query', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        response: "I'm having trouble understanding your request. Could you please tell me if you'd like to look up, reschedule, or cancel an appointment?",
        requiresFollowUp: true
      });
    }
  });

  // Story 3.4: Enhanced Cancellation Routes

  /**
   * Process enhanced cancellation with waitlist and confirmations
   * POST /api/scheduling/cancel/enhanced
   */
  router.post('/cancel/enhanced', async (req: Request, res: Response) => {
    try {
      const request: EnhancedCancellationRequest = {
        appointmentId: req.body.appointmentId,
        patientId: req.body.patientId,
        reason: req.body.reason,
        conversationId: req.body.conversationId,
        emergency: req.body.emergency,
        emergencyReason: req.body.emergencyReason,
        requestMultipleConfirmation: req.body.requestMultipleConfirmation,
        preferredConfirmationMethods: req.body.preferredConfirmationMethods
      };

      if (!request.appointmentId || !request.patientId || !request.conversationId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appointmentId, patientId, and conversationId'
        });
      }

      const enhancedCancellationService = (schedulingService as any).enhancedCancellationService;
      if (!enhancedCancellationService) {
        return res.status(503).json({
          success: false,
          error: 'Enhanced cancellation service not available',
          message: "The enhanced cancellation system is currently unavailable. Let me transfer you to our staff for assistance."
        });
      }

      const response = await enhancedCancellationService.processCancellation(request);
      res.json(response);
    } catch (error) {
      logger.error('Error processing enhanced cancellation', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble processing your cancellation right now. Please try again or speak with our staff for assistance."
      });
    }
  });

  /**
   * Get cancellation confirmation by reference number
   * GET /api/scheduling/cancel/confirmation/:referenceNumber
   */
  router.get('/cancel/confirmation/:referenceNumber', async (req: Request, res: Response) => {
    try {
      const { referenceNumber } = req.params;

      if (!referenceNumber) {
        return res.status(400).json({
          success: false,
          error: 'Missing reference number'
        });
      }

      const enhancedCancellationService = (schedulingService as any).enhancedCancellationService;
      if (!enhancedCancellationService) {
        return res.status(503).json({
          success: false,
          error: 'Enhanced cancellation service not available'
        });
      }

      const confirmation = await enhancedCancellationService.getCancellationByReference(referenceNumber);
      
      if (!confirmation) {
        return res.status(404).json({
          success: false,
          error: 'Cancellation confirmation not found',
          message: "I couldn't find a cancellation with that reference number. Please check the number and try again."
        });
      }

      res.json({
        success: true,
        confirmation
      });
    } catch (error) {
      logger.error('Error retrieving cancellation confirmation', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble retrieving that cancellation information. Please try again or speak with our staff."
      });
    }
  });

  /**
   * Add patient to waitlist
   * POST /api/scheduling/waitlist/add
   */
  router.post('/waitlist/add', async (req: Request, res: Response) => {
    try {
      const entry: Omit<WaitlistEntry, 'id' | 'createdAt'> = {
        patientId: req.body.patientId,
        patientName: req.body.patientName,
        phoneNumber: req.body.phoneNumber,
        appointmentType: req.body.appointmentType,
        preferredDates: req.body.preferredDates,
        preferredTimeOfDay: req.body.preferredTimeOfDay,
        preferredProvider: req.body.preferredProvider,
        priority: req.body.priority || 'normal',
        notificationPreferences: req.body.notificationPreferences || {
          methods: ['voice'],
          immediateNotify: true,
          businessHoursOnly: false
        },
        maxWaitDays: req.body.maxWaitDays || 14,
        specialRequirements: req.body.specialRequirements
      };

      if (!entry.patientId || !entry.patientName || !entry.phoneNumber || !entry.appointmentType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: patientId, patientName, phoneNumber, and appointmentType'
        });
      }

      const waitlistService = (schedulingService as any).waitlistService;
      if (!waitlistService) {
        return res.status(503).json({
          success: false,
          error: 'Waitlist service not available',
          message: "The waitlist system is currently unavailable. Please call our office to be added to the waitlist."
        });
      }

      const waitlistEntry = await waitlistService.addToWaitlist(entry);
      
      res.json({
        success: true,
        message: "You've been successfully added to our waitlist. We'll notify you as soon as an earlier appointment becomes available.",
        waitlistEntry
      });
    } catch (error) {
      logger.error('Error adding to waitlist', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble adding you to the waitlist right now. Please try again or call our office."
      });
    }
  });

  /**
   * Process waitlist notification response
   * POST /api/scheduling/waitlist/response
   */
  router.post('/waitlist/response', async (req: Request, res: Response) => {
    try {
      const { notificationId, response } = req.body;

      if (!notificationId || !response) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: notificationId and response'
        });
      }

      if (!['accepted', 'declined'].includes(response)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid response. Must be "accepted" or "declined"'
        });
      }

      const enhancedCancellationService = (schedulingService as any).enhancedCancellationService;
      if (!enhancedCancellationService) {
        return res.status(503).json({
          success: false,
          error: 'Enhanced cancellation service not available'
        });
      }

      const success = await enhancedCancellationService.processWaitlistResponse(notificationId, response);
      
      if (success) {
        const message = response === 'accepted' 
          ? "Thank you for accepting the appointment! Our staff will contact you shortly to confirm the details."
          : "Thank you for responding. We'll continue looking for other appointment times that work for you.";
        
        res.json({
          success: true,
          message
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Waitlist notification not found or expired',
          message: "I couldn't find that waitlist notification. It may have expired or already been processed."
        });
      }
    } catch (error) {
      logger.error('Error processing waitlist response', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: "I'm having trouble processing your response right now. Please try again or call our office."
      });
    }
  });

  /**
   * Get active staff notifications
   * GET /api/scheduling/staff/notifications
   */
  router.get('/staff/notifications', async (req: Request, res: Response) => {
    try {
      const { department, priority, limit } = req.query;

      const enhancedCancellationService = (schedulingService as any).enhancedCancellationService;
      if (!enhancedCancellationService) {
        return res.status(503).json({
          success: false,
          error: 'Enhanced cancellation service not available'
        });
      }

      const notifications = await enhancedCancellationService.getActiveStaffNotifications(
        department as string,
        Number(limit) || 50
      );
      
      res.json({
        success: true,
        notifications
      });
    } catch (error) {
      logger.error('Error retrieving staff notifications', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * Get cancellation metrics for reporting
   * GET /api/scheduling/metrics/cancellation
   */
  router.get('/metrics/cancellation', async (req: Request, res: Response) => {
    try {
      const { timeframe } = req.query;

      const enhancedCancellationService = (schedulingService as any).enhancedCancellationService;
      if (!enhancedCancellationService) {
        return res.status(503).json({
          success: false,
          error: 'Enhanced cancellation service not available'
        });
      }

      const metrics = await enhancedCancellationService.getCancellationMetrics(
        timeframe as 'hour' | 'day' | 'week' || 'day'
      );
      
      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Error retrieving cancellation metrics', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Story 3.5: Appointment Confirmation and Reminder Routes

  /**
   * Send appointment confirmation
   * POST /api/scheduling/confirmation/send
   */
  router.post('/confirmation/send', async (req: Request, res: Response) => {
    try {
      const request = req.body;
      const result = await schedulingService.sendAppointmentConfirmation(request);
      res.json(result);
    } catch (error) {
      logger.error('Failed to send appointment confirmation', { error });
      res.status(500).json({
        success: false,
        message: 'Internal server error sending confirmation'
      });
    }
  });

  /**
   * Lookup confirmation by number
   * GET /api/scheduling/confirmation/:confirmationNumber
   */
  router.get('/confirmation/:confirmationNumber', async (req: Request, res: Response) => {
    try {
      const { confirmationNumber } = req.params;
      const result = await schedulingService.lookupConfirmationNumber(confirmationNumber);
      res.json(result);
    } catch (error) {
      logger.error('Failed to lookup confirmation', { error });
      res.status(500).json({
        success: false,
        message: 'Internal server error looking up confirmation'
      });
    }
  });

  /**
   * Schedule reminders for appointment
   * POST /api/scheduling/reminders/schedule/:appointmentId
   */
  router.post('/reminders/schedule/:appointmentId', async (req: Request, res: Response) => {
    try {
      const { appointmentId } = req.params;
      const result = await schedulingService.scheduleAppointmentReminders(appointmentId);
      res.json(result);
    } catch (error) {
      logger.error('Failed to schedule reminders', { error });
      res.status(500).json({
        success: false,
        message: 'Internal server error scheduling reminders'
      });
    }
  });

  /**
   * Cancel reminders for appointment
   * DELETE /api/scheduling/reminders/:appointmentId
   */
  router.delete('/reminders/:appointmentId', async (req: Request, res: Response) => {
    try {
      const { appointmentId } = req.params;
      const result = await schedulingService.cancelAppointmentReminders(appointmentId);
      res.json(result);
    } catch (error) {
      logger.error('Failed to cancel reminders', { error });
      res.status(500).json({
        success: false,
        message: 'Internal server error cancelling reminders'
      });
    }
  });

  /**
   * Process reminder response
   * POST /api/scheduling/reminders/response/:reminderId
   */
  router.post('/reminders/response/:reminderId', async (req: Request, res: Response) => {
    try {
      const { reminderId } = req.params;
      const { responseType, responseContent } = req.body;

      if (!responseType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: responseType'
        });
      }

      if (!['confirmed', 'reschedule_requested', 'cancel_requested', 'question'].includes(responseType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid responseType. Must be one of: confirmed, reschedule_requested, cancel_requested, question'
        });
      }

      const result = await schedulingService.processReminderResponse(
        reminderId,
        responseType,
        responseContent
      );
      res.json(result);
    } catch (error) {
      logger.error('Failed to process reminder response', { error });
      res.status(500).json({
        success: false,
        message: 'Internal server error processing reminder response'
      });
    }
  });

  /**
   * Get confirmation and reminder analytics
   * GET /api/scheduling/analytics/confirmations-reminders
   */
  router.get('/analytics/confirmations-reminders', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      const dateRange = startDate && endDate ? { 
        start: startDate as string, 
        end: endDate as string 
      } : undefined;
      
      const result = await schedulingService.getConfirmationAndReminderAnalytics(dateRange);
      res.json(result);
    } catch (error) {
      logger.error('Failed to get confirmation and reminder analytics', { error });
      res.status(500).json({
        success: false,
        message: 'Internal server error getting analytics'
      });
    }
  });

  return router;
}