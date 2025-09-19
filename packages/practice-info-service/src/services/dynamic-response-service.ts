import { createLogger } from '@ai-voice-agent/shared-utils';
import {
  BusinessHours,
  HolidaySchedule,
  CurrentStatusDTO,
  PracticeHoursDTO,
  PracticeInfoResponseDTO,
  ResponseGenerationContext,
} from '../types';
import { practiceInfoRepository } from './repository';
import { cacheService } from './cache';

const logger = createLogger('dynamic-response-service');

export class DynamicResponseService {
  /**
   * Generate current practice status
   */
  async getCurrentStatus(locationId?: string, timezone?: string): Promise<CurrentStatusDTO> {
    try {
      const cacheKey = `current_status:${locationId || 'primary'}:${timezone || 'default'}`;
      
      // Check cache first
      const cached = await cacheService.getCurrentStatus();
      if (cached && cached.cacheKey === cacheKey) {
        logger.debug('Cache hit for current status', { cacheKey });
        return cached.data;
      }

      const now = new Date();
      const practiceTimezone = timezone || 'America/New_York';
      
      // Get practice configuration
      const practiceConfig = await practiceInfoRepository.getPracticeConfiguration();
      if (!practiceConfig) {
        throw new Error('Practice configuration not found');
      }

      // Get current day's hours
      const currentHours = await practiceInfoRepository.getCurrentDayHours(now, locationId);
      
      // Check for holiday schedules
      const holidaySchedule = await practiceInfoRepository.getHolidaySchedule(now, locationId);
      
      const status = await this.calculateCurrentStatus(now, currentHours, holidaySchedule, practiceTimezone);
      
      // Cache the result for 15 minutes
      await cacheService.cacheCurrentStatus({ cacheKey, data: status }, 15);
      
      return status;
    } catch (error) {
      logger.error('Failed to get current status', { error, locationId, timezone });
      throw error;
    }
  }

