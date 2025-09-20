import express, { Request, Response } from 'express';
import { z } from 'zod';
import ConfigurationService from '../services/configurationService';
import { AIPersonalitySchema } from '../models/configuration.models';
import winston from 'winston';

const router = express.Router();
const configService = new ConfigurationService();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Middleware to extract user info
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    practiceId: string;
    role: string;
  };
}

// AI Conversation Testing Service
class AIConversationTester {
  /**
   * Run A/B test between two personality configurations
   */
  public static async runABTest(
    personalityA: any,
    personalityB: any,
    testScenarios: string[]
  ): Promise<{
    test_id: string;
    results: any[];
    winner: 'A' | 'B' | 'tie';
    confidence: number;
  }> {
    const testId = `ab_test_${Date.now()}`;
    const results = [];

    for (const scenario of testScenarios) {
      const resultA = await this.simulateConversation(personalityA, scenario);
      const resultB = await this.simulateConversation(personalityB, scenario);

      results.push({
        scenario,
        personality_a: resultA,
        personality_b: resultB,
        winner: this.compareResults(resultA, resultB),
      });
    }

    // Calculate overall winner
    const scoreA = results.filter(r => r.winner === 'A').length;
    const scoreB = results.filter(r => r.winner === 'B').length;

    const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'tie';
    const confidence = Math.abs(scoreA - scoreB) / results.length;

    return {
      test_id: testId,
      results,
      winner,
      confidence,
    };
  }

  /**
   * Simulate conversation with given personality
   */
  public static async simulateConversation(
    personality: any,
    scenario: string
  ): Promise<{
    completion_rate: number;
    patient_satisfaction: number;
    error_rate: number;
    average_response_time: number;
    conversation_length: number;
  }> {
    // Mock simulation results based on personality settings
    const baseScore = {
      completion_rate: 85,
      patient_satisfaction: 7.5,
      error_rate: 3,
      average_response_time: 1.2,
      conversation_length: 12,
    };

    // Adjust based on personality settings
    let adjustments = { ...baseScore };

    // Empathy level adjustments
    if (personality.personality_settings?.empathy_level === 'high') {
      adjustments.patient_satisfaction += 0.8;
      adjustments.completion_rate += 5;
      adjustments.conversation_length += 2;
    } else if (personality.personality_settings?.empathy_level === 'low') {
      adjustments.patient_satisfaction -= 0.5;
      adjustments.completion_rate -= 3;
      adjustments.conversation_length -= 1;
    }

    // Verbosity adjustments
    if (personality.personality_settings?.verbosity === 'detailed') {
      adjustments.conversation_length += 3;
      adjustments.average_response_time += 0.5;
    } else if (personality.personality_settings?.verbosity === 'concise') {
      adjustments.conversation_length -= 2;
      adjustments.average_response_time -= 0.3;
    }

    // Formality level adjustments
    if (personality.personality_settings?.formality_level === 'formal') {
      adjustments.patient_satisfaction += 0.3;
      adjustments.error_rate -= 0.5;
    } else if (personality.personality_settings?.formality_level === 'casual') {
      adjustments.completion_rate += 3;
      adjustments.conversation_length -= 1;
    }

    // Scenario-specific adjustments
    switch (scenario) {
      case 'appointment_booking':
        adjustments.completion_rate += 5;
        break;
      case 'appointment_cancellation':
        adjustments.patient_satisfaction -= 0.5;
        break;
      case 'general_inquiry':
        adjustments.conversation_length += 1;
        break;
      case 'complaint_handling':
        adjustments.patient_satisfaction -= 1;
        adjustments.error_rate += 1;
        break;
    }

    // Ensure realistic bounds
    adjustments.completion_rate = Math.max(0, Math.min(100, adjustments.completion_rate));
    adjustments.patient_satisfaction = Math.max(0, Math.min(10, adjustments.patient_satisfaction));
    adjustments.error_rate = Math.max(0, Math.min(20, adjustments.error_rate));
    adjustments.average_response_time = Math.max(0.1, Math.min(5, adjustments.average_response_time));
    adjustments.conversation_length = Math.max(1, Math.min(30, adjustments.conversation_length));

    return adjustments;
  }

