/**
 * Appointment Reminder Service
 * 
 * Handles automated appointment reminders with configurable timing,
 * weather integration, and two-way patient interaction
 */

import { Redis } from 'ioredis';
import { logger } from '@voice-agent/shared-utils';
import {
  AppointmentReminder,
  ReminderConfiguration,
  ReminderTiming,
  ReminderContent,
  ReminderResponse,
  AppointmentSummary,
  PatientCommunicationPreferences,
  WeatherData,
  AppointmentDetails,
  PreparationInstruction
} from '../types';

export class AppointmentReminderService {
  private redis: Redis;
  private reminderConfig: ReminderConfiguration;
  private activeReminders: Map<string, NodeJS.Timeout>;

  constructor(redis: Redis, reminderConfig: ReminderConfiguration) {
    this.redis = redis;
    this.reminderConfig = reminderConfig;
    this.activeReminders = new Map();
  }

  /**
   * Schedule reminders for a newly booked appointment
   */
  async scheduleReminders(
    appointmentDetails: AppointmentDetails,
    patientPreferences?: PatientCommunicationPreferences
  ): Promise<{ success: boolean; scheduledReminders: AppointmentReminder[]; message: string }> {
    
    try {
      const scheduledReminders: AppointmentReminder[] = [];
      
      // Get applicable reminder timings for this appointment type
      const timings = this.getApplicableTimings(appointmentDetails.type as any);
      
      // Filter by patient preferences for delivery methods
      const preferredMethods = patientPreferences?.preferredMethods || ['sms', 'voice'];
      
      for (const timing of timings) {
        // Find common delivery methods between timing and patient preferences
        const commonMethods = timing.deliveryMethods.filter(method => 
          preferredMethods.includes(method)
        );
        
        if (commonMethods.length === 0) continue;
        
        // Calculate reminder time
        const appointmentTime = new Date(appointmentDetails.datetime);
        const reminderTime = new Date(appointmentTime.getTime() - (timing.offsetHours * 60 * 60 * 1000));
        
        // Don't schedule reminders in the past
        if (reminderTime <= new Date()) continue;
        
        // Create reminder for each method
        for (const method of commonMethods) {
          const reminder = await this.createReminder(
            appointmentDetails,
            timing,
            method,
            reminderTime,
            patientPreferences
          );
          
          scheduledReminders.push(reminder);
          
          // Schedule the reminder
          await this.scheduleReminderDelivery(reminder);
        }
      }

      // Store scheduled reminders
      for (const reminder of scheduledReminders) {
        await this.storeReminder(reminder);
      }

      logger.info('Scheduled appointment reminders', {
        appointmentId: appointmentDetails.id,
        patientId: appointmentDetails.patientId,
        reminderCount: scheduledReminders.length
      });

      return {
        success: true,
        scheduledReminders,
        message: `I've scheduled ${scheduledReminders.length} reminder${scheduledReminders.length !== 1 ? 's' : ''} for your appointment.`
      };

    } catch (error) {
      logger.error('Failed to schedule reminders', { error, appointmentDetails });
      return {
        success: false,
        scheduledReminders: [],
        message: "I wasn't able to schedule reminders for your appointment, but your appointment is still confirmed."
      };
    }
  }

  /**
   * Cancel all reminders for an appointment
   */
  async cancelReminders(appointmentId: string): Promise<{ success: boolean; cancelledCount: number }> {
    try {
      const reminders = await this.getAppointmentReminders(appointmentId);
      let cancelledCount = 0;

      for (const reminder of reminders) {
        if (reminder.status === 'scheduled') {
          // Cancel the scheduled delivery
          const timeoutId = this.activeReminders.get(reminder.id);
          if (timeoutId) {
            clearTimeout(timeoutId);
            this.activeReminders.delete(reminder.id);
          }

          // Update reminder status
          reminder.status = 'cancelled';
          await this.storeReminder(reminder);
          cancelledCount++;
        }
      }

      logger.info('Cancelled appointment reminders', { appointmentId, cancelledCount });
      
      return { success: true, cancelledCount };

    } catch (error) {
      logger.error('Failed to cancel reminders', { error, appointmentId });
      return { success: false, cancelledCount: 0 };
    }
  }

