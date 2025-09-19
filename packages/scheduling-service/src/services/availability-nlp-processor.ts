/**
 * Availability NLP Processor
 *
 * Handles natural language processing for appointment availability queries
 * Implements Story 3.1 requirements for natural language understanding
 */

import { logger } from '@voice-agent/shared-utils';

export interface NLPQuery {
  rawText: string;
  intent: 'availability' | 'specific_date' | 'next_available' | 'reschedule';
  entities: {
    dateRange?: { start: Date; end: Date };
    timePreference?: 'morning' | 'afternoon' | 'evening';
    appointmentType?: 'routine' | 'follow-up' | 'urgent';
    practitioner?: string;
    dayOfWeek?: string[];
    relative_time?: string; // "tomorrow", "next week", etc.
  };
  confidence: number;
}

export interface ProcessedAvailabilityQuery {
  startDate: string;
  endDate: string;
  appointmentType?: 'routine' | 'follow-up' | 'urgent';
  practitionerId?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  maxResults?: number;
}

export class AvailabilityNLPProcessor {
  private readonly timePatterns = {
    morning: /(morning|am|before noon|early)/i,
    afternoon: /(afternoon|pm|after lunch|mid[ -]?day)/i,
    evening: /(evening|late|after 5|night)/i
  };

  private readonly appointmentTypePatterns = {
    routine: /(routine|regular|check[ -]?up|annual|yearly|eye exam|comprehensive)/i,
    'follow-up': /(follow[ -]?up|recheck|post[ -]?op|after|return)/i,
    urgent: /(urgent|emergency|soon|asap|quickly|today|immediate)/i
  };

  private readonly relativeTimePatterns = {
    today: /\b(today|this afternoon|this morning|this evening)\b/i,
    tomorrow: /\b(tomorrow)\b/i,
    thisWeek: /\b(this week|later this week)\b/i,
    nextWeek: /\b(next week)\b/i,
    nextMonth: /\b(next month)\b/i,
    specific_day: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  };

  /**
   * Process natural language query into structured availability query
   */
  async processQuery(rawText: string): Promise<NLPQuery> {
    const normalizedText = rawText.toLowerCase().trim();

    // Detect intent
    const intent = this.detectIntent(normalizedText);

    // Extract entities
    const entities = this.extractEntities(normalizedText);

    // Calculate confidence based on entity extraction success
    const confidence = this.calculateConfidence(entities);

    return {
      rawText,
      intent,
      entities,
      confidence
    };
  }

  /**
   * Detect the primary intent from the query
   */
  private detectIntent(text: string): NLPQuery['intent'] {
    if (/when|what|available|availability|open|free/i.test(text)) {
      return 'availability';
    }
    if (/next available|earliest|soonest|first/i.test(text)) {
      return 'next_available';
    }
    if (/reschedule|change|move/i.test(text)) {
      return 'reschedule';
    }
    if (/on|at|specific/i.test(text)) {
      return 'specific_date';
    }
    return 'availability';
  }

  /**
   * Extract entities from the query text
   */
  private extractEntities(text: string): NLPQuery['entities'] {
    const entities: NLPQuery['entities'] = {};

    // Extract time preference
    for (const [key, pattern] of Object.entries(this.timePatterns)) {
      if (pattern.test(text)) {
        entities.timePreference = key as 'morning' | 'afternoon' | 'evening';
        break;
      }
    }

    // Extract appointment type
    for (const [key, pattern] of Object.entries(this.appointmentTypePatterns)) {
      if (pattern.test(text)) {
        entities.appointmentType = key as 'routine' | 'follow-up' | 'urgent';
        break;
      }
    }

    // Extract relative time references
    for (const [key, pattern] of Object.entries(this.relativeTimePatterns)) {
      if (pattern.test(text)) {
        entities.relative_time = key;
        entities.dateRange = this.parseRelativeTime(key, text);
        break;
      }
    }

    // Extract specific days of week
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const mentionedDays = days.filter(day =>
      new RegExp(`\\b${day}\\b`, 'i').test(text)
    );
    if (mentionedDays.length > 0) {
      entities.dayOfWeek = mentionedDays;
    }

    // Extract practitioner name (simple pattern - would integrate with practitioner database)
    const drPattern = /\b(?:dr\.?|doctor)\s+(\w+)/i;
    const drMatch = text.match(drPattern);
    if (drMatch) {
      entities.practitioner = drMatch[1];
    }

    return entities;
  }

  /**
   * Parse relative time references into date ranges
   */
  private parseRelativeTime(timeRef: string, fullText: string): { start: Date; end: Date } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (timeRef) {
      case 'today':
        return {
          start: new Date(today),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        };

      case 'tomorrow':
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return {
          start: tomorrow,
          end: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
        };

      case 'thisWeek':
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
        return {
          start: today,
          end: endOfWeek
        };

      case 'nextWeek':
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + (8 - today.getDay()));
        const nextSunday = new Date(nextMonday);
        nextSunday.setDate(nextMonday.getDate() + 6);
        return {
          start: nextMonday,
          end: nextSunday
        };

