/**
 * Natural Language Response Generator for Appointment Availability
 * 
 * Creates elderly-friendly, conversational responses for
 * appointment availability queries
 */

import { TimeSlot } from './availability-service';

interface ResponseOptions {
  includeProvider?: boolean;
  includeInstructions?: boolean;
  confirmationStyle?: 'simple' | 'detailed';
  maxOptions?: number;
}

export class AvailabilityResponseGenerator {
  /**
   * Generate a natural language response for available slots
   */
  generateAvailabilityResponse(
    slots: TimeSlot[],
    queryContext: string,
    options: ResponseOptions = {}
  ): string {
    const {
      includeProvider = true,
      includeInstructions = true,
      confirmationStyle = 'simple',
      maxOptions = 3
    } = options;

    if (slots.length === 0) {
      return this.generateNoAvailabilityResponse(queryContext);
    }

    // Limit to max options to avoid overwhelming elderly patients
    const slotsToPresent = slots.slice(0, maxOptions);
    
    let response = this.generateOpeningPhrase(slotsToPresent.length, queryContext);
    
    // Present each slot in a clear, elderly-friendly format
    slotsToPresent.forEach((slot, index) => {
      response += this.formatSlotOption(slot, index + 1, includeProvider);
    });

    if (includeInstructions) {
      response += this.generateInstructions(slotsToPresent.length);
    }

    return response;
  }

  /**
   * Generate opening phrase based on availability
   */
  private generateOpeningPhrase(slotCount: number, queryContext: string): string {
    const phrases = [
      `I found ${slotCount} available appointment${slotCount > 1 ? 's' : ''} for you. `,
      `Good news! I have ${slotCount} time${slotCount > 1 ? 's' : ''} available. `,
      `I can offer you ${slotCount} appointment option${slotCount > 1 ? 's' : ''}. `
    ];

    // Add context-specific additions
    if (queryContext.toLowerCase().includes('soon') || queryContext.toLowerCase().includes('urgent')) {
      phrases[0] = `I found ${slotCount} appointment${slotCount > 1 ? 's' : ''} coming up soon. `;
    } else if (queryContext.toLowerCase().includes('morning')) {
      phrases[0] = `I found ${slotCount} morning appointment${slotCount > 1 ? 's' : ''} for you. `;
    } else if (queryContext.toLowerCase().includes('afternoon')) {
      phrases[0] = `I found ${slotCount} afternoon appointment${slotCount > 1 ? 's' : ''} for you. `;
    }

    return phrases[0];
  }

  /**
   * Format a single slot option in elderly-friendly language
   */
  private formatSlotOption(slot: TimeSlot, optionNumber: number, includeProvider: boolean): string {
    const date = new Date(slot.datetime);
    
    // Format day of week and date
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    
    // Format time in 12-hour format
    const time = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    // Build the response
    let response = `\n${optionNumber}. ${dayName}, ${monthDay} at ${time}`;
    
    if (includeProvider && slot.practitioner) {
      response += ` with ${slot.practitioner}`;
    }

    // Add appointment type context
    if (slot.appointmentType === 'routine') {
      response += ` for a complete eye exam`;
    } else if (slot.appointmentType === 'follow-up') {
      response += ` for your follow-up visit`;
    } else if (slot.appointmentType === 'urgent') {
      response += ` for an urgent care visit`;
    }

    response += '.';
    return response;
  }

  /**
   * Generate instructions for next steps
   */
  private generateInstructions(slotCount: number): string {
    const instructions = [
      '\n\nWould you like to book one of these times? Just tell me which one works best for you.',
      '\n\nTo schedule, just say the number of your preferred time, or tell me if you\'d like to hear different options.',
      '\n\nWhich appointment time would work best for you? You can say the number or ask for other times.'
    ];

    if (slotCount === 1) {
      return '\n\nWould you like to book this appointment? Just say yes to confirm.';
    }

    return instructions[0];
  }

  /**
   * Generate response when no availability is found
   */
  private generateNoAvailabilityResponse(queryContext: string): string {
    let response = "I'm sorry, I don't see any available appointments ";
    
    // Add context-specific information
    if (queryContext.toLowerCase().includes('today')) {
      response += "for today. ";
    } else if (queryContext.toLowerCase().includes('tomorrow')) {
      response += "for tomorrow. ";
    } else if (queryContext.toLowerCase().includes('week')) {
      response += "for the time period you requested. ";
    } else {
      response += "that match your preferences. ";
    }

    // Offer alternatives
    response += "Would you like me to check for appointments ";
    
    const alternatives = [
      "on different days?",
      "with another provider?",
      "at a different time of day?",
      "next week instead?"
    ];

    // Pick most relevant alternative based on context
    if (queryContext.toLowerCase().includes('morning')) {
      response += "in the afternoon instead?";
    } else if (queryContext.toLowerCase().includes('afternoon')) {
      response += "in the morning instead?";
    } else if (queryContext.toLowerCase().includes('specific provider')) {
      response += alternatives[1];
    } else {
      response += alternatives[0];
    }

    return response;
  }

  /**
   * Generate confirmation response for booking
   */
  generateBookingConfirmation(slot: TimeSlot, patientName: string): string {
    const date = new Date(slot.datetime);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const time = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    let response = `Perfect! I've scheduled your appointment for ${dayName}, ${monthDay} at ${time}`;
    
    if (slot.practitioner) {
      response += ` with ${slot.practitioner}`;
    }
    
    response += `. `;

    // Add reminders
    response += `\n\nPlease remember to:\n`;
    response += `• Bring your insurance card and photo ID\n`;
    response += `• Arrive 15 minutes early for paperwork\n`;
    
    if (slot.appointmentType === 'routine') {
      response += `• Bring your current glasses or contact lenses\n`;
      response += `• We may dilate your eyes, so consider bringing sunglasses`;
    }

    response += `\n\nWe'll call you the day before to confirm. Is there anything else I can help you with?`;

    return response;
  }

  /**
   * Generate response for clarification needs
   */
  generateClarificationResponse(context: string): string {
    const clarifications: Record<string, string> = {
      'appointment_type': "What type of appointment do you need? A routine eye exam, a follow-up visit, or something urgent?",
      'time_preference': "Do you prefer morning or afternoon appointments?",
      'date_range': "When would you like to come in? You can say things like 'next week' or 'Monday morning'.",
      'provider': "Would you like to see a specific doctor, or would any available provider work for you?"
    };

    return clarifications[context] || "Could you tell me more about when you'd like to schedule your appointment?";
  }

  /**
   * Generate response for multiple options with same day
   */
  generateSameDayOptions(slots: TimeSlot[]): string {
    if (slots.length === 0) return '';

    const date = new Date(slots[0].datetime);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    let response = `I have several times available on ${dayName}, ${monthDay}:\n`;

    slots.forEach((slot, index) => {
      const time = new Date(slot.datetime).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      response += `\n${index + 1}. ${time}`;
      if (slot.practitioner) {
        response += ` with ${slot.practitioner}`;
      }
    });

    response += '\n\nWhich time works best for you?';
    return response;
  }

  /**
   * Generate fallback message for complex scheduling
   */
  generateHumanHandoffMessage(): string {
    return "I understand you have specific scheduling needs. Let me connect you with one of our scheduling specialists who can better assist you. Please hold for just a moment.";
  }
}