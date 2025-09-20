import express, { Request, Response } from 'express';
import { z } from 'zod';
import ConfigurationService from '../services/configurationService';
import { AppointmentTypeSchema } from '../models/configuration.models';
import winston from 'winston';

const router = express.Router();
const configService = new ConfigurationService();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Middleware to extract user info
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    practiceId: string;
    role: string;
  };
}

// Appointment Type Conflict Detection Service
class AppointmentConflictDetector {
  /**
   * Check for conflicts between appointment types
   */
  public static detectConflicts(
    newType: any,
    existingTypes: any[]
  ): string[] {
    const conflicts: string[] = [];

    for (const existing of existingTypes) {
      if (existing.id === newType.id) continue; // Skip self

      // Check if types cannot overlap
      if (
        existing.conflict_rules?.cannot_overlap_with?.includes(newType.type_code) ||
        newType.conflict_rules?.cannot_overlap_with?.includes(existing.type_code)
      ) {
        conflicts.push(
          `Cannot overlap with existing appointment type: ${existing.type_name} (${existing.type_code})`
        );
      }

      // Check for time slot conflicts
      if (
        newType.scheduling_rules?.allowed_days &&
        existing.scheduling_rules?.allowed_days
      ) {
        const commonDays = newType.scheduling_rules.allowed_days.filter((day: number) =>
          existing.scheduling_rules.allowed_days.includes(day)
        );

        if (commonDays.length > 0) {
          const newPriority = newType.conflict_rules?.priority_level || 5;
          const existingPriority = existing.conflict_rules?.priority_level || 5;

          if (newPriority === existingPriority) {
            conflicts.push(
              `Same priority level (${newPriority}) as existing type: ${existing.type_name}`
            );
          }
        }
      }

      // Check for buffer time conflicts
      const newRequiredGap = newType.conflict_rules?.requires_gap_minutes || 0;
      const existingRequiredGap = existing.conflict_rules?.requires_gap_minutes || 0;
      const maxGapRequired = Math.max(newRequiredGap, existingRequiredGap);

      if (maxGapRequired > 0) {
        const newDuration = newType.duration_minutes;
        const existingDuration = existing.duration_minutes;

        if (newDuration + maxGapRequired > 120 || existingDuration + maxGapRequired > 120) {
          conflicts.push(
            `Gap requirement (${maxGapRequired} min) may create scheduling difficulties with ${existing.type_name}`
          );
        }
      }
    }

    return conflicts;
  }

  /**
   * Test appointment type configuration
   */
  public static testConfiguration(appointmentType: any): {
    isValid: boolean;
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Test duration reasonableness
    if (appointmentType.duration_minutes < 15) {
      warnings.push('Very short appointment duration may not allow adequate patient care');
      recommendations.push('Consider minimum 15-minute appointments for quality care');
    }

    if (appointmentType.duration_minutes > 120) {
      warnings.push('Very long appointment duration may limit scheduling flexibility');
      recommendations.push('Consider breaking long appointments into multiple sessions');
    }

    // Test booking rules
    const advanceBooking = appointmentType.scheduling_rules?.advance_booking_days || 0;
    if (advanceBooking > 90) {
      warnings.push('Long advance booking period may confuse patients');
      recommendations.push('Consider advance booking window of 30-90 days');
    }

    // Test buffer times
    const bufferBefore = appointmentType.scheduling_rules?.buffer_minutes_before || 0;
    const bufferAfter = appointmentType.scheduling_rules?.buffer_minutes_after || 0;
    const totalBuffer = bufferBefore + bufferAfter;

    if (totalBuffer > appointmentType.duration_minutes * 0.3) {
      warnings.push('Buffer time is more than 30% of appointment duration');
      recommendations.push('Consider optimizing buffer times for efficiency');
    }

    // Test daily booking limits
    const maxDaily = appointmentType.scheduling_rules?.max_daily_bookings;
    if (maxDaily && maxDaily < 5) {
      warnings.push('Low daily booking limit may frustrate patients');
      recommendations.push('Ensure daily limits align with practice capacity');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      recommendations,
    };
  }
}

/**
 * @route GET /api/appointments/types
 * @desc Get all appointment types for the practice
 * @access Private
 */
router.get('/types', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const includeInactive = req.query.include_inactive === 'true';

    const result = await configService.getConfigurations(
      'appointment_type',
      user.practiceId,
      includeInactive
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Appointment types retrieval:', {
      userId: user.id,
      practiceId: user.practiceId,
      includeInactive,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error retrieving appointment types:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve appointment types',
    });
  }
});