      case 'nextMonth':
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const endOfNextMonth = new Date(nextMonth);
        endOfNextMonth.setMonth(endOfNextMonth.getMonth() + 1);
        return {
          start: nextMonth,
          end: endOfNextMonth
        };

      case 'specific_day':
        // Extract the specific day mentioned
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < days.length; i++) {
          if (new RegExp(`\\b${days[i]}\\b`, 'i').test(fullText)) {
            const targetDay = this.getNextOccurrenceOfDay(i);
            return {
              start: targetDay,
              end: new Date(targetDay.getTime() + 24 * 60 * 60 * 1000)
            };
          }
        }
        // Fallback to next 7 days
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return { start: today, end: weekFromNow };

      default:
        // Default to next 30 days
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        return { start: today, end: thirtyDaysFromNow };
    }
  }

  /**
   * Get the next occurrence of a specific day of week
   */
  private getNextOccurrenceOfDay(targetDay: number): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentDay = today.getDay();
    let daysUntilTarget = targetDay - currentDay;

    // If the day has passed this week or is today, get next week's occurrence
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);
    return targetDate;
  }

  /**
   * Calculate confidence score based on entity extraction
   */
  private calculateConfidence(entities: NLPQuery['entities']): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for each successfully extracted entity
    if (entities.dateRange) confidence += 0.2;
    if (entities.timePreference) confidence += 0.1;
    if (entities.appointmentType) confidence += 0.1;
    if (entities.practitioner) confidence += 0.05;
    if (entities.dayOfWeek && entities.dayOfWeek.length > 0) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * Convert NLP query to processed availability query
   */
  convertToAvailabilityQuery(nlpQuery: NLPQuery): ProcessedAvailabilityQuery {
    const today = new Date();
    const sixtyDaysFromNow = new Date(today);
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    // Use extracted date range or default to next 60 days
    const startDate = nlpQuery.entities.dateRange?.start || today;
    const endDate = nlpQuery.entities.dateRange?.end || sixtyDaysFromNow;

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      appointmentType: nlpQuery.entities.appointmentType,
      preferredTimeOfDay: nlpQuery.entities.timePreference,
      maxResults: nlpQuery.intent === 'next_available' ? 3 : 10
    };
  }

  /**
   * Generate clarification prompts for ambiguous queries
   */
  generateClarificationPrompt(nlpQuery: NLPQuery): string | null {
    if (nlpQuery.confidence < 0.7) {
      const missing = [];

      if (!nlpQuery.entities.dateRange && !nlpQuery.entities.relative_time) {
        missing.push("when you'd like to come in");
      }

      if (!nlpQuery.entities.appointmentType) {
        missing.push("what type of appointment you need");
      }

      if (missing.length > 0) {
        return `I'd be happy to help you find an appointment. Could you tell me ${missing.join(' and ')}?`;
      }
    }

    return null;
  }

  /**
   * Generate patient-friendly response templates
   */
  generatePatientFriendlyResponse(slots: any[], query: NLPQuery): string {
    if (!slots || slots.length === 0) {
      return "I'm sorry, but I don't see any available appointments for your requested time. Would you like me to check different days?";
    }

    const timePreference = query.entities.timePreference
      ? ` in the ${query.entities.timePreference}`
      : '';

    if (slots.length === 1) {
      const slot = slots[0];
      const date = this.formatDateForPatients(new Date(slot.datetime));
      const time = this.formatTimeForPatients(new Date(slot.datetime));
      return `I found an appointment available${timePreference} on ${date} at ${time}. Would this work for you?`;
    }

    // Limit to 3 options for patients
    const limitedSlots = slots.slice(0, 3);
    const options = limitedSlots.map(slot => {
      const date = this.formatDateForPatients(new Date(slot.datetime));
      const time = this.formatTimeForPatients(new Date(slot.datetime));
      return `${date} at ${time}`;
    }).join(', ');

    return `I have a few appointments available${timePreference}. You could come in on ${options}. Which one would work best for you?`;
  }

  /**
   * Format date in patient-friendly format
   */
  private formatDateForPatients(date: Date): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'today';
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'tomorrow';
    }

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Format time in patient-friendly format (no military time)
   */
  private formatTimeForPatients(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');

    // Add context for clarity
    let timeContext = '';
    if (hours < 12) {
      timeContext = ' in the morning';
    } else if (hours < 17) {
      timeContext = ' in the afternoon';
    } else {
      timeContext = ' in the evening';
    }

    return `${displayHours}:${displayMinutes} ${ampm}${timeContext}`;
  }
}