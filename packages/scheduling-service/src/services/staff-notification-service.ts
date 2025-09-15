/**
 * Staff Notification Service for Story 3.4
 * 
 * Handles enhanced staff notifications for cancellations with improved categorization,
 * priority handling, and workflow integration. Provides real-time notifications for
 * cancellations requiring staff attention or follow-up.
 */

import { Redis } from 'ioredis';
import { 
  StaffNotification, 
  AppointmentDetails,
  CancellationConfirmation,
  WaitlistEntry 
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export class StaffNotificationService {
  private redis: Redis;
  private webSocketService: any; // TODO: Type this when WebSocket service is available

  constructor(redis: Redis, webSocketService: any) {
    this.redis = redis;
    this.webSocketService = webSocketService;
  }

  /**
   * Create and send staff notification for appointment cancellation
   */
  async notifyStaffOfCancellation(
    appointment: AppointmentDetails,
    confirmation: CancellationConfirmation,
    isEmergency: boolean = false,
    isLateNotice: boolean = false
  ): Promise<StaffNotification> {
    try {
      const notification = this.createCancellationNotification(
        appointment,
        confirmation,
        isEmergency,
        isLateNotice
      );

      // Store notification
      await this.storeStaffNotification(notification);

      // Send real-time notification
      await this.sendRealTimeNotification(notification);

      // Add to appropriate department queues
      await this.addToDepartmentQueue(notification);

      logger.info('Staff notification created for cancellation', {
        notificationId: notification.id,
        appointmentId: appointment.id,
        type: notification.type,
        priority: notification.priority,
        department: notification.department
      });

      return notification;

    } catch (error) {
      logger.error('Failed to notify staff of cancellation', { error, appointment, confirmation });
      throw new Error('Failed to create staff notification');
    }
  }

  /**
   * Create staff notification for waitlist response
   */
  async notifyStaffOfWaitlistResponse(
    waitlistEntry: WaitlistEntry,
    response: 'accepted' | 'declined' | 'no_response',
    availableSlot: any
  ): Promise<StaffNotification> {
    try {
      const notification: StaffNotification = {
        id: this.generateNotificationId(),
        type: 'waitlist_response',
        priority: this.determineWaitlistResponsePriority(response, waitlistEntry),
        title: this.generateWaitlistResponseTitle(response, waitlistEntry),
        message: this.generateWaitlistResponseMessage(response, waitlistEntry, availableSlot),
        waitlistEntryId: waitlistEntry.id,
        patientId: waitlistEntry.patientId,
        requiresAction: response === 'accepted' || response === 'no_response',
        actionType: response === 'accepted' ? 'follow_up' : 'reschedule_assistance',
        createdAt: new Date().toISOString(),
        department: 'reception',
        acknowledged: false,
        resolved: false
      };

      await this.storeStaffNotification(notification);
      await this.sendRealTimeNotification(notification);
      await this.addToDepartmentQueue(notification);

      logger.info('Staff notification created for waitlist response', {
        notificationId: notification.id,
        waitlistEntryId: waitlistEntry.id,
        response,
        priority: notification.priority
      });

      return notification;

    } catch (error) {
      logger.error('Failed to notify staff of waitlist response', { error, waitlistEntry, response });
      throw new Error('Failed to create waitlist response notification');
    }
  }

  /**
   * Acknowledge staff notification
   */
  async acknowledgeNotification(
    notificationId: string,
    staffMemberId: string,
    staffMemberName: string
  ): Promise<boolean> {
    try {
      const notification = await this.getStaffNotification(notificationId);
      if (!notification) {
        logger.warn('Staff notification not found for acknowledgment', { notificationId });
        return false;
      }

      notification.acknowledged = true;
      notification.acknowledgedBy = staffMemberName;
      notification.acknowledgedAt = new Date().toISOString();

      await this.storeStaffNotification(notification);

      // Remove from urgent queue if applicable
      if (notification.priority === 'critical' || notification.priority === 'high') {
        await this.removeFromUrgentQueue(notificationId);
      }

      // Send acknowledgment update via WebSocket
      await this.sendAcknowledgmentUpdate(notification, staffMemberId);

      logger.info('Staff notification acknowledged', {
        notificationId,
        acknowledgedBy: staffMemberName,
        type: notification.type
      });

      return true;

    } catch (error) {
      logger.error('Failed to acknowledge staff notification', { error, notificationId });
      return false;
    }
  }

  /**
   * Resolve staff notification
   */
  async resolveNotification(
    notificationId: string,
    staffMemberId: string,
    staffMemberName: string,
    notes?: string
  ): Promise<boolean> {
    try {
      const notification = await this.getStaffNotification(notificationId);
      if (!notification) {
        logger.warn('Staff notification not found for resolution', { notificationId });
        return false;
      }

      notification.resolved = true;
      notification.resolvedBy = staffMemberName;
      notification.resolvedAt = new Date().toISOString();
      if (notes) {
        notification.notes = notes;
      }

      await this.storeStaffNotification(notification);

      // Remove from all queues
      await this.removeFromAllQueues(notificationId, notification.department!);

      // Send resolution update via WebSocket
      await this.sendResolutionUpdate(notification, staffMemberId);

      logger.info('Staff notification resolved', {
        notificationId,
        resolvedBy: staffMemberName,
        type: notification.type,
        notes: notes?.substring(0, 50)
      });

      return true;

    } catch (error) {
      logger.error('Failed to resolve staff notification', { error, notificationId });
      return false;
    }
  }

  /**
   * Get active notifications for a department
   */
  async getActiveNotifications(
    department?: string,
    priority?: string,
    limit: number = 50
  ): Promise<StaffNotification[]> {
    try {
      let queueKey = 'staff:notifications:active';
      
      if (department) {
        queueKey = `staff:notifications:department:${department}`;
      }
      
      if (priority) {
        queueKey += `:${priority}`;
      }

      const notificationIds = await this.redis.lrange(queueKey, 0, limit - 1);
      const notifications: StaffNotification[] = [];

      for (const id of notificationIds) {
        const notification = await this.getStaffNotification(id);
        if (notification && !notification.resolved) {
          notifications.push(notification);
        }
      }

      return notifications.sort((a, b) => {
        // Sort by priority first, then by creation time
        const priorityOrder = { 'critical': 4, 'high': 3, 'normal': 2, 'low': 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    } catch (error) {
      logger.error('Failed to get active notifications', { error, department, priority });
      return [];
    }
  }

  /**
   * Get notification metrics for dashboard
   */
  async getNotificationMetrics(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalNotifications: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    byDepartment: Record<string, number>;
    averageAcknowledgmentTime: number;
    averageResolutionTime: number;
    unacknowledgedCount: number;
    unresolvedCount: number;
  }> {
    try {
      const timeframeDuration = {
        'hour': 60 * 60 * 1000,
        'day': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000
      };

      const startTime = Date.now() - timeframeDuration[timeframe];
      const metricKey = `staff:metrics:${timeframe}:${Math.floor(Date.now() / timeframeDuration[timeframe])}`;
      
      // Try to get cached metrics first
      const cachedMetrics = await this.redis.get(metricKey);
      if (cachedMetrics) {
        return JSON.parse(cachedMetrics);
      }

      // Calculate metrics from stored notifications
      const notificationIds = await this.redis.zrangebyscore(
        'staff:notifications:timeline',
        startTime,
        Date.now()
      );

      const metrics = {
        totalNotifications: 0,
        byType: {} as Record<string, number>,
        byPriority: {} as Record<string, number>,
        byDepartment: {} as Record<string, number>,
        averageAcknowledgmentTime: 0,
        averageResolutionTime: 0,
        unacknowledgedCount: 0,
        unresolvedCount: 0
      };

      let totalAckTime = 0;
      let totalResTime = 0;
      let ackCount = 0;
      let resCount = 0;

      for (const id of notificationIds) {
        const notification = await this.getStaffNotification(id);
        if (!notification) continue;

        metrics.totalNotifications++;
        
        // By type
        metrics.byType[notification.type] = (metrics.byType[notification.type] || 0) + 1;
        
        // By priority
        metrics.byPriority[notification.priority] = (metrics.byPriority[notification.priority] || 0) + 1;
        
        // By department
        if (notification.department) {
          metrics.byDepartment[notification.department] = (metrics.byDepartment[notification.department] || 0) + 1;
        }

        // Acknowledgment metrics
        if (!notification.acknowledged) {
          metrics.unacknowledgedCount++;
        } else if (notification.acknowledgedAt) {
          const ackTime = new Date(notification.acknowledgedAt).getTime() - new Date(notification.createdAt).getTime();
          totalAckTime += ackTime;
          ackCount++;
        }

        // Resolution metrics
        if (!notification.resolved) {
          metrics.unresolvedCount++;
        } else if (notification.resolvedAt) {
          const resTime = new Date(notification.resolvedAt).getTime() - new Date(notification.createdAt).getTime();
          totalResTime += resTime;
          resCount++;
        }
      }

      metrics.averageAcknowledgmentTime = ackCount > 0 ? Math.round(totalAckTime / ackCount / 1000 / 60) : 0; // minutes
      metrics.averageResolutionTime = resCount > 0 ? Math.round(totalResTime / resCount / 1000 / 60) : 0; // minutes

      // Cache metrics for 5 minutes
      await this.redis.setex(metricKey, 300, JSON.stringify(metrics));

      return metrics;

    } catch (error) {
      logger.error('Failed to get notification metrics', { error, timeframe });
      return {
        totalNotifications: 0,
        byType: {},
        byPriority: {},
        byDepartment: {},
        averageAcknowledgmentTime: 0,
        averageResolutionTime: 0,
        unacknowledgedCount: 0,
        unresolvedCount: 0
      };
    }
  }

  // Private helper methods

  private createCancellationNotification(
    appointment: AppointmentDetails,
    confirmation: CancellationConfirmation,
    isEmergency: boolean,
    isLateNotice: boolean
  ): StaffNotification {
    const priority = this.determineCancellationPriority(appointment, isEmergency, isLateNotice);
    const type = isEmergency ? 'emergency_cancellation' : 
                  isLateNotice ? 'late_cancellation' : 'cancellation';

    return {
      id: this.generateNotificationId(),
      type,
      priority,
      title: this.generateCancellationTitle(appointment, isEmergency, isLateNotice),
      message: this.generateCancellationMessage(appointment, confirmation, isEmergency, isLateNotice),
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      requiresAction: this.requiresStaffAction(appointment, isEmergency, isLateNotice),
      actionType: this.determineActionType(appointment, isEmergency, isLateNotice),
      createdAt: new Date().toISOString(),
      department: this.determineDepartment(appointment, isEmergency, isLateNotice),
      acknowledged: false,
      resolved: false
    };
  }

  private determineCancellationPriority(
    appointment: AppointmentDetails,
    isEmergency: boolean,
    isLateNotice: boolean
  ): 'critical' | 'high' | 'normal' | 'low' {
    if (isEmergency) return 'critical';
    if (isLateNotice && appointment.type === 'urgent') return 'high';
    if (isLateNotice) return 'normal';
    if (appointment.type === 'urgent') return 'normal';
    return 'low';
  }

  private determineWaitlistResponsePriority(
    response: 'accepted' | 'declined' | 'no_response',
    waitlistEntry: WaitlistEntry
  ): 'critical' | 'high' | 'normal' | 'low' {
    if (response === 'accepted' && waitlistEntry.priority === 'urgent') return 'high';
    if (response === 'accepted') return 'normal';
    if (response === 'no_response' && waitlistEntry.priority === 'urgent') return 'normal';
    return 'low';
  }

  private generateCancellationTitle(
    appointment: AppointmentDetails,
    isEmergency: boolean,
    isLateNotice: boolean
  ): string {
    if (isEmergency) return `EMERGENCY: ${appointment.type} appointment cancelled`;
    if (isLateNotice) return `Late cancellation: ${appointment.type} appointment`;
    return `Appointment cancelled: ${appointment.type}`;
  }

  private generateWaitlistResponseTitle(
    response: 'accepted' | 'declined' | 'no_response',
    waitlistEntry: WaitlistEntry
  ): string {
    switch (response) {
      case 'accepted':
        return `Waitlist accepted: ${waitlistEntry.appointmentType} appointment`;
      case 'declined':
        return `Waitlist declined: ${waitlistEntry.appointmentType} appointment`;
      case 'no_response':
        return `No waitlist response: ${waitlistEntry.appointmentType} appointment`;
      default:
        return `Waitlist update: ${waitlistEntry.appointmentType} appointment`;
    }
  }

  private generateCancellationMessage(
    appointment: AppointmentDetails,
    confirmation: CancellationConfirmation,
    isEmergency: boolean,
    isLateNotice: boolean
  ): string {
    const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    let message = `Patient ${appointment.patientName} has cancelled their ${appointment.type} appointment `;
    message += `with ${appointment.practitionerName} on ${formattedDate}. `;
    
    if (isEmergency) {
      message += `This was marked as an EMERGENCY cancellation. `;
      if (confirmation.reason) {
        message += `Reason: ${confirmation.reason}. `;
      }
    } else if (isLateNotice) {
      message += `This is a late notice cancellation. `;
      if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
        message += `Cancellation fee: $${confirmation.cancellationFee}. `;
      }
    }
    
    message += `Reference: ${confirmation.referenceNumber}. `;
    
    if (confirmation.waitlistNotified && confirmation.waitlistNotificationCount > 0) {
      message += `${confirmation.waitlistNotificationCount} waitlisted patients have been notified.`;
    } else {
      message += `No waitlisted patients to notify.`;
    }

    return message;
  }

  private generateWaitlistResponseMessage(
    response: 'accepted' | 'declined' | 'no_response',
    waitlistEntry: WaitlistEntry,
    availableSlot: any
  ): string {
    const slotDate = new Date(availableSlot.datetime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    switch (response) {
      case 'accepted':
        return `Patient ${waitlistEntry.patientName} has ACCEPTED the waitlist offer for ${slotDate}. Please process the appointment booking and confirm with the patient.`;
      
      case 'declined':
        return `Patient ${waitlistEntry.patientName} has declined the waitlist offer for ${slotDate}. The slot remains available for other patients.`;
      
      case 'no_response':
        return `Patient ${waitlistEntry.patientName} has not responded to the waitlist offer for ${slotDate}. The deadline has passed. Consider calling the patient directly.`;
      
      default:
        return `Waitlist update for patient ${waitlistEntry.patientName} regarding ${slotDate} slot.`;
    }
  }

  private requiresStaffAction(
    appointment: AppointmentDetails,
    isEmergency: boolean,
    isLateNotice: boolean
  ): boolean {
    return isEmergency || isLateNotice || appointment.type === 'urgent';
  }

  private determineActionType(
    appointment: AppointmentDetails,
    isEmergency: boolean,
    isLateNotice: boolean
  ): 'follow_up' | 'reschedule_assistance' | 'billing_review' | 'chart_update' | undefined {
    if (isEmergency) return 'follow_up';
    if (isLateNotice) return 'billing_review';
    if (appointment.type === 'urgent') return 'reschedule_assistance';
    return 'chart_update';
  }

  private determineDepartment(
    appointment: AppointmentDetails,
    isEmergency: boolean,
    isLateNotice: boolean
  ): 'reception' | 'medical' | 'billing' | 'management' {
    if (isEmergency) return 'medical';
    if (isLateNotice) return 'billing';
    return 'reception';
  }

  private generateNotificationId(): string {
    return `sn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async storeStaffNotification(notification: StaffNotification): Promise<void> {
    try {
      const key = `staff:notification:${notification.id}`;
      await this.redis.setex(key, 86400 * 30, JSON.stringify(notification)); // 30 days

      // Add to timeline for metrics
      await this.redis.zadd(
        'staff:notifications:timeline',
        new Date(notification.createdAt).getTime(),
        notification.id
      );
    } catch (error) {
      logger.error('Failed to store staff notification', { error, notification });
      throw error;
    }
  }

  private async getStaffNotification(notificationId: string): Promise<StaffNotification | null> {
    try {
      const key = `staff:notification:${notificationId}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get staff notification', { error, notificationId });
      return null;
    }
  }

  private async sendRealTimeNotification(notification: StaffNotification): Promise<void> {
    try {
      // TODO: Integrate with WebSocket service for real-time notifications
      logger.info('Sending real-time staff notification', {
        notificationId: notification.id,
        type: notification.type,
        priority: notification.priority,
        department: notification.department
      });
    } catch (error) {
      logger.error('Failed to send real-time notification', { error, notification });
    }
  }

  private async addToDepartmentQueue(notification: StaffNotification): Promise<void> {
    try {
      const queueKeys = [
        'staff:notifications:active',
        `staff:notifications:department:${notification.department}`,
        `staff:notifications:priority:${notification.priority}`
      ];

      for (const queueKey of queueKeys) {
        await this.redis.lpush(queueKey, notification.id);
        await this.redis.expire(queueKey, 86400 * 30); // 30 days
      }

      // Add to urgent queue if high priority
      if (notification.priority === 'critical' || notification.priority === 'high') {
        await this.redis.lpush('staff:notifications:urgent', notification.id);
        await this.redis.expire('staff:notifications:urgent', 86400 * 7); // 7 days
      }
    } catch (error) {
      logger.error('Failed to add notification to department queue', { error, notification });
    }
  }

  private async removeFromUrgentQueue(notificationId: string): Promise<void> {
    try {
      await this.redis.lrem('staff:notifications:urgent', 0, notificationId);
    } catch (error) {
      logger.error('Failed to remove from urgent queue', { error, notificationId });
    }
  }

  private async removeFromAllQueues(notificationId: string, department: string): Promise<void> {
    try {
      const queueKeys = [
        'staff:notifications:active',
        `staff:notifications:department:${department}`,
        'staff:notifications:urgent'
      ];

      for (const queueKey of queueKeys) {
        await this.redis.lrem(queueKey, 0, notificationId);
      }
    } catch (error) {
      logger.error('Failed to remove from all queues', { error, notificationId, department });
    }
  }

  private async sendAcknowledgmentUpdate(notification: StaffNotification, staffMemberId: string): Promise<void> {
    try {
      // TODO: Send WebSocket update about acknowledgment
      logger.info('Sending acknowledgment update', {
        notificationId: notification.id,
        staffMemberId
      });
    } catch (error) {
      logger.error('Failed to send acknowledgment update', { error, notification, staffMemberId });
    }
  }

  private async sendResolutionUpdate(notification: StaffNotification, staffMemberId: string): Promise<void> {
    try {
      // TODO: Send WebSocket update about resolution
      logger.info('Sending resolution update', {
        notificationId: notification.id,
        staffMemberId
      });
    } catch (error) {
      logger.error('Failed to send resolution update', { error, notification, staffMemberId });
    }
  }
}