  /**
   * Calculate if practice is currently open/closed
   */
  private async calculateCurrentStatus(
    currentTime: Date,
    businessHours: BusinessHours | null,
    holidaySchedule: HolidaySchedule | null,
    timezone: string
  ): Promise<CurrentStatusDTO> {
    const currentTimeString = currentTime.toLocaleTimeString('en-US', { 
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    // Check if it's a holiday
    if (holidaySchedule) {
      if (holidaySchedule.isClosed || !holidaySchedule.openTime || !holidaySchedule.closeTime) {
        const nextOpenTime = await this.getNextOpenTime(currentTime, timezone);
        const nextOpenDay = await this.getNextOpenDay(currentTime, timezone);
        return {
          isCurrentlyOpen: false,
          currentTime: currentTimeString,
          practiceTimezone: timezone,
          specialNotice: holidaySchedule.noticeMessage || `We're closed today for ${holidaySchedule.holidayName}`,
          ...(nextOpenTime && { nextOpenTime }),
          ...(nextOpenDay && { nextOpenDay }),
        };
      }
      
      // Holiday has special hours
      const isOpen = this.isTimeInRange(currentTimeString, holidaySchedule.openTime, holidaySchedule.closeTime);
      const nextOpenTime = isOpen ? undefined : await this.getNextOpenTime(currentTime, timezone);
      const nextOpenDay = isOpen ? undefined : await this.getNextOpenDay(currentTime, timezone);
      return {
        isCurrentlyOpen: isOpen,
        currentTime: currentTimeString,
        practiceTimezone: timezone,
        ...(holidaySchedule.noticeMessage && { specialNotice: holidaySchedule.noticeMessage }),
        ...(nextOpenTime && { nextOpenTime }),
        ...(nextOpenDay && { nextOpenDay }),
      };
    }

    // Regular business hours
    if (!businessHours || businessHours.isClosed || !businessHours.openTime || !businessHours.closeTime) {
      const nextOpenTime = await this.getNextOpenTime(currentTime, timezone);
      const nextOpenDay = await this.getNextOpenDay(currentTime, timezone);
      return {
        isCurrentlyOpen: false,
        currentTime: currentTimeString,
        practiceTimezone: timezone,
        ...(nextOpenTime && { nextOpenTime }),
        ...(nextOpenDay && { nextOpenDay }),
      };
    }

    // Check if currently within business hours
    let isOpen = this.isTimeInRange(currentTimeString, businessHours.openTime, businessHours.closeTime);
    
    // Check for lunch break
    if (isOpen && businessHours.breakStart && businessHours.breakEnd) {
      const isDuringBreak = this.isTimeInRange(currentTimeString, businessHours.breakStart, businessHours.breakEnd);
      if (isDuringBreak) {
        isOpen = false;
      }
    }

    const nextOpenTime = isOpen ? undefined : await this.getNextOpenTime(currentTime, timezone);
    const nextOpenDay = isOpen ? undefined : await this.getNextOpenDay(currentTime, timezone);
    return {
      isCurrentlyOpen: isOpen,
      currentTime: currentTimeString,
      practiceTimezone: timezone,
      ...(nextOpenTime && { nextOpenTime }),
      ...(nextOpenDay && { nextOpenDay }),
    };
  }

  /**
   * Check if current time is within a time range
   */
  private isTimeInRange(currentTime: string, startTime: string, endTime: string): boolean {
    const current = this.timeToMinutes(currentTime);
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    
    // Handle cases where end time is past midnight
    if (end < start) {
      return current >= start || current <= end;
    }
    
    return current >= start && current <= end;
  }

  /**
   * Convert time string to minutes since midnight
   */
  private timeToMinutes(timeString: string): number {
    const [hoursStr, minutesStr] = timeString.split(':');
    const hours = parseInt(hoursStr || '0') || 0;
    const minutes = parseInt(minutesStr || '0') || 0;
    return hours * 60 + minutes;
  }

  /**
   * Get next opening time (simplified - would need more complex logic for real implementation)
   */
  private async getNextOpenTime(_currentTime: Date, _timezone: string): Promise<string | undefined> {
    // This is a simplified implementation
    // In reality, this would check the next available opening time across days
    return "8:00 AM";
  }

  /**
   * Get next opening day
   */
  private async getNextOpenDay(_currentTime: Date, _timezone: string): Promise<string | undefined> {
    const tomorrow = new Date(_currentTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[tomorrow.getDay()];
  }

  /**
   * Get weekly hours formatted for voice responses
   */
  async getWeeklyHours(locationId?: string): Promise<PracticeHoursDTO[]> {
    try {
      const cacheKey = `weekly_hours:${locationId || 'primary'}`;
      const cached = await cacheService.getPracticeHours(cacheKey);
      
      if (cached) {
        logger.debug('Cache hit for weekly hours', { cacheKey });
        return cached;
      }

      const businessHours = await practiceInfoRepository.getBusinessHours(undefined, locationId);
      const weeklyHours = this.formatWeeklyHours(businessHours);
      
      // Cache for 24 hours
      await cacheService.cachePracticeHours(cacheKey, weeklyHours, 24);
      
      return weeklyHours;
    } catch (error) {
      logger.error('Failed to get weekly hours', { error, locationId });
      throw error;
    }
  }

  /**
   * Format business hours for display
   */
  private formatWeeklyHours(businessHours: BusinessHours[]): PracticeHoursDTO[] {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeklyHours: PracticeHoursDTO[] = [];

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const dayHours = businessHours.find(h => h.dayOfWeek === dayOfWeek && !h.isClosed);
      
      if (!dayHours) {
        weeklyHours.push({
          dayOfWeek: dayOfWeek.toString(),
          dayName: dayNames[dayOfWeek] || 'Unknown',
          isOpen: false,
          hasBreak: false,
        });
        continue;
      }

      weeklyHours.push({
        dayOfWeek: dayOfWeek.toString(),
        dayName: dayNames[dayOfWeek] || 'Unknown',
        isOpen: true,
        openTime: this.formatTimeForSpeech(dayHours.openTime || ''),
        closeTime: this.formatTimeForSpeech(dayHours.closeTime || ''),
        hasBreak: !!(dayHours.breakStart && dayHours.breakEnd),
        ...(dayHours.breakStart && { breakStart: this.formatTimeForSpeech(dayHours.breakStart) }),
        ...(dayHours.breakEnd && { breakEnd: this.formatTimeForSpeech(dayHours.breakEnd) }),
        ...(dayHours.notes && { notes: dayHours.notes }),
      });
    }

    return weeklyHours;
  }

  /**
   * Format time for speech synthesis (12-hour format)
   */
  private formatTimeForSpeech(timeString: string): string {
    if (!timeString) return '';
    
    const [hoursStr, minutesStr] = timeString.split(':');
    const hours = parseInt(hoursStr || '0') || 0;
    const minutes = parseInt(minutesStr || '0') || 0;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    
    if (minutes === 0) {
      return `${displayHours} ${period}`;
    }
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  /**
   * Generate business hours response
   */
  generateBusinessHoursResponse(
    currentStatus: CurrentStatusDTO,
    weeklyHours: PracticeHoursDTO[],
    context: ResponseGenerationContext
  ): string {
    let response = '';

    // Current status first
    if (currentStatus.isCurrentlyOpen) {
      response += "We're currently open";
      const todayHours = this.getTodayHours(weeklyHours);
      if (todayHours && todayHours.closeTime) {
        response += ` until ${todayHours.closeTime} today`;
      }
      response += '. ';
    } else {
      response += "We're currently closed. ";
      if (currentStatus.nextOpenTime && currentStatus.nextOpenDay) {
        response += `We'll be open again ${currentStatus.nextOpenDay} at ${currentStatus.nextOpenTime}. `;
      }
    }

    // Add special notice if any
    if (currentStatus.specialNotice) {
      response += `${currentStatus.specialNotice}. `;
    }

    // Weekly hours summary
    response += this.generateWeeklyHoursSummary(weeklyHours);

    // Add confirmation prompt
    response += ' Would you like me to repeat our hours, or do you have other questions about visiting our office?';

    return response;
  }

  /**
   * Get today's hours from weekly schedule
   */
  private getTodayHours(weeklyHours: PracticeHoursDTO[]): PracticeHoursDTO | undefined {
    const today = new Date().getDay();
    return weeklyHours.find(h => parseInt(h.dayOfWeek) === today);
  }

  /**
   * Generate condensed weekly hours summary
   */
  private generateWeeklyHoursSummary(weeklyHours: PracticeHoursDTO[]): string {
    const openDays = weeklyHours.filter(h => h.isOpen);
    
    if (openDays.length === 0) {
      return 'Please call us to confirm our current schedule. ';
    }

    // Group similar hours to reduce cognitive load
    const hourGroups = this.groupSimilarHours(openDays);
    
    let summary = 'Our regular hours are: ';
    hourGroups.forEach((group, index) => {
      if (index > 0) {
        summary += index === hourGroups.length - 1 ? ', and ' : ', ';
      }
      
      if (group.days.length === 1) {
        summary += `${group.days[0]} from ${group.openTime} to ${group.closeTime}`;
      } else {
        const firstDay = group.days[0];
        const lastDay = group.days[group.days.length - 1];
        summary += `${firstDay} through ${lastDay} from ${group.openTime} to ${group.closeTime}`;
      }
    });
    
    summary += '. ';
    return summary;
  }

  /**
   * Group consecutive days with same hours
   */
  private groupSimilarHours(openDays: PracticeHoursDTO[]): Array<{
    days: string[];
    openTime: string;
    closeTime: string;
  }> {
    const groups: Array<{
      days: string[];
      openTime: string;
      closeTime: string;
    }> = [];

    let currentGroup: {
      days: string[];
      openTime: string;
      closeTime: string;
    } | null = null;

    openDays.forEach(day => {
      if (!currentGroup || 
          currentGroup.openTime !== day.openTime || 
          currentGroup.closeTime !== day.closeTime) {
        
        currentGroup = {
          days: [day.dayName],
          openTime: day.openTime || '',
          closeTime: day.closeTime || '',
        };
        groups.push(currentGroup);
      } else {
        currentGroup.days.push(day.dayName);
      }
    });

    return groups;
  }

  /**
   * Generate location information response
   */
  async generateLocationResponse(context: ResponseGenerationContext): Promise<string> {
    try {
      const location = await practiceInfoRepository.getPrimaryLocation();
      if (!location) {
        return "I apologize, but I'm having trouble accessing our location information right now. Please call our main number for directions to our office.";
      }

      let response = `We're located at ${location.addressLine1}`;

      if (location.addressLine2) {
        response += `, ${location.addressLine2}`;
      }

      response += ` in ${location.city}, ${location.state}. `;

      // Add phone number
      if (location.phoneNumber) {
        const formattedPhone = this.formatPhoneForSpeech(location.phoneNumber);
        response += `Our phone number is ${formattedPhone}. `;
      }

      // Parking information
      if (location.parkingInstructions) {
        response += `For parking: ${location.parkingInstructions} `;
      }

      // Accessibility features
      if (location.accessibilityFeatures && location.accessibilityFeatures.length > 0) {
        response += `Our office is wheelchair accessible with accessible parking spaces available. `;
      }

      // Confirmation prompt
      response += 'Would you like me to repeat our address, or do you need directions from a specific location?';

      return response;
    } catch (error) {
      logger.error('Failed to generate location response', { error });
      return "I apologize, but I'm having trouble accessing our location information right now. Please call our main number for assistance with directions.";
    }
  }

  /**
   * Format phone number for clear speech synthesis
   */
  private formatPhoneForSpeech(phoneNumber: string): string {
    // Remove all non-digits
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 10) {
      // Format as (555) 123-4567
      return `(${digits.substr(0, 3)}) ${digits.substr(3, 3)}-${digits.substr(6, 4)}`;
    }
    
    // Return as-is if not standard 10-digit format
    return phoneNumber;
  }

  /**
   * Generate insurance information response
   */
  async generateInsuranceResponse(
    insuranceQuery?: string,
    context?: ResponseGenerationContext
  ): Promise<string> {
    try {

      if (insuranceQuery) {
        // Specific insurance inquiry
        const insurancePlan = await practiceInfoRepository.checkInsuranceAcceptance(insuranceQuery);
        
        if (insurancePlan) {
          let response = insurancePlan.isAccepted 
            ? `Yes, we do accept ${insurancePlan.insuranceCompany}` 
            : `I'm sorry, but we don't currently accept ${insurancePlan.insuranceCompany}`;

          if (insurancePlan.planName) {
            response += ` ${insurancePlan.planName}`;
          }
          
          response += '. ';

          if (insurancePlan.isAccepted) {
            if (insurancePlan.requiresReferral) {
              response += 'Please note that this plan requires a referral from your primary care doctor. ';
            }
            
            if (insurancePlan.requiresPreauthorization) {
              response += 'Pre-authorization may be required for certain procedures. ';
            }
            
            if (insurancePlan.copayAmount) {
              response += `Your copay will be $${insurancePlan.copayAmount}. `;
            }
          }

          response += 'Do you have any other questions about your insurance coverage?';

          return response;
        } else {
          return `I don't have specific information about ${insuranceQuery} in our system. Please call our office and our staff can verify your coverage and benefits.`;
        }
      } else {
        // General insurance information
        const acceptedPlans = await practiceInfoRepository.getAcceptedInsurancePlans();
        
        if (acceptedPlans.length === 0) {
          return "Please call our office to discuss insurance coverage and payment options.";
        }

        // Limit to most common plans
        const majorPlans = acceptedPlans.slice(0, 6);
        const planNames = majorPlans.map(p => p.insuranceCompany);
        
        let response = "We accept most major insurance plans including ";
        
        if (planNames.length <= 3) {
          response += planNames.join(', ');
        } else {
          response += planNames.slice(0, 3).join(', ') + ', and several others';
        }
        
        response += '. We recommend calling our office to verify your specific plan and benefits. ';

        response += 'Would you like me to transfer you to our staff to check your insurance, or do you have other questions?';

        return response;
      }
    } catch (error) {
      logger.error('Failed to generate insurance response', { error, insuranceQuery });
      return "I apologize, but I'm having trouble accessing our insurance information right now. Please call our office and our staff will be happy to verify your coverage.";
    }
  }

  /**
   * Generate appointment preparation instructions
   */
  async generatePreparationResponse(
    appointmentType: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    try {
      const appointmentTypeInfo = await practiceInfoRepository.getAppointmentType(appointmentType);
      
      if (!appointmentTypeInfo) {
        return `I don't have specific preparation instructions for ${appointmentType} appointments. Please call our office and our staff will provide you with detailed preparation information.`;
      }

      let response = `For your ${appointmentTypeInfo.appointmentTypeName} appointment, here's what you need to know: `;

      const instructions: string[] = [];

      // Driver requirement
      if (appointmentTypeInfo.requiresDriver) {
        instructions.push("You'll need someone to drive you to and from your appointment");
      }

      // What to bring
      if (appointmentTypeInfo.bringRequirements && appointmentTypeInfo.bringRequirements.length > 0) {
        const items = appointmentTypeInfo.bringRequirements.slice(0, 3);
        instructions.push(`Please bring ${items.join(', ')}`);
      }

      // Special preparation
      if (appointmentTypeInfo.preparationInstructions) {
        instructions.push(appointmentTypeInfo.preparationInstructions);
      }

      // Dilation warning
      if (appointmentTypeInfo.requiresDilation) {
        instructions.push("Your eyes will be dilated, which may cause blurred vision for several hours");
      }

      // Fasting requirement
      if (appointmentTypeInfo.fastingRequired) {
        instructions.push("Please don't eat or drink anything after midnight before your appointment");
      }

      // Add instructions
      instructions.forEach((instruction, index) => {
        if (index > 0) {
          response += '. ';
        }
        response += instruction;
      });

      response += '. ';

      // Add confirmation and support
      response += 'Would you like me to repeat any of these instructions, or do you have questions about preparing for your visit?';

      return response;
    } catch (error) {
      logger.error('Failed to generate preparation response', { error, appointmentType });
      return "I apologize, but I'm having trouble accessing preparation instructions right now. Please call our office and our staff will provide you with detailed information about preparing for your appointment.";
    }
  }

  /**
   * Generate comprehensive practice information response
   */
  async generateComprehensivePracticeInfo(_context: ResponseGenerationContext): Promise<PracticeInfoResponseDTO> {
    try {
      const [
        practiceConfig,
        primaryLocation,
        currentStatus,
        weeklyHours,
        upcomingHolidays,
        acceptedInsurance,
        appointmentTypes,
        importantPolicies,
      ] = await Promise.all([
        practiceInfoRepository.getPracticeConfiguration(),
        practiceInfoRepository.getPrimaryLocation(),
        this.getCurrentStatus(),
        this.getWeeklyHours(),
        practiceInfoRepository.getUpcomingHolidays(30),
        practiceInfoRepository.getAcceptedInsurancePlans(),
        practiceInfoRepository.getAppointmentTypes(),
        practiceInfoRepository.getVoiceResponsePolicies(),
      ]);

      if (!practiceConfig || !primaryLocation) {
        throw new Error('Essential practice information not found');
      }

      return {
        practiceInfo: {
          name: practiceConfig.practiceName,
          phone: practiceConfig.phoneNumber,
          timezone: practiceConfig.practiceTimezone,
          primaryLocation,
        },
        currentStatus,
        weeklyHours,
        upcomingHolidays,
        acceptedInsurance,
        appointmentTypes,
        importantPolicies,
      };
    } catch (error) {
      logger.error('Failed to generate comprehensive practice info', { error });
      throw error;
    }
  }
}

// Singleton instance
export const dynamicResponseService = new DynamicResponseService();