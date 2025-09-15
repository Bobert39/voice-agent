import OpenAI from 'openai';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('intent-recognition-service');

export interface IntentResult {
  intent: string;
  confidence: number;
  entities: ExtractedEntity[];
  sentiment?: number;
  emotionalMarkers?: string[];
  requiresFollowUp: boolean;
  context?: IntentContext;
}

export interface ExtractedEntity {
  type: 'appointment_type' | 'doctor_name' | 'insurance_provider' | 'date' | 'time' | 'date_range' | 'time_preference' | 'relative_time' | 'symptom' | 'medication' | 'location' | 'confirmation_number' | 'phone_number' | 'date_of_birth' | 'patient_name' | 'modification_type' | 'other';
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  normalized?: string;
}

export interface IntentContext {
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  topic: string;
  category: 'appointment' | 'information' | 'emergency' | 'billing' | 'general';
  requiresVerification: boolean;
  suggestedResponses: string[];
}

interface NLUConfig {
  openaiApiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  confidenceThreshold: number;
  fallbackIntent: string;
}

export class IntentRecognitionService {
  private openai: OpenAI;
  private config: NLUConfig;

  // Define medical practice intents
  private readonly INTENTS = {
    // Greeting and conversation management
    'greeting': {
      description: 'Patient greeting or starting conversation',
      examples: ['hello', 'hi', 'good morning', 'I\'m calling about'],
      category: 'general',
      urgency: 'low'
    },
    'goodbye': {
      description: 'Patient ending conversation',
      examples: ['goodbye', 'thank you', 'that\'s all', 'bye'],
      category: 'general',
      urgency: 'low'
    },

    // Appointment-related intents
    'appointment_request': {
      description: 'Request to schedule a new appointment',
      examples: ['schedule appointment', 'book appointment', 'I need to see doctor', 'make appointment'],
      category: 'appointment',
      urgency: 'medium'
    },
    'appointment_reschedule': {
      description: 'Request to change existing appointment',
      examples: ['reschedule appointment', 'change appointment', 'move my appointment'],
      category: 'appointment',
      urgency: 'medium'
    },
    'appointment_cancel': {
      description: 'Request to cancel appointment',
      examples: ['cancel appointment', 'cancel my appointment', 'I can\'t make it'],
      category: 'appointment',
      urgency: 'medium'
    },
    'appointment_confirm': {
      description: 'Confirm appointment details',
      examples: ['confirm appointment', 'is my appointment still', 'check my appointment'],
      category: 'appointment',
      urgency: 'low'
    },
    'appointment_availability': {
      description: 'Check available appointment times',
      examples: ['when can I come in', 'what times are available', 'do you have any openings', 'next available appointment', 'availability next week'],
      category: 'appointment',
      urgency: 'medium'
    },
    'appointment_refinement': {
      description: 'Refine or modify appointment search',
      examples: ['do you have anything earlier', 'what about later', 'different time', 'another day', 'morning instead'],
      category: 'appointment',
      urgency: 'medium'
    },

    // Story 3.3: Appointment Management intents
    'appointment_lookup': {
      description: 'Find or look up existing appointments',
      examples: ['find my appointment', 'look up my appointment', 'check my appointment', 'what appointments do I have'],
      category: 'appointment',
      urgency: 'medium'
    },
    'appointment_modification': {
      description: 'General request to modify an appointment',
      examples: ['modify my appointment', 'change my appointment', 'update my appointment', 'I need to change something'],
      category: 'appointment',
      urgency: 'medium'
    },
    'appointment_type_change': {
      description: 'Request to change appointment type',
      examples: ['change to routine appointment', 'make it a follow-up', 'change appointment type'],
      category: 'appointment',
      urgency: 'medium'
    },
    'confirmation_number_inquiry': {
      description: 'Patient providing or asking about confirmation number',
      examples: ['my confirmation number is', 'confirmation number', 'I have confirmation'],
      category: 'appointment',
      urgency: 'medium'
    },
    'appointment_verification': {
      description: 'Patient providing information to verify appointment access',
      examples: ['my phone number is', 'my date of birth', 'last name is', 'for verification'],
      category: 'appointment',
      urgency: 'medium'
    },

    // Information requests
    'hours_inquiry': {
      description: 'Ask about practice hours or availability',
      examples: ['what are your hours', 'when are you open', 'are you open today'],
      category: 'information',
      urgency: 'low'
    },
    'location_inquiry': {
      description: 'Ask about practice location or directions',
      examples: ['where are you located', 'what\'s your address', 'directions to office'],
      category: 'information',
      urgency: 'low'
    },
    'insurance_inquiry': {
      description: 'Ask about insurance coverage or billing',
      examples: ['do you take my insurance', 'insurance coverage', 'billing question'],
      category: 'billing',
      urgency: 'low'
    },
    'services_inquiry': {
      description: 'Ask about available services or treatments',
      examples: ['what services do you offer', 'eye exam', 'contact lens fitting'],
      category: 'information',
      urgency: 'low'
    },
    'preparation_inquiry': {
      description: 'Ask about appointment preparation instructions',
      examples: ['how to prepare', 'what to bring', 'preparation instructions'],
      category: 'information',
      urgency: 'low'
    },

    // Patient verification and identity
    'verification_request': {
      description: 'Patient providing identification information',
      examples: ['my name is', 'my date of birth', 'my phone number is'],
      category: 'general',
      urgency: 'medium'
    },
    'verification_difficulty': {
      description: 'Patient having trouble with verification',
      examples: ['I don\'t remember', 'I\'m not sure', 'can\'t verify'],
      category: 'general',
      urgency: 'medium'
    },

    // Emergency and urgent situations
    'emergency': {
      description: 'Medical emergency or urgent situation',
      examples: ['emergency', 'urgent', 'severe pain', 'can\'t see'],
      category: 'emergency',
      urgency: 'urgent'
    },
    'symptoms_urgent': {
      description: 'Urgent symptoms requiring immediate attention',
      examples: ['sudden vision loss', 'severe eye pain', 'flashing lights'],
      category: 'emergency',
      urgency: 'urgent'
    },

    // Clarification and help
    'clarification_request': {
      description: 'Patient asking for clarification or help understanding',
      examples: ['I don\'t understand', 'can you repeat', 'what do you mean'],
      category: 'general',
      urgency: 'low'
    },
    'escalation_request': {
      description: 'Patient requesting to speak with staff',
      examples: ['speak to someone', 'talk to staff', 'need human help'],
      category: 'general',
      urgency: 'medium'
    },

    // Story 3.5: Appointment confirmation and reminder intents
    'confirmation_lookup': {
      description: 'Patient wanting to look up or verify appointment confirmation details',
      examples: ['check my confirmation', 'what is my confirmation number', 'verify my appointment', 'lookup confirmation'],
      category: 'appointment',
      urgency: 'low'
    },
    'confirmation_number_inquiry': {
      description: 'Patient asking about or providing a confirmation number',
      examples: ['my confirmation number is', 'confirmation number CE123', 'what\'s the confirmation'],
      category: 'appointment',
      urgency: 'low'
    },
    'appointment_details_request': {
      description: 'Patient requesting complete appointment details and information',
      examples: ['when is my appointment', 'appointment details', 'what time is my appointment', 'appointment information'],
      category: 'appointment',
      urgency: 'low'
    },
    'preparation_instructions_request': {
      description: 'Patient asking for appointment preparation instructions',
      examples: ['what do I need to bring', 'how should I prepare', 'preparation instructions', 'what to expect'],
      category: 'information',
      urgency: 'low'
    },
    'reminder_response': {
      description: 'Patient responding to an appointment reminder',
      examples: ['yes I\'ll be there', 'confirm appointment', 'need to reschedule', 'cancel appointment'],
      category: 'appointment',
      urgency: 'medium'
    },
    'reminder_preference': {
      description: 'Patient setting or asking about reminder preferences',
      examples: ['remind me by text', 'no email reminders', 'reminder preferences', 'how will you remind me'],
      category: 'general',
      urgency: 'low'
    },

    // Fallback
    'unknown': {
      description: 'Intent could not be determined',
      examples: [],
      category: 'general',
      urgency: 'low'
    }
  };

