/**
 * Fallback Response Service
 * Handles unrecognized intents with helpful alternatives
 */

import {
  IntentCategory,
  FallbackConfig,
  NLUResult
} from '../types';
import { logger } from '../utils/logger';

export class FallbackResponseService {
  private fallbackConfigs: FallbackConfig[];

  constructor() {
    this.fallbackConfigs = this.initializeFallbackConfigs();
  }

  /**
   * Generate fallback response for unrecognized intent
   */
  generateFallbackResponse(result: NLUResult): string {
    // Check confidence level
    if (result.intent.confidence < 0.3) {
      return this.getCompletelyLostResponse();
    }

    // Check if we have a partial match
    if (result.intent.category === IntentCategory.UNKNOWN) {
      return this.getClarificationResponse(result.utterance);
    }

    // Low confidence in known category
    return this.getLowConfidenceResponse(result.intent.category);
  }

  /**
   * Get response for completely unrecognized input
   */
  private getCompletelyLostResponse(): string {
    const responses = [
      "I'm sorry, I didn't quite understand that. Could you please rephrase your question?",
      "I'm having trouble understanding. Let me help you with some options:",
      "I didn't catch that. Are you asking about an appointment, insurance, or practice information?",
      "Sorry, I need a bit more clarity. What can I help you with today?"
    ];

    // Add helpful menu
    const menu = this.getHelpfulMenu();
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return `${randomResponse}\n\n${menu}`;
  }

  /**
   * Get clarification response
   */
  private getClarificationResponse(utterance: string): string {
    const lower = utterance.toLowerCase();

    // Try to guess intent from keywords
    if (lower.includes('appointment') || lower.includes('schedule') || lower.includes('book')) {
      return this.getSuggestedResponse(IntentCategory.APPOINTMENT);
    }

    if (lower.includes('insurance') || lower.includes('coverage') || lower.includes('pay')) {
      return this.getSuggestedResponse(IntentCategory.INSURANCE);
    }

    if (lower.includes('hours') || lower.includes('location') || lower.includes('address')) {
      return this.getSuggestedResponse(IntentCategory.PRACTICE_INFO);
    }

    if (lower.includes('medication') || lower.includes('prescription') || lower.includes('refill')) {
      return this.getSuggestedResponse(IntentCategory.PRESCRIPTION);
    }

    // Default clarification
    return `I think you're asking about ${this.guessTopicFromKeywords(lower)}, but I need more details.

Could you tell me more specifically what you need help with?

${this.getHelpfulMenu()}`;
  }

  /**
   * Get low confidence response for known category
   */
  private getLowConfidenceResponse(category: IntentCategory): string {
    const responses: Record<IntentCategory, string> = {
      [IntentCategory.APPOINTMENT]:
        "I understand you have a question about appointments. Are you trying to:\n" +
        "• Schedule a new appointment?\n" +
        "• Reschedule an existing appointment?\n" +
        "• Cancel an appointment?\n" +
        "• Check appointment availability?",

      [IntentCategory.PRACTICE_INFO]:
        "I can help with practice information. Are you asking about:\n" +
        "• Our office hours?\n" +
        "• Our location and directions?\n" +
        "• Parking information?\n" +
        "• Our services?",

      [IntentCategory.INSURANCE]:
        "I can help with insurance questions. Do you need to know:\n" +
        "• Which insurance plans we accept?\n" +
        "• Your coverage details?\n" +
        "• Copayment amounts?\n" +
        "• How to verify benefits?",

      [IntentCategory.PRESCRIPTION]:
        "I can assist with prescription needs. Are you:\n" +
        "• Requesting a prescription refill?\n" +
        "• Asking about your current prescription?\n" +
        "• Needing to order contacts?\n" +
        "• Having issues with medication?",

      [IntentCategory.EMERGENCY]:
        "This sounds like it might be urgent. If you're experiencing:\n" +
        "• Sudden vision loss\n" +
        "• Severe eye pain\n" +
        "• Eye injury\n" +
        "Please say 'emergency' or I can connect you with our staff immediately.",

      [IntentCategory.GENERAL]:
        "I'm here to help. You can ask me about:\n" +
        "• Scheduling appointments\n" +
        "• Practice information\n" +
        "• Insurance coverage\n" +
        "• Prescription refills\n" +
        "Or say 'speak to someone' to talk to our staff.",

      [IntentCategory.UNKNOWN]:
        this.getCompletelyLostResponse()
    };

    return responses[category] || this.getCompletelyLostResponse();
  }

  /**
   * Get suggested response based on category
   */
  private getSuggestedResponse(category: IntentCategory): string {
    const suggestions: Record<IntentCategory, string> = {
      [IntentCategory.APPOINTMENT]:
        "It sounds like you're asking about appointments. You can say things like:\n" +
        "• 'I need to schedule an eye exam'\n" +
        "• 'What times are available this week?'\n" +
        "• 'I need to reschedule my appointment'",

      [IntentCategory.PRACTICE_INFO]:
        "For practice information, you can ask:\n" +
        "• 'What are your hours?'\n" +
        "• 'Where are you located?'\n" +
        "• 'Do you have parking?'",

      [IntentCategory.INSURANCE]:
        "For insurance questions, try asking:\n" +
        "• 'Do you accept Medicare?'\n" +
        "• 'What insurance do you take?'\n" +
        "• 'What's my copay?'",

      [IntentCategory.PRESCRIPTION]:
        "For prescriptions, you can say:\n" +
        "• 'I need a refill on my eye drops'\n" +
        "• 'Can I order new contacts?'\n" +
        "• 'What's my prescription?'",

      [IntentCategory.EMERGENCY]:
        "If this is an emergency, please say 'emergency' or 'urgent' and I'll connect you immediately.",

      [IntentCategory.GENERAL]:
        this.getHelpfulMenu(),

      [IntentCategory.UNKNOWN]:
        this.getHelpfulMenu()
    };

    return suggestions[category] || this.getHelpfulMenu();
  }