  /**
   * Compare two conversation results
   */
  private static compareResults(resultA: any, resultB: any): 'A' | 'B' | 'tie' {
    const scoreA = (
      resultA.completion_rate * 0.3 +
      resultA.patient_satisfaction * 10 * 0.4 +
      (100 - resultA.error_rate) * 0.2 +
      (5 - Math.min(resultA.average_response_time, 5)) * 20 * 0.1
    );

    const scoreB = (
      resultB.completion_rate * 0.3 +
      resultB.patient_satisfaction * 10 * 0.4 +
      (100 - resultB.error_rate) * 0.2 +
      (5 - Math.min(resultB.average_response_time, 5)) * 20 * 0.1
    );

    const difference = Math.abs(scoreA - scoreB);
    if (difference < 2) return 'tie';
    return scoreA > scoreB ? 'A' : 'B';
  }

  /**
   * Generate conversation simulation scenarios
   */
  public static generateTestScenarios(): string[] {
    return [
      'appointment_booking',
      'appointment_cancellation',
      'appointment_rescheduling',
      'general_inquiry',
      'insurance_questions',
      'complaint_handling',
      'emergency_routing',
      'after_hours_contact',
    ];
  }
}

/**
 * @route GET /api/ai/personalities
 * @desc Get all AI personalities for the practice
 * @access Private
 */
router.get('/personalities', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const includeInactive = req.query.include_inactive === 'true';

    const result = await configService.getConfigurations(
      'ai_personality',
      user.practiceId,
      includeInactive
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('AI personalities retrieval:', {
      userId: user.id,
      practiceId: user.practiceId,
      includeInactive,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error retrieving AI personalities:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve AI personalities',
    });
  }
});

/**
 * @route POST /api/ai/personalities
 * @desc Create new AI personality configuration
 * @access Private
 */
router.post('/personalities', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = AIPersonalitySchema.safeParse({
      ...req.body,
      practice_id: req.user?.practiceId,
      created_by: req.user?.id,
      updated_by: req.user?.id,
    });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid AI personality data',
      });
    }

    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const requestData = {
      type: 'ai_personality' as const,
      data: validation.data,
      requires_approval: req.body.requires_approval || true, // AI changes usually require approval
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(result);

    logger.info('AI personality creation:', {
      userId: user.id,
      practiceId: user.practiceId,
      personalityName: validation.data.personality_name,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error creating AI personality:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create AI personality',
    });
  }
});

/**
 * @route PUT /api/ai/personalities/:id
 * @desc Update existing AI personality configuration
 * @access Private
 */
router.put('/personalities/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { id } = req.params;
    const personalityId = parseInt(id, 10);

    if (isNaN(personalityId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid personality ID'],
        message: 'Personality ID must be a number',
      });
    }

    const updateRequest = {
      data: req.body,
      change_reason: req.body.change_reason || 'AI personality configuration update',
      requires_approval: req.body.requires_approval || true,
    };

    const result = await configService.updateConfiguration(
      'ai_personality',
      personalityId,
      updateRequest,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 200) : 400;
    res.status(statusCode).json(result);

    logger.info('AI personality update:', {
      userId: user.id,
      practiceId: user.practiceId,
      personalityId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error updating AI personality:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to update AI personality',
    });
  }
});

/**
 * @route POST /api/ai/personalities/:id/test
 * @desc Test AI personality configuration
 * @access Private
 */
