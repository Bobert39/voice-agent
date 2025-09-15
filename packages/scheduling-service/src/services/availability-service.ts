/**
 * Appointment Availability Service
 * 
 * Handles appointment slot queries, business rule filtering,
 * and availability caching for optimal performance
 */

import { Redis } from 'ioredis';
import { OpenEMRSchedulingClient, AppointmentSlot, Practitioner } from './openemr-client';
import { logger } from '@voice-agent/shared-utils';

interface AvailabilityQuery {
  startDate: string;
  endDate: string;
  appointmentType?: 'routine' | 'follow-up' | 'urgent';
  practitionerId?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
}

interface TimeSlot {
  datetime: string;
  practitioner: string;
  practitionerId: string;
  duration: number;
  appointmentType: string;
  available: boolean;
}

interface BusinessRules {
  businessHours: {
    monday: { open: string; close: string; lunchStart?: string; lunchEnd?: string };
    tuesday: { open: string; close: string; lunchStart?: string; lunchEnd?: string };
    wednesday: { open: string; close: string; lunchStart?: string; lunchEnd?: string };
    thursday: { open: string; close: string; lunchStart?: string; lunchEnd?: string };
    friday: { open: string; close: string; lunchStart?: string; lunchEnd?: string };
    saturday?: { open: string; close: string };
    sunday?: { open: string; close: string };
  };
  appointmentDurations: {
    routine: number;      // 60 minutes
    'follow-up': number;  // 30 minutes
    urgent: number;       // 45 minutes
  };
  bufferTimes: {
    standard: number;     // 10 minutes
    complex: number;      // 15 minutes
  };
  holidays: string[];     // Array of ISO date strings
  blockedTimes: Array<{   // Recurring blocked times (e.g., staff meetings)
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    reason: string;
  }>;
}

export class AvailabilityService {
  private openemrClient: OpenEMRSchedulingClient;
  private redis: Redis;
  private businessRules: BusinessRules;
  private cacheEnabled: boolean;
  private cacheTTL: number = 300; // 5 minutes in seconds

  constructor(
    openemrClient: OpenEMRSchedulingClient,
    redis: Redis,
    businessRules: BusinessRules,
    cacheEnabled: boolean = true
  ) {
    this.openemrClient = openemrClient;
    this.redis = redis;
    this.businessRules = businessRules;
    this.cacheEnabled = cacheEnabled;
  }

