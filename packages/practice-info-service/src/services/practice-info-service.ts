import { createLogger } from '@ai-voice-agent/shared-utils';
import {
  PracticeInfoResponseDTO,
  ResponseGenerationContext,
  ElderlyFriendlyConfig,
} from '../types';
import { dynamicResponseService } from './dynamic-response-service';
import { practiceInfoRepository } from './repository';
import { cacheService } from './cache';

const logger = createLogger('practice-info-service');

// GPT-4 integration for natural language response generation
interface GPTResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class PracticeInfoService {
  private openaiApiKey: string;
  private gptModel: string = 'gpt-4-turbo-preview';

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    if (!this.openaiApiKey) {
      logger.warn('OpenAI API key not configured - GPT-4 responses will be disabled');
    }
  }

  /**
   * Initialize cache and repository connections
   */
  async initialize(): Promise<void> {
    try {
      await cacheService.connect();
      logger.info('Practice info service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize practice info service', { error });
      throw error;
    }
  }

  /**
   * Process natural language practice information query
   */
  async processNaturalLanguageQuery(
    query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    try {
      logger.info('Processing natural language query', { query, context: context.elderlyFriendlyMode });

      // Classify the intent of the query
      const intent = await this.classifyQueryIntent(query);
      logger.debug('Query intent classified', { intent, query });

      // Generate appropriate response based on intent
      let response: string;

      switch (intent) {
        case 'business_hours':
          response = await this.handleBusinessHoursQuery(query, context);
          break;
        case 'location_directions':
          response = await this.handleLocationQuery(query, context);
          break;
        case 'insurance_coverage':
          response = await this.handleInsuranceQuery(query, context);
          break;
        case 'appointment_preparation':
          response = await this.handlePreparationQuery(query, context);
          break;
        case 'practice_policies':
          response = await this.handlePolicyQuery(query, context);
          break;
        case 'general_information':
          response = await this.handleGeneralInfoQuery(query, context);
          break;
        case 'contact_information':
          response = await this.handleContactQuery(query, context);
          break;
        default:
          response = await this.handleUnknownQuery(query, context);
      }

      // Enhance response with GPT-4 if available
      if (this.openaiApiKey && context.elderlyFriendlyMode) {
        response = await this.enhanceResponseWithGPT4(response, query, context);
      }

      return response;
    } catch (error) {
      logger.error('Failed to process natural language query', { error, query });
      return this.generateErrorResponse(context);
    }
  }

  /**
   * Classify the intent of user query using keyword matching and patterns
   */
  private async classifyQueryIntent(query: string): Promise<string> {
    const lowerQuery = query.toLowerCase();

    // Business hours patterns
    if (this.matchesPatterns(lowerQuery, [
      'hours', 'open', 'closed', 'when', 'time', 'schedule',
      'what time', 'are you open', 'do you close', 'business hours'
    ])) {
      return 'business_hours';
    }

    // Location and directions patterns
    if (this.matchesPatterns(lowerQuery, [
      'where', 'location', 'address', 'directions', 'how to get',
      'parking', 'find you', 'located', 'office'
    ])) {
      return 'location_directions';
    }

    // Insurance patterns
    if (this.matchesPatterns(lowerQuery, [
      'insurance', 'coverage', 'accept', 'plan', 'medicare',
      'medicaid', 'copay', 'deductible', 'benefits'
    ])) {
      return 'insurance_coverage';
    }

    // Preparation patterns
    if (this.matchesPatterns(lowerQuery, [
      'prepare', 'preparation', 'bring', 'before', 'appointment',
      'dilation', 'eye drops', 'what to', 'need to'
    ])) {
      return 'appointment_preparation';
    }

    // Policy patterns
    if (this.matchesPatterns(lowerQuery, [
      'policy', 'cancel', 'cancellation', 'reschedule', 'fee',
      'late', 'early', 'payment', 'billing'
    ])) {
      return 'practice_policies';
    }

    // Contact patterns
    if (this.matchesPatterns(lowerQuery, [
      'phone', 'number', 'call', 'contact', 'reach', 'speak',
      'talk to', 'staff', 'receptionist'
    ])) {
      return 'contact_information';
    }

    // Default to general information
    return 'general_information';
  }

  /**
   * Check if query matches any of the given patterns
   */
  private matchesPatterns(query: string, patterns: string[]): boolean {
    return patterns.some(pattern => query.includes(pattern));
  }

  /**
   * Handle business hours queries
   */
  private async handleBusinessHoursQuery(
    _query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    const currentStatus = await dynamicResponseService.getCurrentStatus();
    const weeklyHours = await dynamicResponseService.getWeeklyHours();
    
    return dynamicResponseService.generateBusinessHoursResponse(
      currentStatus,
      weeklyHours,
      context
    );
  }

  /**
   * Handle location and directions queries
   */
  private async handleLocationQuery(
    _query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    return await dynamicResponseService.generateLocationResponse(context);
  }

  /**
   * Handle insurance coverage queries
   */
  private async handleInsuranceQuery(
    query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    // Extract insurance company name from query if mentioned
    const insuranceQuery = this.extractInsuranceFromQuery(query);
    return await dynamicResponseService.generateInsuranceResponse(insuranceQuery, context);
  }

  /**
   * Extract insurance company name from query
   */
  private extractInsuranceFromQuery(query: string): string | undefined {
    const lowerQuery = query.toLowerCase();
    const insuranceCompanies = [
      'aetna', 'blue cross', 'bluecross', 'cigna', 'humana',
      'medicare', 'medicaid', 'united healthcare', 'anthem',
      'kaiser', 'molina', 'wellcare', 'tricare'
    ];

    for (const company of insuranceCompanies) {
      if (lowerQuery.includes(company)) {
        return company;
      }
    }

    return undefined;
  }

  /**
   * Handle appointment preparation queries
   */
  private async handlePreparationQuery(
    query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    // Extract appointment type from query
    const appointmentType = this.extractAppointmentTypeFromQuery(query);
    
    if (appointmentType) {
      return await dynamicResponseService.generatePreparationResponse(appointmentType, context);
    } else {
      // General preparation information
      return "For specific preparation instructions, I'll need to know what type of appointment you have. Are you coming in for a routine eye exam, a follow-up visit, or something else? You can also call our office and our staff will provide detailed preparation instructions.";
    }
  }

  /**
   * Extract appointment type from query
   */
  private extractAppointmentTypeFromQuery(query: string): string | undefined {
    const lowerQuery = query.toLowerCase();
    const appointmentTypes = [
      'routine', 'annual', 'comprehensive', 'follow-up', 'check-up',
      'dilation', 'dilated', 'contact', 'glasses', 'vision',
      'glaucoma', 'cataract', 'retina', 'diabetic'
    ];

    for (const type of appointmentTypes) {
      if (lowerQuery.includes(type)) {
        // Map common terms to standard appointment types
        if (['routine', 'annual', 'comprehensive', 'check-up'].includes(type)) {
          return 'routine';
        }
        if (['follow-up'].includes(type)) {
          return 'follow-up';
        }
        if (['dilation', 'dilated'].includes(type)) {
          return 'comprehensive';
        }
        return type;
      }
    }

    return undefined;
  }

  /**
   * Handle practice policy queries
   */
  private async handlePolicyQuery(
    query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    try {
      // Get policies that should be included in voice responses
      const policies = await practiceInfoRepository.getVoiceResponsePolicies();
      
      if (policies.length === 0) {
        return "For information about our practice policies, please call our office and our staff will be happy to help you.";
      }

      const { elderlyFriendlyMode, config } = context;
      const elderlyConfig = elderlyFriendlyMode ? config : {
        maxInformationChunks: 3,
        confirmationPrompts: true,
        useStructuredLanguage: true,
      } as ElderlyFriendlyConfig;

      // Find relevant policies based on query
      const relevantPolicies = this.findRelevantPolicies(query, policies);
      
      if (relevantPolicies.length === 0) {
        return "I don't have specific information about that policy. Please call our office and our staff can provide you with detailed policy information.";
      }

      let response = "";
      const policiesToInclude = relevantPolicies.slice(0, elderlyConfig.maxInformationChunks);

      policiesToInclude.forEach((policy, index) => {
        if (index > 0) {
          response += elderlyConfig.useStructuredLanguage ? ' Also, ' : ' ';
        }
        
        response += policy.voiceSummary || policy.policyContent;
      });

      if (elderlyConfig.confirmationPrompts) {
        response += ' Do you have any other questions about our policies?';
      }

      return response;
    } catch (error) {
      logger.error('Failed to handle policy query', { error, query });
      return "I apologize, but I'm having trouble accessing our policy information right now. Please call our office for assistance.";
    }
  }

  /**
   * Find relevant policies based on query content
   */
  private findRelevantPolicies(query: string, policies: any[]): any[] {
    const lowerQuery = query.toLowerCase();
    
    return policies.filter(policy => {
      const policyText = `${policy.policyName} ${policy.policyContent} ${policy.policyCategory}`.toLowerCase();
      
      // Check for direct keyword matches
      return this.matchesPatterns(lowerQuery, [
        policy.policyCategory.toLowerCase(),
        policy.policyName.toLowerCase()
      ]) || this.hasCommonWords(lowerQuery, policyText);
    });
  }

  /**
   * Check if query and policy text have common meaningful words
   */
  private hasCommonWords(query: string, policyText: string): boolean {
    const queryWords = query.split(' ').filter(word => word.length > 3);
    const policyWords = policyText.split(' ').filter(word => word.length > 3);
    
    const commonWords = queryWords.filter(word => policyWords.includes(word));
    return commonWords.length >= 2;
  }

  /**
   * Handle general information queries
   */
  private async handleGeneralInfoQuery(
    query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    try {
      const practiceInfo = await dynamicResponseService.generateComprehensivePracticeInfo(context);
      
      const { elderlyFriendlyMode, config } = context;
      const elderlyConfig = elderlyFriendlyMode ? config : {
        maxInformationChunks: 3,
        confirmationPrompts: true,
        useStructuredLanguage: true,
      } as ElderlyFriendlyConfig;

      let response = `${practiceInfo.practiceInfo.name} provides comprehensive eye care services. `;

      if (practiceInfo.currentStatus.isCurrentlyOpen) {
        response += `We're currently open until ${practiceInfo.currentStatus.nextOpenTime || 'closing time'}. `;
      } else {
        response += `We're currently closed. `;
      }

      response += `We're located at ${practiceInfo.practiceInfo.primaryLocation.addressLine1} in ${practiceInfo.practiceInfo.primaryLocation.city}. `;

      if (elderlyConfig.maxInformationChunks >= 2) {
        response += `Our phone number is ${this.formatPhoneForSpeech(practiceInfo.practiceInfo.phone)}. `;
      }

      if (elderlyConfig.confirmationPrompts) {
        response += 'What specific information can I help you with today?';
      }

      return response;
    } catch (error) {
      logger.error('Failed to handle general info query', { error, query });
      return this.generateErrorResponse(context);
    }
  }

  /**
   * Handle contact information queries
   */
  private async handleContactQuery(
    query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    try {
      const practiceConfig = await practiceInfoRepository.getPracticeConfiguration();
      
      if (!practiceConfig) {
        return this.generateErrorResponse(context);
      }

      const formattedPhone = this.formatPhoneForSpeech(practiceConfig.phoneNumber);
      let response = `You can reach us at ${formattedPhone}. `;

      const currentStatus = await dynamicResponseService.getCurrentStatus();
      if (currentStatus.isCurrentlyOpen) {
        response += "We're currently open and available to take your call. ";
      } else {
        response += `We're currently closed. ${currentStatus.nextOpenDay ? `We'll be open again ${currentStatus.nextOpenDay} at ${currentStatus.nextOpenTime}. ` : ''}`;
      }

      const { elderlyFriendlyMode, config } = context;
      if (elderlyFriendlyMode && config.confirmationPrompts) {
        response += 'Would you like me to repeat our phone number?';
      }

      return response;
    } catch (error) {
      logger.error('Failed to handle contact query', { error, query });
      return this.generateErrorResponse(context);
    }
  }

  /**
   * Handle unknown or unclear queries
   */
  private async handleUnknownQuery(
    _query: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    const { elderlyFriendlyMode, config } = context;
    const elderlyConfig = elderlyFriendlyMode ? config : {
      confirmationPrompts: true,
      useStructuredLanguage: true,
    } as ElderlyFriendlyConfig;

    let response = "I'm not sure I understand exactly what you're looking for. ";

    if (elderlyConfig.useStructuredLanguage) {
      response += "I can help you with information about our hours, location, insurance coverage, or appointment preparation. ";
    }

    if (elderlyConfig.confirmationPrompts) {
      response += "Could you tell me more specifically what information you need, or would you prefer to speak with one of our staff members?";
    }

    return response;
  }

  /**
   * Format phone number for clear speech
   */
  private formatPhoneForSpeech(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `(${digits.substr(0, 3)}) ${digits.substr(3, 3)}-${digits.substr(6, 4)}`;
    }
    
    return phoneNumber;
  }

  /**
   * Enhance response with GPT-4 for elderly-friendly phrasing
   */
  private async enhanceResponseWithGPT4(
    response: string,
    originalQuery: string,
    context: ResponseGenerationContext
  ): Promise<string> {
    try {
      if (!this.openaiApiKey) {
        return response;
      }

      const prompt = this.buildGPT4EnhancementPrompt(response, originalQuery, context);
      
      const gptResponse = await this.callGPT4(prompt);
      
      if (gptResponse && gptResponse.trim().length > 0) {
        logger.debug('GPT-4 enhanced response generated', { originalLength: response.length, enhancedLength: gptResponse.length });
        return gptResponse.trim();
      }
      
      return response;
    } catch (error) {
      logger.error('Failed to enhance response with GPT-4', { error });
      return response; // Fallback to original response
    }
  }

  /**
   * Build prompt for GPT-4 enhancement
   */
  private buildGPT4EnhancementPrompt(
    response: string,
    originalQuery: string,
    context: ResponseGenerationContext
  ): string {
    const { config } = context;
    
    return `You are helping an elderly patient (65+ years old) who called an eye care practice. 

CONTEXT:
- Patient asked: "${originalQuery}"
- Current response: "${response}"

REQUIREMENTS:
- Speech speed: ${config.speechSpeedWpm} words per minute (add natural pauses)
- Keep information chunks to maximum ${config.maxInformationChunks} concepts
- Use clear, simple language without medical jargon
- Be patient and reassuring
- Include confirmation prompt if appropriate
- Maintain all factual information from the original response

ELDERLY-FRIENDLY GUIDELINES:
- Speak slower with natural pauses
- Use "First," "Second," "Finally" for multiple points
- Avoid complex sentences
- Be warm and patient in tone
- Include gentle confirmation checks

Please rewrite the response to be more elderly-friendly while keeping all the important information:`;
  }

  /**
   * Call GPT-4 API
   */
  private async callGPT4(prompt: string): Promise<string | null> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.gptModel,
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant helping to create elderly-friendly responses for a medical practice phone system. Focus on clarity, patience, and warmth.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent, professional responses
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`GPT-4 API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as GPTResponse;
      
      if (data.choices && data.choices.length > 0) {
        return data.choices[0]?.message?.content || null;
      }
      
      return null;
    } catch (error) {
      logger.error('GPT-4 API call failed', { error });
      return null;
    }
  }

  /**
   * Generate error response
   */
  private generateErrorResponse(context: ResponseGenerationContext): string {
    const { elderlyFriendlyMode, config } = context;
    
    let response = "I apologize, but I'm having trouble accessing that information right now. ";
    
    if (elderlyFriendlyMode && config.confirmationPrompts) {
      response += "Would you like me to transfer you to one of our staff members who can help you directly?";
    } else {
      response += "Please call our office and our staff will be happy to assist you.";
    }
    
    return response;
  }

  /**
   * Get comprehensive practice information (for admin or integration use)
   */
  async getComprehensivePracticeInfo(): Promise<PracticeInfoResponseDTO> {
    const context: ResponseGenerationContext = {
      currentTime: new Date(),
      elderlyFriendlyMode: false,
      config: {
        speechSpeedWpm: 180,
        pauseDurationMs: 500,
        confirmationPrompts: false,
        repetitionAvailable: true,
        maxInformationChunks: 5,
        useStructuredLanguage: false,
      },
      previousQuestions: [],
    };

    return await dynamicResponseService.generateComprehensivePracticeInfo(context);
  }

  /**
   * Clear all caches (for admin use)
   */
  async clearCaches(): Promise<void> {
    await cacheService.clearAllCaches();
    logger.info('All practice information caches cleared');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      await cacheService.disconnect();
      logger.info('Practice info service shut down gracefully');
    } catch (error) {
      logger.error('Error during practice info service shutdown', { error });
    }
  }
}

// Singleton instance
export const practiceInfoService = new PracticeInfoService();