router.post('/personalities/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { id } = req.params;
    const personalityId = parseInt(id, 10);

    if (isNaN(personalityId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid personality ID'],
        message: 'Personality ID must be a number',
      });
    }

    // Get the AI personality configuration
    const personalitiesResult = await configService.getConfigurations(
      'ai_personality',
      user.practiceId
    );

    if (!personalitiesResult.success || !personalitiesResult.data) {
      return res.status(400).json({
        success: false,
        errors: ['Failed to retrieve AI personalities'],
        message: 'Unable to test configuration',
      });
    }

    const personality = (personalitiesResult.data as any[]).find(p => p.id === personalityId);
    if (!personality) {
      return res.status(404).json({
        success: false,
        errors: ['AI personality not found'],
        message: 'Cannot test non-existent personality',
      });
    }

    // Get test scenarios from request or use defaults
    const testScenarios = req.body.test_scenarios || AIConversationTester.generateTestScenarios();

    // Run conversation simulations
    const simulationResults = [];
    for (const scenario of testScenarios) {
      const result = await AIConversationTester.simulateConversation(personality, scenario);
      simulationResults.push({
        scenario,
        ...result,
      });
    }

    // Calculate overall scores
    const overallScore = {
      average_completion_rate: simulationResults.reduce((sum, r) => sum + r.completion_rate, 0) / simulationResults.length,
      average_satisfaction: simulationResults.reduce((sum, r) => sum + r.patient_satisfaction, 0) / simulationResults.length,
      average_error_rate: simulationResults.reduce((sum, r) => sum + r.error_rate, 0) / simulationResults.length,
      average_response_time: simulationResults.reduce((sum, r) => sum + r.average_response_time, 0) / simulationResults.length,
      average_conversation_length: simulationResults.reduce((sum, r) => sum + r.conversation_length, 0) / simulationResults.length,
    };

    // Check against success metrics
    const successMetrics = personality.testing_parameters?.success_metrics || {};
    const meetsThresholds = {
      completion_rate: overallScore.average_completion_rate >= (successMetrics.conversation_completion_rate || 90),
      satisfaction: overallScore.average_satisfaction >= (successMetrics.patient_satisfaction_threshold || 8),
      error_rate: overallScore.average_error_rate <= (successMetrics.error_rate_threshold || 2),
    };

    const allThresholdsMet = Object.values(meetsThresholds).every(Boolean);

    res.json({
      success: true,
      data: {
        personality_id: personalityId,
        personality_name: personality.personality_name,
        test_scenarios: testScenarios,
        simulation_results: simulationResults,
        overall_scores: overallScore,
        success_metrics: successMetrics,
        meets_thresholds: meetsThresholds,
        overall_pass: allThresholdsMet,
      },
      message: 'AI personality testing completed',
    });

    logger.info('AI personality testing:', {
      userId: user.id,
      practiceId: user.practiceId,
      personalityId,
      scenariosTested: testScenarios.length,
      overallPass: allThresholdsMet,
    });
  } catch (error) {
    logger.error('Error testing AI personality:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to test AI personality',
    });
  }
});

/**
 * @route POST /api/ai/personalities/ab-test
 * @desc Run A/B test between two AI personalities
 * @access Private
 */
router.post('/personalities/ab-test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { personality_a_id, personality_b_id, test_scenarios } = req.body;

    if (!personality_a_id || !personality_b_id) {
      return res.status(400).json({
        success: false,
        errors: ['Both personality IDs are required'],
        message: 'Must specify two personalities for A/B testing',
      });
    }

    // Get both personalities
    const personalitiesResult = await configService.getConfigurations(
      'ai_personality',
      user.practiceId
    );

    if (!personalitiesResult.success || !personalitiesResult.data) {
      return res.status(400).json({
        success: false,
        errors: ['Failed to retrieve AI personalities'],
        message: 'Unable to run A/B test',
      });
    }

    const personalities = personalitiesResult.data as any[];
    const personalityA = personalities.find(p => p.id === personality_a_id);
    const personalityB = personalities.find(p => p.id === personality_b_id);

    if (!personalityA || !personalityB) {
      return res.status(404).json({
        success: false,
        errors: ['One or both personalities not found'],
        message: 'Cannot run A/B test with missing personalities',
      });
    }

    const scenarios = test_scenarios || AIConversationTester.generateTestScenarios();
    const abTestResult = await AIConversationTester.runABTest(personalityA, personalityB, scenarios);

    res.json({
      success: true,
      data: {
        ...abTestResult,
        personality_a: {
          id: personalityA.id,
          name: personalityA.personality_name,
        },
        personality_b: {
          id: personalityB.id,
          name: personalityB.personality_name,
        },
        test_date: new Date().toISOString(),
      },
      message: 'A/B test completed successfully',
    });

    logger.info('AI personality A/B test:', {
      userId: user.id,
      practiceId: user.practiceId,
      personalityAId: personality_a_id,
      personalityBId: personality_b_id,
      winner: abTestResult.winner,
      confidence: abTestResult.confidence,
    });
  } catch (error) {
    logger.error('Error running A/B test:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to run A/B test',
    });
  }
});

