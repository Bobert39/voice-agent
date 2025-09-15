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
  CancellationRequest 
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export function createSchedulingRoutes(schedulingService: SchedulingService): Router {
  const router = Router();

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

  return router;
}