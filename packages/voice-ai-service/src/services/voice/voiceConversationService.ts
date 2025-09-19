import { createLogger } from '@ai-voice-agent/shared-utils';
import { PracticeHoursService } from '../practice/practiceHoursService';

const logger = createLogger('voice-conversation-service');

export interface VoiceResponse {
  message: string;
  expectsMoreInput: boolean;
  intent?: string;
  confidence?: number;
}

export class VoiceConversationService {
  private practiceHoursService: PracticeHoursService;

  constructor() {
    this.practiceHoursService = new PracticeHoursService();
  }

  /**
   * Process voice input and generate appropriate response
   * Focused on basic practice hours inquiry as per Story 1.4
   */
  async processInput(speechText: string, callId: string): Promise<VoiceResponse> {
    try {
      logger.info('Processing voice input', {
        callId,
        text: speechText.substring(0, 100),
        textLength: speechText.length
      });

      const normalizedInput = speechText.toLowerCase().trim();

      // Detect practice hours inquiry intent
      if (this.isPracticeHoursInquiry(normalizedInput)) {
        const response = await this.practiceHoursService.getElderlyFriendlyResponse();
        return {
          message: response,
          expectsMoreInput: false,
          intent: 'practice_hours',
          confidence: 0.9
        };
      }

      // Detect greeting
      if (this.isGreeting(normalizedInput)) {
        return {
          message: "Hello! Thank you for calling Capitol Eye Care. I can help you with information about our office hours, location, and general questions. How may I assist you today?",
          expectsMoreInput: true,
          intent: 'greeting',
          confidence: 0.8
        };
      }

      // Detect goodbye/thank you
      if (this.isGoodbye(normalizedInput)) {
        return {
          message: "Thank you for calling Capitol Eye Care. Have a wonderful day and take care of your eyes!",
          expectsMoreInput: false,
          intent: 'goodbye',
          confidence: 0.8
        };
      }

      // Detect confusion or need for help
      if (this.needsHelp(normalizedInput)) {
        return {
          message: "I understand you may need assistance. I can help you with our office hours, location, insurance information, or connect you with our staff. What would you like to know?",
          expectsMoreInput: true,
          intent: 'help_request',
          confidence: 0.7
        };
      }

      // Default fallback response (elderly-friendly)
      return {
        message: "I want to make sure I understand you correctly. Could you please tell me what you'd like to know? I can help with our office hours, location, or general information about our services.",
        expectsMoreInput: true,
        intent: 'clarification_needed',
        confidence: 0.5
      };

    } catch (error) {
      logger.error('Error processing voice input', {
        error: error instanceof Error ? error.message : 'Unknown error',
        callId,
        speechText: speechText.substring(0, 50)
      });

      return {
        message: "I apologize, but I'm having trouble processing your request right now. Let me connect you with our staff who can assist you better.",
        expectsMoreInput: false,
        intent: 'system_error',
        confidence: 1.0
      };
    }
  }

  /**
   * Check if input is asking about practice hours
   */
  private isPracticeHoursInquiry(input: string): boolean {
    const hoursKeywords = [
      'open', 'hours', 'close', 'closed', 'when', 'time',
      'schedule', 'available', 'what time', 'operating hours',
      'business hours', 'office hours', 'are you open'
    ];

    return hoursKeywords.some(keyword => input.includes(keyword));
  }

  /**
   * Check if input is a greeting
   */
  private isGreeting(input: string): boolean {
    const greetingKeywords = [
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 
      'good evening', 'greetings'
    ];

    return greetingKeywords.some(keyword => input.includes(keyword));
  }

  /**
   * Check if input is a goodbye/thank you
   */
  private isGoodbye(input: string): boolean {
    const goodbyeKeywords = [
      'bye', 'goodbye', 'thank you', 'thanks', 'have a good',
      'see you', 'that\'s all', 'that helps', 'appreciate'
    ];

    return goodbyeKeywords.some(keyword => input.includes(keyword));
  }

  /**
   * Check if user needs help or is confused
   */
  private needsHelp(input: string): boolean {
    const helpKeywords = [
      'help', 'confused', 'don\'t understand', 'not sure',
      'what can you', 'what do you', 'assistance', 'support'
    ];

    return helpKeywords.some(keyword => input.includes(keyword));
  }


}

export default VoiceConversationService;