/**
 * @route GET /api/ai/templates
 * @desc Get available response templates
 * @access Private
 */
router.get('/templates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Predefined template categories and examples
    const templateCategories = {
      greetings: {
        formal: [
          "Good morning, this is [Practice Name]. How may I assist you today?",
          "Thank you for calling [Practice Name]. How can I help you?",
          "Hello, you've reached [Practice Name]. What can I do for you today?"
        ],
        friendly: [
          "Hi there! Thanks for calling [Practice Name]. How can I help?",
          "Hello! This is [Practice Name]. What can I help you with today?",
          "Hi! Welcome to [Practice Name]. How may I assist you?"
        ],
        professional: [
          "Good [morning/afternoon], [Practice Name] speaking. How may I direct your call?",
          "Thank you for contacting [Practice Name]. How can I assist you?",
          "Hello, this is [Practice Name]. How may I help you today?"
        ]
      },
      appointment_confirmation: {
        standard: [
          "I've scheduled your appointment for [Date] at [Time] with [Provider]. Is there anything else I can help you with?",
          "Your appointment is confirmed for [Date] at [Time]. You'll receive a confirmation email shortly.",
          "Perfect! I have you scheduled for [Date] at [Time]. Please arrive 15 minutes early."
        ],
        detailed: [
          "I've successfully scheduled your [Appointment Type] appointment for [Date] at [Time] with [Provider]. Please arrive 15 minutes early and bring your insurance card and ID. Is there anything else I can help you with today?",
          "Your appointment has been confirmed for [Date] at [Time]. You'll see [Provider] for [Appointment Type]. A confirmation email will be sent to [Email]. Do you have any questions?"
        ]
      },
      cancellation_acknowledgment: [
        "I understand you need to cancel your appointment on [Date]. I've removed it from the schedule. Would you like to reschedule?",
        "Your appointment for [Date] at [Time] has been cancelled. No cancellation fee applies. Would you like to book a new appointment?",
        "I've cancelled your appointment as requested. Is there anything else I can help you with today?"
      ],
      error_handling: [
        "I apologize, but I'm having trouble accessing that information right now. Let me connect you with a staff member who can assist you.",
        "I'm sorry, I didn't quite understand that. Could you please repeat your request?",
        "I apologize for the confusion. Let me transfer you to someone who can better assist you with this matter."
      ],
      escalation_message: [
        "I'd like to connect you with one of our staff members who can better assist you. Please hold for just a moment.",
        "Let me transfer you to our [Department] team who specializes in this area. One moment please.",
        "I'll have one of our staff members call you back within [Timeframe] to address this matter personally."
      ]
    };

    res.json({
      success: true,
      data: {
        categories: Object.keys(templateCategories),
        templates: templateCategories,
        customization_tips: [
          "Use [Practice Name] placeholder for automatic practice name insertion",
          "Include [Date], [Time], [Provider] placeholders for dynamic information",
          "Keep templates concise while maintaining warmth and professionalism",
          "Test templates with different patient scenarios before deployment"
        ]
      },
      message: 'Response templates retrieved successfully',
    });
  } catch (error) {
    logger.error('Error retrieving templates:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve templates',
    });
  }
});

/**
 * @route POST /api/ai/simulate
 * @desc Simulate conversation with given parameters
 * @access Private
 */