  /**
   * Process reminder response from patient
   */
  async processReminderResponse(
    reminderId: string,
    responseType: 'confirmed' | 'reschedule_requested' | 'cancel_requested' | 'question',
    responseContent?: string
  ): Promise<{ success: boolean; nextAction: string; staffNotificationSent: boolean }> {
    
    try {
      const reminder = await this.getReminder(reminderId);
      if (!reminder) {
        return {
          success: false,
          nextAction: 'ignore',
          staffNotificationSent: false
        };
      }

      // Create response record
      const response: ReminderResponse = {
        timestamp: new Date().toISOString(),
        responseType,
        responseContent,
        processed: false,
        staffNotificationSent: false
      };

      // Update reminder
      reminder.response = response;
      reminder.status = 'responded';
      await this.storeReminder(reminder);

      // Determine next action based on response type
      let nextAction = 'none';
      let staffNotificationSent = false;

      switch (responseType) {
        case 'confirmed':
          nextAction = 'none';
          response.processed = true;
          break;

        case 'reschedule_requested':
          nextAction = 'transfer_to_scheduling';
          staffNotificationSent = await this.sendStaffNotification(reminder, 'reschedule_request');
          break;

        case 'cancel_requested':
          nextAction = 'transfer_to_cancellation';
          staffNotificationSent = await this.sendStaffNotification(reminder, 'cancellation_request');
          break;

        case 'question':
          nextAction = 'transfer_to_staff';
          staffNotificationSent = await this.sendStaffNotification(reminder, 'patient_question');
          break;
      }

      // Update response processing status
      response.processed = true;
      response.staffNotificationSent = staffNotificationSent;
      await this.storeReminder(reminder);

      // Log analytics
      await this.logReminderResponse(reminder, response);

      return {
        success: true,
        nextAction,
        staffNotificationSent
      };

    } catch (error) {
      logger.error('Failed to process reminder response', { error, reminderId, responseType });
      return {
        success: false,
        nextAction: 'transfer_to_staff',
        staffNotificationSent: false
      };
    }
  }

  /**
   * Get reminder analytics
   */
  async getReminderAnalytics(dateRange?: { start: string; end: string }): Promise<any> {
    try {
      const analyticsKey = 'analytics:reminders';
      const rawData = await this.redis.lrange(analyticsKey, 0, -1);
      
      const data = rawData.map(item => JSON.parse(item))
        .filter(item => {
          if (!dateRange) return true;
          const itemDate = new Date(item.timestamp);
          return itemDate >= new Date(dateRange.start) && itemDate <= new Date(dateRange.end);
        });

      // Calculate analytics
      const totalReminders = data.length;
      const responded = data.filter(d => d.responded).length;
      const responseRate = totalReminders > 0 ? (responded / totalReminders) * 100 : 0;
      
      const methodEffectiveness = {};
      const timingEffectiveness = {};
      
      for (const item of data) {
        // Method effectiveness
        if (!methodEffectiveness[item.deliveryMethod]) {
          methodEffectiveness[item.deliveryMethod] = { sent: 0, responded: 0 };
        }
        methodEffectiveness[item.deliveryMethod].sent++;
        if (item.responded) {
          methodEffectiveness[item.deliveryMethod].responded++;
        }

        // Timing effectiveness
        const timingKey = `${item.offsetHours}h`;
        if (!timingEffectiveness[timingKey]) {
          timingEffectiveness[timingKey] = { sent: 0, responded: 0 };
        }
        timingEffectiveness[timingKey].sent++;
        if (item.responded) {
          timingEffectiveness[timingKey].responded++;
        }
      }

      return {
        totalReminders,
        responseRate: Math.round(responseRate * 100) / 100,
        methodEffectiveness,
        timingEffectiveness,
        attendanceImpact: {
          // This would be calculated by correlating with actual attendance data
          withReminders: 85, // Placeholder
          withoutReminders: 72 // Placeholder
        }
      };

    } catch (error) {
      logger.error('Failed to get reminder analytics', { error });
      return {
        totalReminders: 0,
        responseRate: 0,
        methodEffectiveness: {},
        timingEffectiveness: {},
        attendanceImpact: { withReminders: 0, withoutReminders: 0 }
      };
    }
  }

