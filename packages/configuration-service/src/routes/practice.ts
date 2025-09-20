import express, { Request, Response } from 'express';
import { z } from 'zod';
import ConfigurationService from '../services/configurationService';
import { PracticeHours, StaffSchedule } from '../models/configuration.models';
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

// Practice Hours Schema
const PracticeHoursSchema = z.object({
  monday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  tuesday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  wednesday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  thursday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  friday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  saturday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  sunday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  timezone: z.string(),
  holidays: z.array(z.object({
    date: z.string(),
    name: z.string(),
    is_closed: z.boolean().default(true),
  })).optional(),
});

// Staff Schedule Schema
const StaffScheduleSchema = z.object({
  staff_id: z.string(),
  staff_name: z.string(),
  role: z.string(),
  weekly_schedule: z.object({
    monday: z.object({ start: z.string(), end: z.string() }).optional(),
    tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
    wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
    thursday: z.object({ start: z.string(), end: z.string() }).optional(),
    friday: z.object({ start: z.string(), end: z.string() }).optional(),
    saturday: z.object({ start: z.string(), end: z.string() }).optional(),
    sunday: z.object({ start: z.string(), end: z.string() }).optional(),
  }),
  time_off: z.array(z.object({
    start_date: z.string(),
    end_date: z.string(),
    reason: z.string(),
  })).optional(),
});

// Policy Settings Schema
const PolicySettingsSchema = z.object({
  cancellation_policy: z.object({
    advance_notice_hours: z.number().min(1).max(168),
    fee_amount: z.number().min(0).optional(),
    fee_currency: z.string().default('USD'),
    exceptions: z.array(z.string()).default([]),
  }),
  appointment_policy: z.object({
    max_advance_booking_days: z.number().min(1).max(365),
    reminder_settings: z.object({
      email_enabled: z.boolean().default(true),
      sms_enabled: z.boolean().default(false),
      call_enabled: z.boolean().default(false),
      hours_before: z.array(z.number()).default([24, 1]),
    }),
    no_show_policy: z.object({
      fee_amount: z.number().min(0).optional(),
      max_no_shows: z.number().min(1).max(10).default(3),
      action_after_limit: z.enum(['warning', 'fee', 'restrict_booking']).default('warning'),
    }),
  }),
  privacy_policy: z.object({
    data_retention_months: z.number().min(12).max(84), // 1-7 years
    sharing_permissions: z.object({
      insurance_companies: z.boolean().default(true),
      referral_doctors: z.boolean().default(true),
      marketing_partners: z.boolean().default(false),
    }),
    patient_portal_access: z.boolean().default(true),
  }),
});

/**
 * @route GET /api/practice/hours
 * @desc Get practice hours configuration
 * @access Private
 */
router.get('/hours', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const result = await configService.getConfigurations(
      'practice_settings',
      user.practiceId
    );

    if (result.success && result.data) {
      const hoursConfig = (result.data as any[]).find(
        config => config.setting_key === 'practice_hours'
      );

      if (hoursConfig) {
        res.json({
          success: true,
          data: hoursConfig.setting_value,
          message: 'Practice hours retrieved successfully',
        });
      } else {
        res.status(404).json({
          success: false,
          errors: ['Practice hours not configured'],
          message: 'Practice hours configuration not found',
        });
      }
    } else {
      res.status(400).json(result);
    }

    logger.info('Practice hours retrieval:', {
      userId: user.id,
      practiceId: user.practiceId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error retrieving practice hours:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve practice hours',
    });
  }
});

/**
 * @route POST /api/practice/hours
 * @desc Update practice hours configuration
 * @access Private
 */
router.post('/hours', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = PracticeHoursSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid practice hours data',
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

    const requestData = {
      type: 'practice_settings' as const,
      data: {
        practice_id: user.practiceId,
        setting_key: 'practice_hours',
        setting_value: validation.data,
        created_by: user.id,
        updated_by: user.id,
      },
      requires_approval: req.body.requires_approval || false,
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(result);

    logger.info('Practice hours update:', {
      userId: user.id,
      practiceId: user.practiceId,
      success: result.success,
      approvalRequired: result.approval_required,
    });
  } catch (error) {
    logger.error('Error updating practice hours:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to update practice hours',
    });
  }
});