  constructor(config: NLUConfig) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Recognize intent from patient utterance
   */
  async recognizeIntent(utterance: string, conversationContext?: any): Promise<IntentResult> {
    try {
      logger.debug('Processing intent recognition', {
        utteranceLength: utterance.length,
        hasContext: !!conversationContext
      });

      // Pre-processing
      const cleanedUtterance = this.preprocessUtterance(utterance);
      
      // Build prompt with medical practice context
      const prompt = this.buildIntentPrompt(cleanedUtterance, conversationContext);
      
      // Call GPT-4 for intent recognition
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Post-process and validate result
      const intentResult = await this.postProcessResult(result, cleanedUtterance);
      
      // Apply confidence threshold
      if (intentResult.confidence < this.config.confidenceThreshold) {
        logger.warn('Low confidence intent recognition', {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          utterance: cleanedUtterance
        });
        
        // Return fallback with lower confidence
        return {
          ...intentResult,
          intent: this.config.fallbackIntent,
          confidence: intentResult.confidence * 0.5
        };
      }

      logger.info('Intent recognized successfully', {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        entitiesCount: intentResult.entities.length
      });

      return intentResult;

    } catch (error) {
      logger.error('Intent recognition failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        utterance: utterance.substring(0, 100)
      });

      // Return fallback intent on error
      return {
        intent: this.config.fallbackIntent,
        confidence: 0.1,
        entities: [],
        requiresFollowUp: true,
        context: {
          urgency: 'medium',
          topic: 'unclear',
          category: 'general',
          requiresVerification: false,
          suggestedResponses: [
            "I'm sorry, I didn't quite understand that. Could you please rephrase your request?",
            "I want to make sure I help you correctly. Could you tell me what you're looking for today?"
          ]
        }
      };
    }
  }

  /**
   * Extract entities from utterance
   */
  async extractEntities(utterance: string, intent: string): Promise<ExtractedEntity[]> {
    try {
      const prompt = this.buildEntityExtractionPrompt(utterance, intent);
      
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getEntityExtractionSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"entities": []}');
      return this.normalizeEntities(result.entities || []);

    } catch (error) {
      logger.error('Entity extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        utterance: utterance.substring(0, 100),
        intent
      });
      return [];
    }
  }

  /**
   * Analyze sentiment and emotional markers
   */
  async analyzeSentiment(utterance: string): Promise<{ sentiment: number; emotionalMarkers: string[] }> {
    try {
      const prompt = this.buildSentimentPrompt(utterance);
      
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getSentimentSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"sentiment": 0, "emotionalMarkers": []}');
      
      return {
        sentiment: Math.max(-1, Math.min(1, result.sentiment || 0)),
        emotionalMarkers: result.emotionalMarkers || []
      };

    } catch (error) {
      logger.error('Sentiment analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { sentiment: 0, emotionalMarkers: [] };
    }
  }

  /**
   * Private helper methods
   */

  private preprocessUtterance(utterance: string): string {
    return utterance
      .toLowerCase()
      .trim()
      .replace(/[^\w\s'-]/g, '') // Keep basic punctuation
      .replace(/\s+/g, ' ');
  }

  private getSystemPrompt(): string {
    return `You are an AI assistant for Capitol Eye Care, an optometry practice. Your role is to analyze patient utterances and identify their intent. You must respond in JSON format.

Capitol Eye Care Context:
- Optometry practice specializing in comprehensive eye care
- Services include eye exams, contact lens fittings, glaucoma screening, pediatric care
- Elderly patient demographic requires patient, clear communication
- HIPAA compliance is critical for all patient interactions

Available Intents: ${Object.keys(this.INTENTS).join(', ')}

Response Format:
{
  "intent": "recognized_intent",
  "confidence": 0.85,
  "entities": [...],
  "sentiment": 0.2,
  "emotionalMarkers": ["concerned", "polite"],
  "requiresFollowUp": true,
  "context": {
    "urgency": "medium",
    "topic": "appointment_scheduling",
    "category": "appointment",
    "requiresVerification": false,
    "suggestedResponses": ["response1", "response2"]
  }
}

Guidelines:
- Confidence should be 0.0-1.0
- Consider elderly speech patterns (slower, may repeat, hearing difficulties)
- Detect urgency in medical situations
- Be conservative with medical emergency classification
- Extract appointment-related entities carefully
- Maintain professional, empathetic tone in suggestions`;
  }

  private buildIntentPrompt(utterance: string, context?: any): string {
    let prompt = `Analyze this patient utterance for intent: "${utterance}"`;
    
    if (context) {
      prompt += `\n\nConversation Context:`;
      if (context.previousIntent) prompt += `\nPrevious Intent: ${context.previousIntent}`;
      if (context.currentTopic) prompt += `\nCurrent Topic: ${context.currentTopic}`;
      if (context.verificationStatus) prompt += `\nVerification Status: ${context.verificationStatus}`;
      if (context.emotionalState) prompt += `\nPatient Emotional State: ${context.emotionalState}`;
    }

    prompt += `\n\nProvide intent recognition with entities, sentiment analysis, and suggested responses appropriate for an elderly patient demographic.`;
    
    return prompt;
  }

  private getEntityExtractionSystemPrompt(): string {
    return `Extract entities from patient utterances for Capitol Eye Care. Focus on:

Entity Types:
- appointment_type: "eye exam", "contact lens fitting", "glaucoma screening"
- doctor_name: Specific doctor requests
- insurance_provider: "Medicare", "BCBS", "Aetna", etc.
- date: Absolute or relative dates
- time: Specific times or time preferences
- symptom: Eye-related symptoms
- medication: Eye drops, medications
- location: Office locations, directions
- other: Other relevant entities

Response Format:
{
  "entities": [
    {
      "type": "appointment_type",
      "value": "eye exam",
      "confidence": 0.9,
      "startIndex": 10,
      "endIndex": 18,
      "normalized": "comprehensive_eye_exam"
    }
  ]
}

Consider elderly speech patterns and medical terminology.`;
  }

  private buildEntityExtractionPrompt(utterance: string, intent: string): string {
    return `Extract relevant entities from: "${utterance}"
Intent: ${intent}

Focus on entities relevant to the intent and Capitol Eye Care services.`;
  }

  private getSentimentSystemPrompt(): string {
    return `Analyze sentiment and emotional markers for elderly patients calling Capitol Eye Care.

Response Format:
{
  "sentiment": 0.2,
  "emotionalMarkers": ["concerned", "polite", "patient"]
}

Sentiment Scale:
- 1.0: Very positive/happy
- 0.5: Positive/satisfied
- 0.0: Neutral
- -0.5: Concerned/worried
- -1.0: Distressed/angry

Emotional Markers for Elderly Patients:
- "patient", "polite", "concerned", "confused", "grateful"
- "frustrated", "worried", "urgent", "calm", "appreciative"
- "hearing_difficulty", "needs_repetition", "speaking_slowly"

Consider age-related communication patterns and medical anxiety.`;
  }

  private buildSentimentPrompt(utterance: string): string {
    return `Analyze sentiment and emotional state: "${utterance}"

Consider this is an elderly patient calling an eye care practice. Look for:
- Medical anxiety or concern
- Frustration with technology/process
- Gratitude and politeness
- Urgency in symptoms
- Confusion or need for clarification`;
  }

  private async postProcessResult(result: any, utterance: string): Promise<IntentResult> {
    // Validate intent
    const intent = this.validateIntent(result.intent);
    
    // Extract and analyze entities if not provided
    let entities = result.entities || [];
    if (entities.length === 0) {
      entities = await this.extractEntities(utterance, intent);
    }

    // Analyze sentiment if not provided
    let sentiment = result.sentiment;
    let emotionalMarkers = result.emotionalMarkers || [];
    
    if (sentiment === undefined || emotionalMarkers.length === 0) {
      const sentimentAnalysis = await this.analyzeSentiment(utterance);
      sentiment = sentiment || sentimentAnalysis.sentiment;
      emotionalMarkers = emotionalMarkers.length > 0 ? emotionalMarkers : sentimentAnalysis.emotionalMarkers;
    }

    // Build context
    const intentInfo = this.INTENTS[intent as keyof typeof this.INTENTS];
    const context: IntentContext = {
      urgency: (result.context?.urgency || intentInfo?.urgency || 'low') as IntentContext['urgency'],
      topic: result.context?.topic || intent,
      category: (result.context?.category || intentInfo?.category || 'general') as IntentContext['category'],
      requiresVerification: result.context?.requiresVerification || this.requiresVerification(intent),
      suggestedResponses: result.context?.suggestedResponses || this.generateSuggestedResponses(intent, entities)
    };

    return {
      intent,
      confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
      entities: this.normalizeEntities(entities),
      sentiment,
      emotionalMarkers,
      requiresFollowUp: result.requiresFollowUp !== false,
      context
    };
  }

  private validateIntent(intent: string): string {
    return Object.keys(this.INTENTS).includes(intent) ? intent : this.config.fallbackIntent;
  }

  private requiresVerification(intent: string): boolean {
    const verificationRequiredIntents = [
      'appointment_request',
      'appointment_reschedule', 
      'appointment_cancel',
      'appointment_confirm'
    ];
    return verificationRequiredIntents.includes(intent);
  }

  private generateSuggestedResponses(intent: string, entities: ExtractedEntity[]): string[] {
    const responses: Record<string, string[]> = {
      'greeting': [
        "Hello! Thank you for calling Capitol Eye Care. How can I help you today?",
        "Good day! This is Capitol Eye Care. What can I assist you with?"
      ],
      'appointment_request': [
        "I'd be happy to help you schedule an appointment. What type of appointment are you looking for?",
        "Let me help you find a convenient appointment time. Is this for a routine eye exam?"
      ],
      'hours_inquiry': [
        "I can provide our current hours for you. We're open Monday through Friday from 8 AM to 5 PM.",
        "Our office hours are Monday through Friday, 8 AM to 5 PM. Is there a specific day you're asking about?"
      ],
      'insurance_inquiry': [
        "I can help you with insurance questions. What insurance provider do you have?",
        "Let me check our accepted insurance plans for you. Which insurance company covers you?"
      ],
      'emergency': [
        "I understand this is urgent. For immediate medical emergencies, please call 911 or go to the nearest emergency room.",
        "This sounds like it needs immediate attention. I'm going to connect you with our staff right away."
      ]
    };

    return responses[intent] || [
      "I understand. How can I help you with that?",
      "Let me see how I can assist you with that request."
    ];
  }

  private normalizeEntities(entities: any[]): ExtractedEntity[] {
    return entities.map(entity => ({
      type: entity.type || 'other',
      value: entity.value || '',
      confidence: Math.max(0, Math.min(1, entity.confidence || 0.5)),
      startIndex: entity.startIndex || 0,
      endIndex: entity.endIndex || 0,
      normalized: entity.normalized || entity.value
    }));
  }

  /**
   * Public utility methods
   */

  getAvailableIntents(): string[] {
    return Object.keys(this.INTENTS);
  }

  getIntentInfo(intent: string) {
    return this.INTENTS[intent as keyof typeof this.INTENTS];
  }

  updateConfidenceThreshold(threshold: number): void {
    this.config.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}