  /**
   * Create a reminder object
   */
  private async createReminder(
    appointmentDetails: AppointmentDetails,
    timing: ReminderTiming,
    deliveryMethod: 'voice' | 'sms' | 'email',
    scheduledFor: Date,
    patientPreferences?: PatientCommunicationPreferences
  ): Promise<AppointmentReminder> {
    
    const reminderId = `reminder:${appointmentDetails.id}:${timing.offsetHours}:${deliveryMethod}:${Date.now()}`;
    
    // Get weather data if near appointment time and enabled
    let weatherData: WeatherData | undefined;
    if (this.reminderConfig.weatherIntegration && timing.offsetHours <= 24) {
      weatherData = await this.getWeatherForecast(appointmentDetails.datetime);
    }

    // Generate reminder content
    const content = await this.generateReminderContent(
      appointmentDetails,
      timing,
      deliveryMethod,
      weatherData,
      patientPreferences
    );

    return {
      id: reminderId,
      appointmentId: appointmentDetails.id,
      patientId: appointmentDetails.patientId,
      scheduledFor: scheduledFor.toISOString(),
      reminderType: this.determineReminderType(timing.offsetHours),
      offsetHours: timing.offsetHours,
      deliveryMethod,
      content,
      status: 'scheduled',
      retryCount: 0,
      maxRetries: 2,
      weatherData
    };
  }