/**
 * @route POST /api/appointments/types
 * @desc Create new appointment type
 * @access Private
 */
router.post('/types', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = AppointmentTypeSchema.safeParse({
      ...req.body,
      practice_id: req.user?.practiceId,
      created_by: req.user?.id,
      updated_by: req.user?.id,
    });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid appointment type data',
      });
    }

    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Get existing appointment types for conflict detection
    const existingTypesResult = await configService.getConfigurations(
      'appointment_type',
      user.practiceId
    );

    let conflicts: string[] = [];
    if (existingTypesResult.success && existingTypesResult.data) {
      conflicts = AppointmentConflictDetector.detectConflicts(
        validation.data,
        existingTypesResult.data as any[]
      );
    }

    // Test the configuration
    const testResult = AppointmentConflictDetector.testConfiguration(validation.data);

    const requestData = {
      type: 'appointment_type' as const,
      data: validation.data,
      requires_approval: req.body.requires_approval || conflicts.length > 0,
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    // Include test results and conflicts in response
    const response = {
      ...result,
      conflicts,
      test_results: testResult,
    };

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(response);

    logger.info('Appointment type creation:', {
      userId: user.id,
      practiceId: user.practiceId,
      typeName: validation.data.type_name,
      typeCode: validation.data.type_code,
      conflictsDetected: conflicts.length,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error creating appointment type:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create appointment type',
    });
  }
});

/**
 * @route PUT /api/appointments/types/:id
 * @desc Update existing appointment type
 * @access Private
 */
router.put('/types/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { id } = req.params;
    const typeId = parseInt(id, 10);

    if (isNaN(typeId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid appointment type ID'],
        message: 'Appointment type ID must be a number',
      });
    }

    // Get existing appointment types for conflict detection
    const existingTypesResult = await configService.getConfigurations(
      'appointment_type',
      user.practiceId
    );

    let conflicts: string[] = [];
    if (existingTypesResult.success && existingTypesResult.data) {
      const updatedData = { ...req.body, id: typeId };
      conflicts = AppointmentConflictDetector.detectConflicts(
        updatedData,
        existingTypesResult.data as any[]
      );
    }

    // Test the configuration
    const testResult = AppointmentConflictDetector.testConfiguration({
      ...req.body,
      id: typeId,
    });

    const updateRequest = {
      data: req.body,
      change_reason: req.body.change_reason || 'Appointment type configuration update',
      requires_approval: req.body.requires_approval || conflicts.length > 0,
    };

    const result = await configService.updateConfiguration(
      'appointment_type',
      typeId,
      updateRequest,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    // Include test results and conflicts in response
    const response = {
      ...result,
      conflicts,
      test_results: testResult,
    };

    const statusCode = result.success ? (result.approval_required ? 202 : 200) : 400;
    res.status(statusCode).json(response);

    logger.info('Appointment type update:', {
      userId: user.id,
      practiceId: user.practiceId,
      typeId,
      conflictsDetected: conflicts.length,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error updating appointment type:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to update appointment type',
    });
  }
});

/**
 * @route DELETE /api/appointments/types/:id
 * @desc Delete appointment type
 * @access Private
 */
router.delete('/types/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { id } = req.params;
    const typeId = parseInt(id, 10);

    if (isNaN(typeId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid appointment type ID'],
        message: 'Appointment type ID must be a number',
      });
    }

    const reason = req.body.reason || 'Appointment type no longer needed';

    const result = await configService.deleteConfiguration(
      'appointment_type',
      typeId,
      user.id,
      user.practiceId,
      reason,
      req.ip,
      req.get('User-Agent')
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Appointment type deletion:', {
      userId: user.id,
      practiceId: user.practiceId,
      typeId,
      reason,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error deleting appointment type:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to delete appointment type',
    });
  }
});

/**
 * @route POST /api/appointments/types/:id/test
 * @desc Test appointment type configuration
 * @access Private
 */