router.post('/simulate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const simulationSchema = z.object({
      personality_settings: z.object({
        formality_level: z.enum(['casual', 'professional', 'formal']).default('professional'),
        empathy_level: z.enum(['low', 'medium', 'high']).default('high'),
        verbosity: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
        tone: z.enum(['friendly', 'neutral', 'compassionate']).default('compassionate'),
      }),
      scenario: z.string(),
      patient_context: z.object({
        age_group: z.enum(['child', 'adult', 'senior']).optional(),
        urgency: z.enum(['low', 'medium', 'high']).default('medium'),
        emotional_state: z.enum(['calm', 'anxious', 'frustrated', 'confused']).default('calm'),
      }).optional(),
    });

    const validation = simulationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid simulation parameters',
      });
    }

    // Run simulation
    const mockPersonality = {
      personality_settings: validation.data.personality_settings,
    };

    const result = await AIConversationTester.simulateConversation(
      mockPersonality,
      validation.data.scenario
    );

    // Generate sample conversation flow
    const conversationFlow = generateSampleConversation(
      validation.data.personality_settings,
      validation.data.scenario,
      validation.data.patient_context
    );

    res.json({
      success: true,
      data: {
        simulation_id: `sim_${Date.now()}`,
        parameters: validation.data,
        results: result,
        sample_conversation: conversationFlow,
        recommendations: generateRecommendations(result, validation.data.personality_settings),
      },
      message: 'Conversation simulation completed',
    });

    logger.info('AI conversation simulation:', {
      userId: user.id,
      practiceId: user.practiceId,
      scenario: validation.data.scenario,
      results: result,
    });
  } catch (error) {
    logger.error('Error running conversation simulation:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to run simulation',
    });
  }
});

// Helper method to generate sample conversation
function generateSampleConversation(
  personalitySettings: any,
  scenario: string,
  patientContext?: any
): any[] {
  const greeting = personalitySettings.formality_level === 'formal'
    ? "Good morning, thank you for calling our practice. How may I assist you today?"
    : personalitySettings.formality_level === 'casual'
    ? "Hi there! Thanks for calling. How can I help you?"
    : "Hello, this is [Practice Name]. How may I help you today?";

  const flow = [
    { speaker: 'ai', message: greeting, timestamp: 0 },
    { speaker: 'patient', message: getPatientMessage(scenario), timestamp: 2 },
    { speaker: 'ai', message: getAIResponse(scenario, personalitySettings), timestamp: 4 },
  ];

  return flow;
}

function getPatientMessage(scenario: string): string {
  const messages: { [key: string]: string } = {
    'appointment_booking': "I'd like to schedule an appointment with Dr. Smith please.",
    'appointment_cancellation': "I need to cancel my appointment for tomorrow.",
    'general_inquiry': "I have a question about my recent visit.",
    'complaint_handling': "I'm really frustrated about the wait time at my last appointment.",
  };
  return messages[scenario] || "I need some help with something.";
}

function getAIResponse(scenario: string, settings: any): string {
  const empathyLevel = settings.empathy_level;
  const verbosity = settings.verbosity;

  const responses: { [key: string]: { [key: string]: string } } = {
    'appointment_booking': {
      'high': "I'd be happy to help you schedule an appointment with Dr. Smith. Let me check their availability for you.",
      'medium': "I can help you schedule with Dr. Smith. What day works best for you?",
      'low': "I'll check Dr. Smith's schedule. What's your preferred date?"
    }
  };

  return responses[scenario]?.[empathyLevel] || "I'll be happy to help you with that.";
}

function generateRecommendations(results: any, settings: any): string[] {
  const recommendations = [];

  if (results.patient_satisfaction < 8) {
    recommendations.push("Consider increasing empathy level to improve patient satisfaction");
  }

  if (results.conversation_length > 15) {
    recommendations.push("Consider more concise responses to reduce conversation length");
  }

  if (results.error_rate > 5) {
    recommendations.push("Review conversation rules to reduce error rate");
  }

  return recommendations;
}

export default router;