/**
 * @route GET /api/practice/staff
 * @desc Get staff schedules
 * @access Private
 */
router.get('/staff', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const result = await configService.getConfigurations(
      'practice_settings',
      user.practiceId
    );

    if (result.success && result.data) {
      const staffConfigs = (result.data as any[]).filter(
        config => config.setting_key === 'staff_schedule'
      );

      res.json({
        success: true,
        data: staffConfigs.map(config => config.setting_value),
        message: 'Staff schedules retrieved successfully',
      });
    } else {
      res.status(400).json(result);
    }

    logger.info('Staff schedules retrieval:', {
      userId: user.id,
      practiceId: user.practiceId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error retrieving staff schedules:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve staff schedules',
    });
  }
});

/**
 * @route POST /api/practice/staff
 * @desc Create or update staff schedule
 * @access Private
 */
router.post('/staff', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = StaffScheduleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid staff schedule data',
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

    const requestData = {
      type: 'practice_settings' as const,
      data: {
        practice_id: user.practiceId,
        setting_key: 'staff_schedule',
        setting_value: validation.data,
        created_by: user.id,
        updated_by: user.id,
      },
      requires_approval: req.body.requires_approval || false,
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(result);

    logger.info('Staff schedule update:', {
      userId: user.id,
      practiceId: user.practiceId,
      staffId: validation.data.staff_id,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error updating staff schedule:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to update staff schedule',
    });
  }
});

/**
 * @route GET /api/practice/policies
 * @desc Get practice policies
 * @access Private
 */
router.get('/policies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const result = await configService.getConfigurations(
      'practice_settings',
      user.practiceId
    );

    if (result.success && result.data) {
      const policiesConfig = (result.data as any[]).find(
        config => config.setting_key === 'practice_policies'
      );

      if (policiesConfig) {
        res.json({
          success: true,
          data: policiesConfig.setting_value,
          message: 'Practice policies retrieved successfully',
        });
      } else {
        res.status(404).json({
          success: false,
          errors: ['Practice policies not configured'],
          message: 'Practice policies configuration not found',
        });
      }
    } else {
      res.status(400).json(result);
    }

    logger.info('Practice policies retrieval:', {
      userId: user.id,
      practiceId: user.practiceId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error retrieving practice policies:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve practice policies',
    });
  }
});

/**
 * @route POST /api/practice/policies
 * @desc Update practice policies
 * @access Private
 */
router.post('/policies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = PolicySettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid practice policies data',
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

    const requestData = {
      type: 'practice_settings' as const,
      data: {
        practice_id: user.practiceId,
        setting_key: 'practice_policies',
        setting_value: validation.data,
        created_by: user.id,
        updated_by: user.id,
      },
      requires_approval: req.body.requires_approval || true, // Policies usually require approval
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(result);

    logger.info('Practice policies update:', {
      userId: user.id,
      practiceId: user.practiceId,
      success: result.success,
      approvalRequired: result.approval_required,
    });
  } catch (error) {
    logger.error('Error updating practice policies:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to update practice policies',
    });
  }
});

/**
 * @route POST /api/practice/holidays
 * @desc Add special holiday hours
 * @access Private
 */
router.post('/holidays', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const holidaySchema = z.object({
      date: z.string(),
      name: z.string(),
      is_closed: z.boolean().default(true),
      special_hours: z.object({
        open: z.string(),
        close: z.string(),
      }).optional(),
    });

    const validation = holidaySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid holiday data',
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

    const requestData = {
      type: 'practice_settings' as const,
      data: {
        practice_id: user.practiceId,
        setting_key: 'special_hours',
        setting_value: validation.data,
        created_by: user.id,
        updated_by: user.id,
      },
      requires_approval: req.body.requires_approval || false,
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(result);

    logger.info('Holiday hours update:', {
      userId: user.id,
      practiceId: user.practiceId,
      holidayDate: validation.data.date,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error adding holiday hours:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to add holiday hours',
    });
  }
});

export default router;