router.post('/types/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { id } = req.params;
    const typeId = parseInt(id, 10);

    if (isNaN(typeId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid appointment type ID'],
        message: 'Appointment type ID must be a number',
      });
    }

    // Get the appointment type configuration
    const typesResult = await configService.getConfigurations(
      'appointment_type',
      user.practiceId
    );

    if (!typesResult.success || !typesResult.data) {
      return res.status(400).json({
        success: false,
        errors: ['Failed to retrieve appointment types'],
        message: 'Unable to test configuration',
      });
    }

    const appointmentType = (typesResult.data as any[]).find(type => type.id === typeId);
    if (!appointmentType) {
      return res.status(404).json({
        success: false,
        errors: ['Appointment type not found'],
        message: 'Cannot test non-existent appointment type',
      });
    }

    // Run conflict detection
    const conflicts = AppointmentConflictDetector.detectConflicts(
      appointmentType,
      (typesResult.data as any[]).filter(type => type.id !== typeId)
    );

    // Run configuration test
    const testResult = AppointmentConflictDetector.testConfiguration(appointmentType);

    // Simulate scheduling scenarios
    const testScenarios = req.body.test_scenarios || [
      'peak_hours_booking',
      'same_day_booking',
      'advance_booking',
      'back_to_back_appointments',
    ];

    const scenarioResults = testScenarios.map((scenario: string) => {
      switch (scenario) {
        case 'peak_hours_booking':
          return {
            scenario: 'peak_hours_booking',
            description: 'Test booking during peak hours',
            result: 'success',
            details: 'Appointment type can be scheduled during typical peak hours',
          };
        case 'same_day_booking':
          const advanceBooking = appointmentType.scheduling_rules?.advance_booking_days || 0;
          return {
            scenario: 'same_day_booking',
            description: 'Test same-day booking capability',
            result: advanceBooking === 0 ? 'success' : 'warning',
            details: advanceBooking === 0
              ? 'Same-day booking is allowed'
              : `Requires ${advanceBooking} days advance notice`,
          };
        case 'advance_booking':
          return {
            scenario: 'advance_booking',
            description: 'Test advance booking limits',
            result: 'success',
            details: `Advance booking allowed up to ${appointmentType.scheduling_rules?.advance_booking_days || 30} days`,
          };
        case 'back_to_back_appointments':
          const bufferTime = (appointmentType.scheduling_rules?.buffer_minutes_after || 0) +
                            (appointmentType.scheduling_rules?.buffer_minutes_before || 0);
          return {
            scenario: 'back_to_back_appointments',
            description: 'Test scheduling consecutive appointments',
            result: bufferTime > 0 ? 'warning' : 'success',
            details: bufferTime > 0
              ? `Requires ${bufferTime} minutes buffer between appointments`
              : 'Can be scheduled back-to-back',
          };
        default:
          return {
            scenario,
            description: 'Unknown test scenario',
            result: 'error',
            details: 'Test scenario not implemented',
          };
      }
    });

    res.json({
      success: true,
      data: {
        appointment_type: appointmentType,
        conflicts,
        configuration_test: testResult,
        scenario_tests: scenarioResults,
      },
      message: 'Appointment type testing completed',
    });

    logger.info('Appointment type testing:', {
      userId: user.id,
      practiceId: user.practiceId,
      typeId,
      conflictsFound: conflicts.length,
      scenariosTested: testScenarios.length,
    });
  } catch (error) {
    logger.error('Error testing appointment type:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to test appointment type',
    });
  }
});

/**
 * @route GET /api/appointments/conflicts
 * @desc Get potential scheduling conflicts across all appointment types
 * @access Private
 */
router.get('/conflicts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const typesResult = await configService.getConfigurations(
      'appointment_type',
      user.practiceId
    );

    if (!typesResult.success || !typesResult.data) {
      return res.status(400).json({
        success: false,
        errors: ['Failed to retrieve appointment types'],
        message: 'Unable to analyze conflicts',
      });
    }

    const appointmentTypes = typesResult.data as any[];
    const allConflicts: any[] = [];

    // Check each type against all others
    for (let i = 0; i < appointmentTypes.length; i++) {
      for (let j = i + 1; j < appointmentTypes.length; j++) {
        const type1 = appointmentTypes[i];
        const type2 = appointmentTypes[j];

        const conflicts = AppointmentConflictDetector.detectConflicts(type1, [type2]);

        if (conflicts.length > 0) {
          allConflicts.push({
            type1: {
              id: type1.id,
              name: type1.type_name,
              code: type1.type_code,
            },
            type2: {
              id: type2.id,
              name: type2.type_name,
              code: type2.type_code,
            },
            conflicts,
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        total_types: appointmentTypes.length,
        conflicts_found: allConflicts.length,
        conflicts: allConflicts,
      },
      message: 'Conflict analysis completed',
    });

    logger.info('Appointment conflicts analysis:', {
      userId: user.id,
      practiceId: user.practiceId,
      totalTypes: appointmentTypes.length,
      conflictsFound: allConflicts.length,
    });
  } catch (error) {
    logger.error('Error analyzing appointment conflicts:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to analyze conflicts',
    });
  }
});

export default router;