  /**
   * Get helpful menu of options
   */
  private getHelpfulMenu(): string {
    return `Here's what I can help you with:

1. Appointments - Say "appointment" or "schedule"
2. Practice Information - Say "hours" or "location"
3. Insurance - Say "insurance" or "coverage"
4. Prescriptions - Say "prescription" or "refill"
5. Speak to Staff - Say "talk to someone"

What would you like help with?`;
  }

  /**
   * Guess topic from keywords
   */
  private guessTopicFromKeywords(text: string): string {
    const topicKeywords = {
      'appointments': ['appointment', 'schedule', 'book', 'cancel', 'reschedule'],
      'practice information': ['hours', 'open', 'closed', 'location', 'address', 'parking'],
      'insurance': ['insurance', 'coverage', 'pay', 'cost', 'copay', 'medicare'],
      'prescriptions': ['prescription', 'medication', 'refill', 'drops', 'contacts'],
      'general help': []
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return topic;
      }
    }

    return 'general help';
  }

  /**
   * Initialize fallback configurations
   */
  private initializeFallbackConfigs(): FallbackConfig[] {
    return [
      {
        category: IntentCategory.APPOINTMENT,
        triggers: ['appointment', 'schedule', 'book', 'cancel'],
        response: this.getLowConfidenceResponse(IntentCategory.APPOINTMENT),
        suggestions: [
          'Schedule new appointment',
          'Reschedule existing',
          'Cancel appointment',
          'Check availability'
        ],
        escalationOption: true
      },
      {
        category: IntentCategory.PRACTICE_INFO,
        triggers: ['hours', 'location', 'address', 'parking'],
        response: this.getLowConfidenceResponse(IntentCategory.PRACTICE_INFO),
        suggestions: [
          'Office hours',
          'Location',
          'Parking info',
          'Services offered'
        ],
        escalationOption: false
      },
      {
        category: IntentCategory.INSURANCE,
        triggers: ['insurance', 'coverage', 'medicare', 'payment'],
        response: this.getLowConfidenceResponse(IntentCategory.INSURANCE),
        suggestions: [
          'Accepted insurance',
          'Coverage details',
          'Copayment info',
          'Verify benefits'
        ],
        escalationOption: true
      },
      {
        category: IntentCategory.PRESCRIPTION,
        triggers: ['prescription', 'medication', 'refill', 'drops'],
        response: this.getLowConfidenceResponse(IntentCategory.PRESCRIPTION),
        suggestions: [
          'Request refill',
          'Current prescription',
          'Order contacts',
          'Medication questions'
        ],
        escalationOption: true
      },
      {
        category: IntentCategory.EMERGENCY,
        triggers: ['emergency', 'urgent', 'pain', 'injury'],
        response: this.getLowConfidenceResponse(IntentCategory.EMERGENCY),
        suggestions: [],
        escalationOption: true
      }
    ];
  }

  /**
   * Get progressive disclosure response
   */
  getProgressiveResponse(
    attemptNumber: number,
    category: IntentCategory
  ): string {
    if (attemptNumber === 1) {
      // First attempt - brief clarification
      return `I'm not quite sure. Could you tell me more about what you need?`;
    } else if (attemptNumber === 2) {
      // Second attempt - offer categories
      return this.getLowConfidenceResponse(category);
    } else if (attemptNumber === 3) {
      // Third attempt - offer menu
      return this.getHelpfulMenu();
    } else {
      // Final attempt - offer human help
      return `I'm having trouble understanding your needs. Would you like me to connect you with our staff who can better assist you?`;
    }
  }

  /**
   * Generate error recovery response
   */
  generateErrorResponse(errorType: string): string {
    const errorResponses: Record<string, string> = {
      'timeout': "I'm sorry, the system is taking longer than expected. Let me try again or connect you with someone who can help.",
      'service_unavailable': "I'm having technical difficulties at the moment. Would you like me to connect you with our staff?",
      'invalid_input': "I didn't quite catch that. Could you please speak more clearly or rephrase your question?",
      'system_error': "I'm experiencing a technical issue. Let me connect you with our staff to ensure you get the help you need.",
      'default': "Something went wrong on my end. Let me get someone to help you right away."
    };

    return errorResponses[errorType] || errorResponses.default;
  }

  /**
   * Check if escalation is suggested
   */
  shouldSuggestEscalation(
    result: NLUResult,
    attemptCount: number
  ): boolean {
    // Always escalate emergencies
    if (result.intent.category === IntentCategory.EMERGENCY) {
      return true;
    }

    // Escalate after multiple failed attempts
    if (attemptCount >= 3) {
      return true;
    }

    // Escalate very low confidence
    if (result.intent.confidence < 0.3) {
      return true;
    }

    // Check if category suggests escalation
    const config = this.fallbackConfigs.find(
      c => c.category === result.intent.category
    );

    return config?.escalationOption || false;
  }
}