  /**
   * Generate reminder content based on appointment and preferences
   */
  private async generateReminderContent(
    appointmentDetails: AppointmentDetails,
    timing: ReminderTiming,
    deliveryMethod: 'voice' | 'sms' | 'email',
    weatherData?: WeatherData,
    patientPreferences?: PatientCommunicationPreferences
  ): Promise<ReminderContent> {
    
    const appointmentDate = new Date(appointmentDetails.datetime);

    // Create appointment summary
    const appointmentSummary: AppointmentSummary = {
      date: appointmentDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: appointmentDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }),
      provider: appointmentDetails.practitionerName,
      type: appointmentDetails.type,
      duration: appointmentDetails.duration,
      location: {
        name: 'Capitol Eye Care',
        address: '123 Main St, Anytown, ST 12345',
        directions: 'Located in the medical complex on Main Street',
        parkingInstructions: 'Free parking available in front of building',
        accessibilityNotes: 'Wheelchair accessible entrance on the east side'
      },
      confirmationNumber: appointmentDetails.confirmationNumber
    };

    // Generate time-specific subject and message
    let subject = '';
    let message = '';
    
    if (timing.offsetHours >= 24) {
      subject = `Appointment Reminder - Tomorrow at ${appointmentSummary.time}`;
      message = `Hello! This is a friendly reminder that you have an appointment tomorrow, ${appointmentSummary.date}, at ${appointmentSummary.time} with ${appointmentSummary.provider} at Capitol Eye Care.`;
    } else if (timing.offsetHours >= 2) {
      subject = `Appointment Reminder - Today at ${appointmentSummary.time}`;
      message = `Hello! This is a reminder that you have an appointment today at ${appointmentSummary.time} with ${appointmentSummary.provider} at Capitol Eye Care.`;
    } else {
      subject = `Appointment Reminder - Soon at ${appointmentSummary.time}`;
      message = `Hello! Just a gentle reminder that your appointment with ${appointmentSummary.provider} is coming up soon at ${appointmentSummary.time}.`;
    }

    // Add weather information if available
    if (weatherData) {
      if (weatherData.precipitation > 50) {
        message += ` Please note that rain is expected today, so you may want to allow extra travel time and bring an umbrella.`;
      } else if (weatherData.temperature < 32) {
        message += ` It will be quite cold today, so please dress warmly and be careful of icy conditions.`;
      }
    }

    // Add confirmation request for two-way interaction
    if (this.reminderConfig.twoWayInteraction && deliveryMethod === 'sms') {
      message += ` Please reply 'YES' to confirm you'll be there, or 'HELP' if you need to make changes.`;
    }

    // Get preparation instructions
    const preparationInstructions = await this.getPreparationInstructions(
      appointmentDetails.type,
      timing.offsetHours
    );

    return {
      subject,
      message,
      appointmentDetails: appointmentSummary,
      preparationInstructions,
      actionRequired: this.reminderConfig.twoWayInteraction,
      confirmationRequired: timing.offsetHours <= 2
    };
  }

  /**
   * Schedule reminder delivery
   */
  private async scheduleReminderDelivery(reminder: AppointmentReminder): Promise<void> {
    const now = new Date();
    const scheduledTime = new Date(reminder.scheduledFor);
    const delay = scheduledTime.getTime() - now.getTime();

    if (delay <= 0) {
      // Send immediately if scheduled time has passed
      await this.deliverReminder(reminder);
    } else {
      // Schedule for later
      const timeoutId = setTimeout(async () => {
        await this.deliverReminder(reminder);
        this.activeReminders.delete(reminder.id);
      }, delay);

      this.activeReminders.set(reminder.id, timeoutId);
    }
  }

  /**
   * Deliver reminder via specified method
   */
  private async deliverReminder(reminder: AppointmentReminder): Promise<void> {
    try {
      let delivered = false;

      switch (reminder.deliveryMethod) {
        case 'voice':
          delivered = await this.deliverVoiceReminder(reminder);
          break;
        case 'sms':
          delivered = await this.deliverSMSReminder(reminder);
          break;
        case 'email':
          delivered = await this.deliverEmailReminder(reminder);
          break;
      }

      // Update reminder status
      reminder.actualSentAt = new Date().toISOString();
      reminder.status = delivered ? 'delivered' : 'failed';
      
      if (!delivered) {
        reminder.retryCount++;
        
        // Schedule retry if under max retries
        if (reminder.retryCount < reminder.maxRetries) {
          reminder.status = 'scheduled';
          setTimeout(async () => {
            await this.deliverReminder(reminder);
          }, 30 * 60 * 1000); // Retry after 30 minutes
        }
      }

      await this.storeReminder(reminder);

      // Log analytics
      await this.logReminderDelivery(reminder, delivered);

    } catch (error) {
      logger.error('Failed to deliver reminder', { error, reminderId: reminder.id });
      reminder.status = 'failed';
      await this.storeReminder(reminder);
    }
  }

  /**
   * Deliver voice reminder (would integrate with voice service)
   */
  private async deliverVoiceReminder(reminder: AppointmentReminder): Promise<boolean> {
    // This would integrate with the voice service to make an automated call
    logger.info('Voice reminder would be delivered', {
      reminderId: reminder.id,
      appointmentId: reminder.appointmentId,
      scheduledFor: reminder.scheduledFor
    });

    // Simulate voice delivery
    return Math.random() > 0.1; // 90% success rate
  }

  /**
   * Deliver SMS reminder
   */
  private async deliverSMSReminder(reminder: AppointmentReminder): Promise<boolean> {
    // This would integrate with SMS service
    logger.info('SMS reminder would be delivered', {
      reminderId: reminder.id,
      appointmentId: reminder.appointmentId,
      messageLength: reminder.content.message.length
    });

    // Simulate SMS delivery
    return Math.random() > 0.05; // 95% success rate
  }

  /**
   * Deliver email reminder
   */
  private async deliverEmailReminder(reminder: AppointmentReminder): Promise<boolean> {
    // This would integrate with email service
    logger.info('Email reminder would be delivered', {
      reminderId: reminder.id,
      appointmentId: reminder.appointmentId,
      subject: reminder.content.subject
    });

    // Simulate email delivery
    return Math.random() > 0.03; // 97% success rate
  }

  /**
   * Get applicable reminder timings for appointment type
   */
  private getApplicableTimings(appointmentType: 'routine' | 'follow-up' | 'urgent'): ReminderTiming[] {
    return this.reminderConfig.timingOptions.filter(timing => 
      timing.appointmentTypes.includes(appointmentType)
    );
  }

  /**
   * Determine reminder type based on offset hours
   */
  private determineReminderType(offsetHours: number): 'initial' | 'follow_up' | 'final' {
    if (offsetHours >= 24) return 'initial';
    if (offsetHours >= 2) return 'follow_up';
    return 'final';
  }

  /**
   * Get weather forecast for appointment date
   */
  private async getWeatherForecast(appointmentDateTime: string): Promise<WeatherData | undefined> {
    try {
      // This would integrate with a weather API
      // For now, return mock data
      return {
        condition: 'partly_cloudy',
        temperature: 72,
        precipitation: 20,
        advisory: undefined
      };
    } catch (error) {
      logger.error('Failed to get weather forecast', { error, appointmentDateTime });
      return undefined;
    }
  }

  /**
   * Get preparation instructions based on appointment type and timing
   */
  private async getPreparationInstructions(
    appointmentType: string,
    offsetHours: number
  ): Promise<PreparationInstruction[]> {
    
    const instructions: PreparationInstruction[] = [];

    // Only include preparation instructions for reminders sent day before or morning of
    if (offsetHours < 24) {
      return instructions;
    }

    // Add type-specific instructions
    switch (appointmentType.toLowerCase()) {
      case 'routine':
        instructions.push({
          type: 'documents',
          title: 'What to Bring',
          description: 'Please remember to bring your insurance card and a list of your current medications.',
          mandatory: true
        });
        break;

      case 'follow-up':
        instructions.push({
          type: 'documents',
          title: 'What to Bring',
          description: 'Please bring your current glasses and any eye medications.',
          mandatory: true
        });
        break;
    }

    return instructions;
  }

  /**
   * Store reminder in Redis
   */
  private async storeReminder(reminder: AppointmentReminder): Promise<void> {
    const key = `reminder:${reminder.id}`;
    await this.redis.setex(key, 86400 * 7, JSON.stringify(reminder)); // Store for 7 days
    
    // Also add to appointment reminders list
    const appointmentKey = `appointment:reminders:${reminder.appointmentId}`;
    await this.redis.sadd(appointmentKey, reminder.id);
    await this.redis.expire(appointmentKey, 86400 * 7);
  }

  /**
   * Get reminder by ID
   */
  private async getReminder(reminderId: string): Promise<AppointmentReminder | null> {
    const key = `reminder:${reminderId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all reminders for an appointment
   */
  private async getAppointmentReminders(appointmentId: string): Promise<AppointmentReminder[]> {
    const appointmentKey = `appointment:reminders:${appointmentId}`;
    const reminderIds = await this.redis.smembers(appointmentKey);
    
    const reminders: AppointmentReminder[] = [];
    for (const id of reminderIds) {
      const reminder = await this.getReminder(id);
      if (reminder) {
        reminders.push(reminder);
      }
    }
    
    return reminders;
  }

  /**
   * Send staff notification for reminder responses
   */
  private async sendStaffNotification(reminder: AppointmentReminder, type: string): Promise<boolean> {
    try {
      // This would integrate with the staff notification service
      logger.info('Staff notification would be sent', {
        type,
        reminderId: reminder.id,
        appointmentId: reminder.appointmentId,
        responseType: reminder.response?.responseType
      });

      return true; // Simulate successful notification
    } catch (error) {
      logger.error('Failed to send staff notification', { error, reminder, type });
      return false;
    }
  }

  /**
   * Log reminder delivery analytics
   */
  private async logReminderDelivery(reminder: AppointmentReminder, delivered: boolean): Promise<void> {
    const analyticsKey = 'analytics:reminders';
    const analyticsData = {
      timestamp: new Date().toISOString(),
      reminderId: reminder.id,
      appointmentId: reminder.appointmentId,
      patientId: reminder.patientId,
      deliveryMethod: reminder.deliveryMethod,
      offsetHours: reminder.offsetHours,
      delivered,
      retryCount: reminder.retryCount,
      weatherIncluded: !!reminder.weatherData,
    };
    
    await this.redis.lpush(analyticsKey, JSON.stringify(analyticsData));
    await this.redis.ltrim(analyticsKey, 0, 999);
  }

  /**
   * Log reminder response analytics
   */
  private async logReminderResponse(reminder: AppointmentReminder, response: ReminderResponse): Promise<void> {
    const analyticsKey = 'analytics:reminder_responses';
    const analyticsData = {
      timestamp: response.timestamp,
      reminderId: reminder.id,
      appointmentId: reminder.appointmentId,
      patientId: reminder.patientId,
      deliveryMethod: reminder.deliveryMethod,
      offsetHours: reminder.offsetHours,
      responseType: response.responseType,
      responded: true,
      staffNotificationSent: response.staffNotificationSent
    };
    
    await this.redis.lpush(analyticsKey, JSON.stringify(analyticsData));
    await this.redis.ltrim(analyticsKey, 0, 999);
  }
}