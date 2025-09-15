/**
 * Waitlist Management Service for Story 3.4
 * 
 * Handles intelligent waitlist matching, patient notifications, and slot reallocation
 * when appointments are cancelled. Integrates with appointment cancellation workflow
 * to maximize appointment slot utilization.
 */

import { Redis } from 'ioredis';
import { 
  WaitlistEntry, 
  WaitlistNotification, 
  WaitlistMatchingCriteria, 
  WaitlistMatchResult,
  TimeSlot 
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export class WaitlistManagementService {
  private redis: Redis;
  private notificationService: any; // TODO: Type this properly when notification service is available

  constructor(redis: Redis, notificationService: any) {
    this.redis = redis;
    this.notificationService = notificationService;
  }

  /**
   * Add patient to waitlist for earlier appointment
   */
  async addToWaitlist(entry: Omit<WaitlistEntry, 'id' | 'createdAt'>): Promise<WaitlistEntry> {
    try {
      const waitlistEntry: WaitlistEntry = {
        ...entry,
        id: this.generateWaitlistId(),
        createdAt: new Date().toISOString()
      };

      // Store in Redis with TTL based on maxWaitDays
      const ttl = entry.maxWaitDays * 24 * 60 * 60; // Convert days to seconds
      const key = `waitlist:${waitlistEntry.id}`;
      await this.redis.setex(key, ttl, JSON.stringify(waitlistEntry));

      // Add to priority-based sorted set for efficient matching
      const priorityScore = this.calculatePriorityScore(waitlistEntry);
      await this.redis.zadd(
        `waitlist:priority:${entry.appointmentType}`, 
        priorityScore, 
        waitlistEntry.id
      );

      // Add to date-based index for cleanup
      await this.redis.zadd(
        'waitlist:expiry',
        Date.now() + (ttl * 1000),
        waitlistEntry.id
      );

      logger.info('Patient added to waitlist', { 
        waitlistId: waitlistEntry.id, 
        patientId: entry.patientId,
        appointmentType: entry.appointmentType,
        priority: entry.priority
      });

      return waitlistEntry;

    } catch (error) {
      logger.error('Failed to add patient to waitlist', { error, entry });
      throw new Error('Failed to add to waitlist');
    }
  }

  /**
   * Find and notify waitlisted patients when slot becomes available
   */
  async notifyWaitlistForCancelledSlot(criteria: WaitlistMatchingCriteria): Promise<WaitlistNotification[]> {
    try {
      // Find matching waitlist entries
      const matches = await this.findWaitlistMatches(criteria);
      
      if (matches.length === 0) {
        logger.info('No waitlist matches found for cancelled slot', { criteria });
        return [];
      }

      // Sort by match score and priority
      const sortedMatches = matches.sort((a, b) => {
        if (a.matchScore !== b.matchScore) {
          return b.matchScore - a.matchScore; // Higher score first
        }
        return this.calculatePriorityScore(a.entry) - this.calculatePriorityScore(b.entry);
      });

      // Notify top candidates (up to 3 for urgent, 1-2 for others)
      const notificationCount = criteria.appointmentType === 'urgent' ? 3 : 2;
      const notifications: WaitlistNotification[] = [];

      for (const match of sortedMatches.slice(0, notificationCount)) {
        const notification = await this.sendWaitlistNotification(match, criteria);
        if (notification) {
          notifications.push(notification);
        }
      }

      logger.info('Waitlist notifications sent for cancelled slot', {
        criteria,
        notificationsSent: notifications.length,
        totalMatches: matches.length
      });

      return notifications;

    } catch (error) {
      logger.error('Failed to notify waitlist for cancelled slot', { error, criteria });
      return [];
    }
  }

  /**
   * Find waitlist entries that match the available slot
   */
  private async findWaitlistMatches(criteria: WaitlistMatchingCriteria): Promise<WaitlistMatchResult[]> {
    try {
      // Get waitlist entries for the appointment type, ordered by priority
      const waitlistIds = await this.redis.zrevrange(
        `waitlist:priority:${criteria.appointmentType}`,
        0, 
        50 // Limit to top 50 for performance
      );

      const matches: WaitlistMatchResult[] = [];
      const slotDate = new Date(criteria.datetime);
      const slotDay = slotDate.toISOString().split('T')[0];

      for (const waitlistId of waitlistIds) {
        const entry = await this.getWaitlistEntry(waitlistId);
        if (!entry) continue;

        const matchScore = this.calculateMatchScore(entry, criteria, slotDate);
        if (matchScore > 0.3) { // Minimum match threshold
          matches.push({
            entry,
            matchScore,
            matchReasons: this.getMatchReasons(entry, criteria, slotDate),
            estimatedResponse: this.estimateResponseTime(entry)
          });
        }
      }

      return matches;

    } catch (error) {
      logger.error('Failed to find waitlist matches', { error, criteria });
      return [];
    }
  }

  /**
   * Calculate match score between waitlist entry and available slot
   */
  private calculateMatchScore(
    entry: WaitlistEntry, 
    criteria: WaitlistMatchingCriteria, 
    slotDate: Date
  ): number {
    let score = 0;

    // Date preference matching (40% weight)
    const slotDay = slotDate.toISOString().split('T')[0];
    if (entry.preferredDates.includes(slotDay)) {
      score += 0.4;
    } else {
      // Check if slot is within preferred date range
      const slotTime = slotDate.getTime();
      const hasNearbyDate = entry.preferredDates.some(prefDate => {
        const prefTime = new Date(prefDate).getTime();
        const daysDiff = Math.abs(slotTime - prefTime) / (1000 * 60 * 60 * 24);
        return daysDiff <= 3; // Within 3 days
      });
      if (hasNearbyDate) score += 0.2;
    }

    // Time of day preference matching (25% weight)
    const slotHour = slotDate.getHours();
    const timeOfDay = this.getTimeOfDay(slotHour);
    if (entry.preferredTimeOfDay === timeOfDay) {
      score += 0.25;
    } else if (!entry.preferredTimeOfDay) {
      score += 0.15; // Partial credit for no preference
    }

    // Provider preference matching (20% weight)
    if (entry.preferredProvider === criteria.practitionerId) {
      score += 0.2;
    } else if (!entry.preferredProvider) {
      score += 0.1; // Partial credit for no preference
    }

    // Urgency and priority matching (15% weight)
    const priorityBonus = {
      'urgent': 0.15,
      'high': 0.12,
      'normal': 0.08,
      'low': 0.05
    };
    score += priorityBonus[entry.priority];

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Send notification to waitlisted patient about available slot
   */
  private async sendWaitlistNotification(
    match: WaitlistMatchResult, 
    criteria: WaitlistMatchingCriteria
  ): Promise<WaitlistNotification | null> {
    try {
      const { entry } = match;
      const slotDate = new Date(criteria.datetime);
      
      // Check notification timing preferences
      if (entry.notificationPreferences.businessHoursOnly && !this.isBusinessHours(slotDate)) {
        // Schedule for next business day
        logger.info('Delaying waitlist notification to business hours', { 
          waitlistId: entry.id, 
          currentTime: new Date().toISOString() 
        });
        return null; // Will be handled by scheduled job
      }

      // Create notification record
      const notification: WaitlistNotification = {
        id: this.generateNotificationId(),
        waitlistEntryId: entry.id,
        availableSlot: {
          datetime: criteria.datetime,
          practitioner: 'TBD', // Will be filled by caller
          practitionerId: criteria.practitionerId,
          duration: criteria.duration,
          appointmentType: criteria.appointmentType,
          available: true
        },
        notificationMethod: entry.notificationPreferences.methods[0], // Use primary method
        sentAt: new Date().toISOString(),
        responseDeadline: this.calculateResponseDeadline(entry),
        status: 'sent',
        attempts: 1,
        maxAttempts: 3
      };

      // Store notification
      await this.storeWaitlistNotification(notification);

      // Send notification via preferred method
      const success = await this.sendNotification(entry, notification, criteria);
      
      if (success) {
        notification.status = 'delivered';
        await this.storeWaitlistNotification(notification);
        
        logger.info('Waitlist notification sent successfully', {
          notificationId: notification.id,
          waitlistId: entry.id,
          method: notification.notificationMethod
        });
      }

      return notification;

    } catch (error) {
      logger.error('Failed to send waitlist notification', { error, match, criteria });
      return null;
    }
  }

  /**
   * Process response to waitlist notification
   */
  async processWaitlistResponse(
    notificationId: string, 
    response: 'accepted' | 'declined'
  ): Promise<boolean> {
    try {
      const notification = await this.getWaitlistNotification(notificationId);
      if (!notification) {
        logger.warn('Waitlist notification not found', { notificationId });
        return false;
      }

      // Update notification status
      notification.response = response;
      notification.status = 'responded';
      await this.storeWaitlistNotification(notification);

      if (response === 'accepted') {
        // Remove from waitlist
        await this.removeFromWaitlist(notification.waitlistEntryId);
        
        logger.info('Waitlist response processed - accepted', {
          notificationId,
          waitlistId: notification.waitlistEntryId
        });
        
        return true;
      } else {
        // Keep in waitlist but note the declined slot
        await this.recordDeclinedSlot(notification.waitlistEntryId, notification.availableSlot);
        
        logger.info('Waitlist response processed - declined', {
          notificationId,
          waitlistId: notification.waitlistEntryId
        });
      }

      return true;

    } catch (error) {
      logger.error('Failed to process waitlist response', { error, notificationId, response });
      return false;
    }
  }

  /**
   * Remove expired waitlist entries
   */
  async cleanupExpiredEntries(): Promise<number> {
    try {
      const now = Date.now();
      const expiredIds = await this.redis.zrangebyscore('waitlist:expiry', 0, now);
      
      let removedCount = 0;
      for (const waitlistId of expiredIds) {
        await this.removeFromWaitlist(waitlistId);
        removedCount++;
      }

      if (removedCount > 0) {
        logger.info('Cleaned up expired waitlist entries', { removedCount });
      }

      return removedCount;

    } catch (error) {
      logger.error('Failed to cleanup expired waitlist entries', { error });
      return 0;
    }
  }

  // Private helper methods

  private generateWaitlistId(): string {
    return `wl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateNotificationId(): string {
    return `wn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private calculatePriorityScore(entry: WaitlistEntry): number {
    const baseScore = Date.now() - new Date(entry.createdAt).getTime(); // Older entries get higher score
    const priorityMultiplier = {
      'urgent': 4,
      'high': 3,
      'normal': 2,
      'low': 1
    };
    return baseScore * priorityMultiplier[entry.priority];
  }

  private getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  private getMatchReasons(
    entry: WaitlistEntry, 
    criteria: WaitlistMatchingCriteria, 
    slotDate: Date
  ): string[] {
    const reasons: string[] = [];
    
    const slotDay = slotDate.toISOString().split('T')[0];
    if (entry.preferredDates.includes(slotDay)) {
      reasons.push('Exact date match');
    }
    
    const timeOfDay = this.getTimeOfDay(slotDate.getHours());
    if (entry.preferredTimeOfDay === timeOfDay) {
      reasons.push(`Preferred ${timeOfDay} time`);
    }
    
    if (entry.preferredProvider === criteria.practitionerId) {
      reasons.push('Preferred provider');
    }
    
    if (entry.priority === 'urgent') {
      reasons.push('Urgent priority');
    }
    
    return reasons;
  }

  private estimateResponseTime(entry: WaitlistEntry): 'immediate' | 'quick' | 'delayed' {
    if (entry.notificationPreferences.immediateNotify) {
      return 'immediate';
    }
    if (entry.priority === 'urgent' || entry.priority === 'high') {
      return 'quick';
    }
    return 'delayed';
  }

  private calculateResponseDeadline(entry: WaitlistEntry): string {
    const now = new Date();
    const deadline = new Date(now);
    
    // Give more time for business hours only patients
    if (entry.notificationPreferences.businessHoursOnly) {
      deadline.setHours(deadline.getHours() + 4); // 4 hours to respond
    } else {
      deadline.setHours(deadline.getHours() + 2); // 2 hours for immediate notify
    }
    
    return deadline.toISOString();
  }

  private isBusinessHours(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();
    return day >= 1 && day <= 5 && hour >= 8 && hour <= 17; // Mon-Fri 8AM-5PM
  }

  private async sendNotification(
    entry: WaitlistEntry, 
    notification: WaitlistNotification, 
    criteria: WaitlistMatchingCriteria
  ): Promise<boolean> {
    try {
      const slotDate = new Date(criteria.datetime);
      const message = this.generateNotificationMessage(entry, slotDate, criteria);
      
      // This would integrate with the notification service
      // For now, we'll log the notification
      logger.info('Sending waitlist notification', {
        method: notification.notificationMethod,
        patientId: entry.patientId,
        message: message.substring(0, 100) + '...'
      });
      
      // TODO: Integrate with actual notification service
      return true;
      
    } catch (error) {
      logger.error('Failed to send notification', { error, entry, notification });
      return false;
    }
  }

  private generateNotificationMessage(
    entry: WaitlistEntry, 
    slotDate: Date, 
    criteria: WaitlistMatchingCriteria
  ): string {
    const formattedDate = slotDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `Good news! An earlier ${criteria.appointmentType} appointment is now available on ${formattedDate}. ` +
           `This matches your waitlist preferences. Please respond within 2 hours to secure this appointment. ` +
           `Call us at (555) 123-4567 or reply to this message with YES to accept or NO to decline.`;
  }

  private async getWaitlistEntry(waitlistId: string): Promise<WaitlistEntry | null> {
    try {
      const data = await this.redis.get(`waitlist:${waitlistId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get waitlist entry', { error, waitlistId });
      return null;
    }
  }

  private async getWaitlistNotification(notificationId: string): Promise<WaitlistNotification | null> {
    try {
      const data = await this.redis.get(`waitlist:notification:${notificationId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get waitlist notification', { error, notificationId });
      return null;
    }
  }

  private async storeWaitlistNotification(notification: WaitlistNotification): Promise<void> {
    try {
      const key = `waitlist:notification:${notification.id}`;
      await this.redis.setex(key, 86400 * 7, JSON.stringify(notification)); // 7 days
    } catch (error) {
      logger.error('Failed to store waitlist notification', { error, notification });
    }
  }

  private async removeFromWaitlist(waitlistId: string): Promise<void> {
    try {
      const entry = await this.getWaitlistEntry(waitlistId);
      if (entry) {
        // Remove from Redis
        await this.redis.del(`waitlist:${waitlistId}`);
        
        // Remove from priority queue
        await this.redis.zrem(`waitlist:priority:${entry.appointmentType}`, waitlistId);
        
        // Remove from expiry index
        await this.redis.zrem('waitlist:expiry', waitlistId);
        
        logger.info('Removed patient from waitlist', { waitlistId, patientId: entry.patientId });
      }
    } catch (error) {
      logger.error('Failed to remove from waitlist', { error, waitlistId });
    }
  }

  private async recordDeclinedSlot(waitlistId: string, slot: TimeSlot): Promise<void> {
    try {
      const key = `waitlist:declined:${waitlistId}`;
      const declined = await this.redis.lrange(key, 0, -1);
      declined.push(JSON.stringify({ slot, declinedAt: new Date().toISOString() }));
      
      // Keep only last 10 declined slots
      if (declined.length > 10) {
        await this.redis.ltrim(key, -10, -1);
      } else {
        await this.redis.rpush(key, JSON.stringify({ slot, declinedAt: new Date().toISOString() }));
      }
      
      await this.redis.expire(key, 86400 * 30); // 30 days
    } catch (error) {
      logger.error('Failed to record declined slot', { error, waitlistId, slot });
    }
  }
}