  /**
   * Get available appointment slots based on query parameters
   */
  async getAvailableSlots(query: AvailabilityQuery): Promise<TimeSlot[]> {
    const cacheKey = this.generateCacheKey(query);
    
    // Check cache first
    if (this.cacheEnabled) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Returning cached availability', { query });
        return JSON.parse(cached);
      }
    }

    try {
      // Get raw slots from OpenEMR
      const rawSlots = await this.openemrClient.getAvailableSlots(
        query.startDate,
        query.endDate,
        query.practitionerId,
        query.appointmentType
      );

      // Get practitioners for name mapping
      const practitioners = await this.getPractitioners();
      const practitionerMap = new Map(practitioners.map(p => [p.id, p]));

      // Apply business rules and filtering
      const filteredSlots = await this.applyBusinessRules(rawSlots, query, practitionerMap);

      // Sort by datetime
      filteredSlots.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

      // Cache the results
      if (this.cacheEnabled) {
        await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(filteredSlots));
      }

      return filteredSlots;
    } catch (error) {
      logger.error('Failed to get available slots', { error, query });
      throw error;
    }
  }

  /**
   * Apply business rules to filter and format slots
   */
  private async applyBusinessRules(
    rawSlots: AppointmentSlot[],
    query: AvailabilityQuery,
    practitionerMap: Map<string, Practitioner>
  ): Promise<TimeSlot[]> {
    const filteredSlots: TimeSlot[] = [];

    for (const slot of rawSlots) {
      const slotDate = new Date(slot.start);
      const dayOfWeek = slotDate.toLocaleDateString('en-US', { weekday: 'lowercase' }) as keyof BusinessRules['businessHours'];
      
      // Check if it's a holiday
      if (this.isHoliday(slotDate)) {
        continue;
      }

      // Check business hours
      const businessHours = this.businessRules.businessHours[dayOfWeek];
      if (!businessHours) {
        continue;
      }

      const slotTime = slotDate.toTimeString().substring(0, 5); // HH:MM format
      
      // Check if slot is within business hours
      if (slotTime < businessHours.open || slotTime >= businessHours.close) {
        continue;
      }

      // Check lunch hours
      if (businessHours.lunchStart && businessHours.lunchEnd) {
        if (slotTime >= businessHours.lunchStart && slotTime < businessHours.lunchEnd) {
          continue;
        }
      }

      // Check blocked times
      if (this.isBlockedTime(dayOfWeek, slotTime)) {
        continue;
      }

      // Check preferred time of day
      if (query.preferredTimeOfDay && !this.matchesTimePreference(slotTime, query.preferredTimeOfDay)) {
        continue;
      }

      // Get appointment duration
      const appointmentType = query.appointmentType || 'routine';
      const duration = this.businessRules.appointmentDurations[appointmentType];

      // Check if there's enough time before close
      const slotEndTime = this.addMinutesToTime(slotTime, duration + this.businessRules.bufferTimes.standard);
      if (slotEndTime > businessHours.close) {
        continue;
      }

      // Extract practitioner info
      const practitionerId = this.extractPractitionerIdFromSchedule(slot.schedule);
      const practitioner = practitionerMap.get(practitionerId);

      filteredSlots.push({
        datetime: slot.start,
        practitioner: practitioner?.name || 'Available Provider',
        practitionerId: practitionerId || '',
        duration,
        appointmentType,
        available: true
      });
    }

    return filteredSlots;
  }

  /**
   * Check if a date is a holiday
   */
  private isHoliday(date: Date): boolean {
    const dateStr = date.toISOString().split('T')[0];
    return this.businessRules.holidays.includes(dateStr);
  }

  /**
   * Check if a time is blocked
   */
  private isBlockedTime(dayOfWeek: string, time: string): boolean {
    return this.businessRules.blockedTimes.some(block => 
      block.dayOfWeek.toLowerCase() === dayOfWeek &&
      time >= block.startTime &&
      time < block.endTime
    );
  }

  /**
   * Check if time matches preference
   */
  private matchesTimePreference(time: string, preference: 'morning' | 'afternoon' | 'evening'): boolean {
    const hour = parseInt(time.split(':')[0]);
    
    switch (preference) {
      case 'morning':
        return hour >= 8 && hour < 12;
      case 'afternoon':
        return hour >= 12 && hour < 17;
      case 'evening':
        return hour >= 17 && hour < 20;
      default:
        return true;
    }
  }

  /**
   * Add minutes to a time string
   */
  private addMinutesToTime(time: string, minutes: number): string {
    const [hours, mins] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMinutes / 60);
    const newMins = totalMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  }

  /**
   * Extract practitioner ID from schedule reference
   */
  private extractPractitionerIdFromSchedule(schedule?: string): string {
    if (!schedule) return '';
    // Schedule format: "Schedule/123" where 123 is linked to a practitioner
    // This would need to be mapped based on OpenEMR's specific implementation
    const match = schedule.match(/Schedule\/(\d+)/);
    return match ? match[1] : '';
  }

  /**
   * Get practitioners with caching
   */
  private async getPractitioners(): Promise<Practitioner[]> {
    const cacheKey = 'practitioners:all';
    
    if (this.cacheEnabled) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const practitioners = await this.openemrClient.getPractitioners();
    
    if (this.cacheEnabled) {
      await this.redis.setex(cacheKey, 3600, JSON.stringify(practitioners)); // Cache for 1 hour
    }

    return practitioners;
  }

  /**
   * Generate cache key for query
   */
  private generateCacheKey(query: AvailabilityQuery): string {
    const parts = [
      'availability',
      query.startDate,
      query.endDate,
      query.appointmentType || 'any',
      query.practitionerId || 'any',
      query.preferredTimeOfDay || 'any'
    ];
    return parts.join(':');
  }

  /**
   * Invalidate cache for a date range
   */
  async invalidateCache(startDate?: string, endDate?: string): Promise<void> {
    if (!this.cacheEnabled) return;

    try {
      if (!startDate) {
        // Clear all availability cache
        const keys = await this.redis.keys('availability:*');
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } else {
        // Clear specific date range
        const pattern = `availability:${startDate}*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
      
      logger.info('Cache invalidated', { startDate, endDate });
    } catch (error) {
      logger.error('Failed to invalidate cache', { error });
    }
  }

  /**
   * Get next available slots (convenience method for voice responses)
   */
  async getNextAvailableSlots(
    appointmentType: 'routine' | 'follow-up' | 'urgent' = 'routine',
    maxSlots: number = 3,
    practitionerId?: string
  ): Promise<TimeSlot[]> {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 60); // Look 60 days ahead

    const query: AvailabilityQuery = {
      startDate: today.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      appointmentType,
      practitionerId
    };

    const allSlots = await this.getAvailableSlots(query);
    return allSlots.slice(0, maxSlots);
  }

  /**
   * Parse natural language date references
   */
  parseNaturalDate(reference: string): { startDate: string; endDate: string } | null {
    const today = new Date();
    const normalizedRef = reference.toLowerCase().trim();

    // Tomorrow
    if (normalizedRef.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      return { startDate: dateStr, endDate: dateStr };
    }

    // Next week
    if (normalizedRef.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const endOfWeek = new Date(nextWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      return {
        startDate: nextWeek.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0]
      };
    }

    // This week
    if (normalizedRef.includes('this week')) {
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (6 - today.getDay()));
      return {
        startDate: today.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0]
      };
    }

    // Specific day names
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (normalizedRef.includes(days[i])) {
        const targetDay = i;
        const currentDay = today.getDay();
        let daysToAdd = targetDay - currentDay;
        
        // If the day has passed this week, get next week's
        if (daysToAdd <= 0) {
          daysToAdd += 7;
        }
        
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        const dateStr = targetDate.toISOString().split('T')[0];
        return { startDate: dateStr, endDate: dateStr };
      }
    }

    // Morning/Afternoon/Evening preferences
    if (normalizedRef.includes('morning') || normalizedRef.includes('afternoon') || normalizedRef.includes('evening')) {
      // Default to next 7 days
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 7);
      return {
        startDate: today.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    }

    return null;
  }
}