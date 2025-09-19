import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('practice-hours-service');

export interface PracticeHours {
  day: string;
  open: string;
  close: string;
  isOpen: boolean;
}

export interface HoursResponse {
  currentStatus: 'open' | 'closed';
  todaysHours?: PracticeHours;
  generalHours: PracticeHours[];
  nextOpenTime?: string;
  specialNote?: string;
}

/**
 * Service to manage practice hours information
 * Integrates with practice-info-service for real-time hours
 */
export class PracticeHoursService {
  private practiceInfoServiceUrl: string;

  constructor() {
    this.practiceInfoServiceUrl = process.env.PRACTICE_INFO_SERVICE_URL || 'http://localhost:3005';
  }

  /**
   * Get current practice hours and status
   * This will integrate with the practice-info-service when available
   */
  async getCurrentHours(): Promise<HoursResponse> {
    try {
      // TODO: Replace with actual practice-info-service integration
      // For now, using static Capitol Eye Care hours
      const hours = this.getStaticHours();
      const currentStatus = this.determineCurrentStatus(hours);

      logger.info('Retrieved practice hours', {
        currentStatus,
        practiceInfoServiceUrl: this.practiceInfoServiceUrl
      });

      return {
        currentStatus,
        todaysHours: this.getTodaysHours(hours),
        generalHours: hours,
        nextOpenTime: this.getNextOpenTime(hours, currentStatus),
        specialNote: this.getSpecialNotes()
      };

    } catch (error) {
      logger.error('Error retrieving practice hours', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      // Return fallback hours for reliability
      return this.getFallbackHours();
    }
  }

  /**
   * Get elderly-friendly response about practice hours
   */
  async getElderlyFriendlyResponse(): Promise<string> {
    try {
      const hoursInfo = await this.getCurrentHours();

      let response = '';

      if (hoursInfo.currentStatus === 'open') {
        response = "Yes, we are currently open! ";

        if (hoursInfo.todaysHours) {
          response += `Today we're open until ${hoursInfo.todaysHours.close}. `;
        }
      } else {
        response = "We are currently closed. ";

        if (hoursInfo.nextOpenTime) {
          response += `We'll be open again ${hoursInfo.nextOpenTime}. `;
        }
      }

      // Add general hours information
      response += "Our regular office hours are Monday through Friday from 8 AM to 5 PM, ";
      response += "and Saturday from 9 AM to 2 PM. We're closed on Sundays. ";

      // Add helpful information
      response += "If you need to schedule an appointment or have an urgent eye care concern, ";
      response += "you can call us during business hours or visit our website. ";

      if (hoursInfo.specialNote) {
        response += hoursInfo.specialNote + " ";
      }

      response += "Is there anything else I can help you with?";

      return response;

    } catch (error) {
      logger.error('Error generating elderly-friendly response', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return "I can help you with our office hours. We're typically open Monday through Friday from 8 AM to 5 PM, and Saturday from 9 AM to 2 PM. For the most current information or to schedule an appointment, please call during business hours.";
    }
  }

  /**
   * Check if practice is currently open
   */
  private determineCurrentStatus(hours: PracticeHours[]): 'open' | 'closed' {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = now.getHours() * 100 + now.getMinutes(); // HHMM format

    const todaysHours = hours.find(h => this.getDayNumber(h.day) === currentDay);

    if (!todaysHours || !todaysHours.isOpen) {
      return 'closed';
    }

    const openTime = this.timeStringToNumber(todaysHours.open);
    const closeTime = this.timeStringToNumber(todaysHours.close);

    return (currentTime >= openTime && currentTime < closeTime) ? 'open' : 'closed';
  }

  /**
   * Get today's specific hours
   */
  private getTodaysHours(hours: PracticeHours[]): PracticeHours | undefined {
    const currentDay = new Date().getDay();
    return hours.find(h => this.getDayNumber(h.day) === currentDay);
  }

  /**
   * Get next opening time when currently closed
   */
  private getNextOpenTime(hours: PracticeHours[], currentStatus: 'open' | 'closed'): string | undefined {
    if (currentStatus === 'open') {
      return undefined;
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 100 + now.getMinutes();

    // Check if we can open later today
    const todaysHours = hours.find(h => this.getDayNumber(h.day) === currentDay);
    if (todaysHours && todaysHours.isOpen) {
      const openTime = this.timeStringToNumber(todaysHours.open);
      if (currentTime < openTime) {
        return `today at ${todaysHours.open}`;
      }
    }

    // Find next open day
    for (let i = 1; i <= 7; i++) {
      const nextDay = (currentDay + i) % 7;
      const nextDayHours = hours.find(h => this.getDayNumber(h.day) === nextDay);

      if (nextDayHours && nextDayHours.isOpen) {
        const dayName = nextDay === (currentDay + 1) % 7 ? 'tomorrow' : nextDayHours.day;
        return `${dayName} at ${nextDayHours.open}`;
      }
    }

    return 'Monday at 8 AM'; // Fallback
  }

  /**
   * Get any special notes (holidays, schedule changes, etc.)
   */
  private getSpecialNotes(): string | undefined {
    // In a real implementation, this would check for:
    // - Holiday schedules
    // - Doctor availability
    // - Emergency closures
    // - Special hours announcements
    return undefined;
  }

  /**
   * Static Capitol Eye Care hours (fallback)
   */
  private getStaticHours(): PracticeHours[] {
    return [
      { day: 'Sunday', open: '', close: '', isOpen: false },
      { day: 'Monday', open: '8:00 AM', close: '5:00 PM', isOpen: true },
      { day: 'Tuesday', open: '8:00 AM', close: '5:00 PM', isOpen: true },
      { day: 'Wednesday', open: '8:00 AM', close: '5:00 PM', isOpen: true },
      { day: 'Thursday', open: '8:00 AM', close: '5:00 PM', isOpen: true },
      { day: 'Friday', open: '8:00 AM', close: '5:00 PM', isOpen: true },
      { day: 'Saturday', open: '9:00 AM', close: '2:00 PM', isOpen: true }
    ];
  }

  /**
   * Get fallback hours response for error cases
   */
  private getFallbackHours(): HoursResponse {
    const hours = this.getStaticHours();
    return {
      currentStatus: 'closed', // Conservative fallback
      generalHours: hours,
      specialNote: 'Please call during business hours for current availability'
    };
  }

  /**
   * Convert day name to number (0 = Sunday)
   */
  private getDayNumber(dayName: string): number {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.indexOf(dayName);
  }

  /**
   * Convert time string (e.g., "8:00 AM") to number (e.g., 800)
   */
  private timeStringToNumber(timeString: string): number {
    const parts = timeString.split(' ');
    if (parts.length !== 2) return 0;

    const time = parts[0];
    const period = parts[1];

    if (!time || !period) return 0;

    const timeParts = time.split(':');
    if (timeParts.length !== 2) return 0;

    const hourStr = timeParts[0];
    const minuteStr = timeParts[1];

    if (!hourStr || !minuteStr) return 0;

    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);

    if (isNaN(hours) || isNaN(minutes)) return 0;

    let hour24 = hours;
    if (period === 'PM' && hours !== 12) {
      hour24 += 12;
    } else if (period === 'AM' && hours === 12) {
      hour24 = 0;
    }

    return hour24 * 100 + minutes;
  }
}