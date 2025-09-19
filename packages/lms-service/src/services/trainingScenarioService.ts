import { TrainingScenario, TrainingScenarioSchema, ApiResponse } from '../types';
import { logger } from '../utils/logger';

export class TrainingScenarioService {
  private scenarios: Map<string, TrainingScenario> = new Map();

  constructor() {
    this.initializeDefaultScenarios();
  }

  private initializeDefaultScenarios(): void {
    const defaultScenarios = this.getDefaultScenarios();
    defaultScenarios.forEach(scenario => {
      this.scenarios.set(scenario.id, scenario);
    });
    logger.info(`Initialized ${this.scenarios.size} default training scenarios`);
  }

  async getAllScenarios(): Promise<ApiResponse<TrainingScenario[]>> {
    try {
      const scenarios = Array.from(this.scenarios.values());
      return {
        success: true,
        data: scenarios
      };
    } catch (error) {
      logger.error('Error fetching training scenarios:', error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch training scenarios',
          details: error
        }
      };
    }
  }

  async getScenarioById(id: string): Promise<ApiResponse<TrainingScenario>> {
    try {
      const scenario = this.scenarios.get(id);
      if (!scenario) {
        return {
          success: false,
          error: {
            message: 'Training scenario not found',
            code: 'SCENARIO_NOT_FOUND'
          }
        };
      }

      return {
        success: true,
        data: scenario
      };
    } catch (error) {
      logger.error(`Error fetching scenario ${id}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch training scenario',
          details: error
        }
      };
    }
  }

  async getScenariosByType(type: 'call_handling' | 'dashboard_usage' | 'escalation' | 'troubleshooting'): Promise<ApiResponse<TrainingScenario[]>> {
    try {
      const scenarios = Array.from(this.scenarios.values())
        .filter(scenario => scenario.type === type);

      return {
        success: true,
        data: scenarios
      };
    } catch (error) {
      logger.error(`Error fetching scenarios by type ${type}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch scenarios by type',
          details: error
        }
      };
    }
  }

  async getScenariosByDifficulty(difficulty: number): Promise<ApiResponse<TrainingScenario[]>> {
    try {
      const scenarios = Array.from(this.scenarios.values())
        .filter(scenario => scenario.difficulty === difficulty);

      return {
        success: true,
        data: scenarios
      };
    } catch (error) {
      logger.error(`Error fetching scenarios by difficulty ${difficulty}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch scenarios by difficulty',
          details: error
        }
      };
    }
  }

  async createScenario(scenarioData: Omit<TrainingScenario, 'id'>): Promise<ApiResponse<TrainingScenario>> {
    try {
      const validation = TrainingScenarioSchema.omit({ id: true }).safeParse(scenarioData);

      if (!validation.success) {
        return {
          success: false,
          error: {
            message: 'Invalid scenario data',
            details: validation.error.issues
          }
        };
      }

      const id = this.generateId();
      const scenario: TrainingScenario = {
        ...scenarioData,
        id
      };

      this.scenarios.set(id, scenario);
      logger.info(`Created new training scenario: ${scenario.title}`);

      return {
        success: true,
        data: scenario
      };
    } catch (error) {
      logger.error('Error creating training scenario:', error);
      return {
        success: false,
        error: {
          message: 'Failed to create training scenario',
          details: error
        }
      };
    }
  }

  private generateId(): string {
    return `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultScenarios(): TrainingScenario[] {
    return [
      {
        id: 'confused_elderly_patient',
        title: 'Confused Elderly Patient',
        description: 'Handle an elderly patient who is confused about the AI system and has hearing difficulties',
        type: 'escalation',
        difficulty: 2,
        timeLimit: 300, // 5 minutes
        context: {
          patientProfile: {
            name: 'Margaret Thompson',
            age: 78,
            conditions: ['Mild hearing impairment'],
            preferredCommunication: 'Slow, clear speech'
          },
          conversationHistory: [
            {
              speaker: 'AI',
              text: 'Good morning! I understand you\'d like to schedule an appointment?',
              timestamp: new Date('2025-01-15T10:00:00Z')
            },
            {
              speaker: 'Patient',
              text: 'What? I can\'t... who is this? Is this the eye doctor?',
              timestamp: new Date('2025-01-15T10:00:15Z')
            },
            {
              speaker: 'AI',
              text: 'Yes, this is Capitol Eye Care. Can you please tell me your name?',
              timestamp: new Date('2025-01-15T10:00:30Z')
            },
            {
              speaker: 'Patient',
              text: 'I don\'t understand. I need to see Dr. Johnson. Hello?',
              timestamp: new Date('2025-01-15T10:00:45Z')
            }
          ],
          escalationReason: 'Patient confusion, potential hearing difficulty',
          aiRecommendation: 'Transfer to human agent for assisted communication',
          systemState: {
            confidenceScore: 0.3,
            attemptedActions: ['identity_verification', 'appointment_scheduling'],
            failureReasons: ['unclear_patient_responses', 'possible_hearing_impairment']
          }
        },
        objectives: [
          'Quickly identify patient needs and concerns',
          'Provide reassuring and clear communication',
          'Complete appointment scheduling successfully',
          'Maintain patient dignity and respect'
        ],
        tasks: [
          {
            description: 'Accept the escalation and take over the call professionally',
            requiredActions: [
              {
                type: 'click',
                target: '#escalation-accept-btn',
                validation: 'call_transferred === true'
              },
              {
                type: 'speak',
                target: 'patient',
                parameters: {
                  mustInclude: ['staff member', 'help you', 'Capitol Eye Care'],
                  tone: 'friendly',
                  pace: 'slow'
                },
                validation: 'sentiment_score > 0.7'
              }
            ],
            timeTarget: 60
          },
          {
            description: 'Clarify patient needs and gather necessary information',
            requiredActions: [
              {
                type: 'ask',
                target: 'patient',
                parameters: {
                  question: 'What can I help you with today?',
                  followUp: true
                },
                validation: 'patient_need_identified === true'
              },
              {
                type: 'verify',
                target: 'patient_identity',
                parameters: {
                  method: 'alternative',
                  allowMultipleAttempts: true
                },
                validation: 'identity_verified === true'
              }
            ],
            timeTarget: 180
          },
          {
            description: 'Complete the appointment scheduling request',
            requiredActions: [
              {
                type: 'schedule',
                target: 'appointment',
                parameters: {
                  provider: 'Dr. Johnson',
                  confirmDetails: true
                },
                validation: 'appointment_scheduled === true'
              },
              {
                type: 'confirm',
                target: 'appointment_details',
                parameters: {
                  speakSlowly: true,
                  repeatIfNeeded: true
                },
                validation: 'patient_confirmed === true'
              }
            ],
            timeTarget: 240
          }
        ],
        evaluation: [
          {
            criterion: 'Communication Quality',
            weight: 0.3,
            measure: (performance: any) => performance.communicationScore
          },
          {
            criterion: 'Patient Satisfaction',
            weight: 0.25,
            measure: (performance: any) => performance.patientSentiment
          },
          {
            criterion: 'Task Completion',
            weight: 0.25,
            measure: (performance: any) => performance.appointmentScheduled ? 1 : 0
          },
          {
            criterion: 'Time Efficiency',
            weight: 0.1,
            measure: (performance: any) => Math.max(0, 1 - performance.totalTime / 300)
          },
          {
            criterion: 'Professionalism',
            weight: 0.1,
            measure: (performance: any) => performance.professionalismScore
          }
        ],
        hints: [
          {
            triggerTime: 90,
            message: 'Remember to speak slowly and clearly for elderly patients',
            penalty: 0.02
          },
          {
            triggerTime: 180,
            message: 'Consider using address verification if name verification is difficult',
            penalty: 0.05
          },
          {
            triggerTime: 240,
            message: 'Confirm appointment details twice to ensure understanding',
            penalty: 0.03
          }
        ]
      },
      {
        id: 'verification_failure_escalation',
        title: 'Patient Verification Failure',
        description: 'Handle a patient who cannot successfully verify their identity through standard methods',
        type: 'escalation',
        difficulty: 3,
        timeLimit: 420, // 7 minutes
        context: {
          patientProfile: {
            name: 'Robert Johnson',
            age: 65,
            actualDOB: '1958-03-15',
            actualAddress: '123 Main St, Anytown, ST 12345'
          },
          conversationHistory: [
            {
              speaker: 'AI',
              text: 'To protect your privacy, I need to verify your identity. Can you please tell me your date of birth?',
              timestamp: new Date('2025-01-15T14:30:00Z')
            },
            {
              speaker: 'Patient',
              text: 'March 15th, 1959... wait, no 1958.',
              timestamp: new Date('2025-01-15T14:30:15Z')
            },
            {
              speaker: 'AI',
              text: 'I\'m sorry, that doesn\'t match our records. Can you please try again?',
              timestamp: new Date('2025-01-15T14:30:30Z')
            },
            {
              speaker: 'Patient',
              text: 'March 5th, 1958? I\'m not sure, I have trouble remembering dates.',
              timestamp: new Date('2025-01-15T14:30:50Z')
            }
          ],
          escalationReason: 'Multiple failed verification attempts',
          aiRecommendation: 'Use alternative verification method with human assistance',
          systemState: {
            verificationAttempts: 3,
            lastAttemptTime: new Date('2025-01-15T14:30:50Z'),
            confidenceScore: 0.2,
            suspiciousActivity: false
          }
        },
        objectives: [
          'Protect patient privacy while being helpful',
          'Use alternative verification methods',
          'Maintain HIPAA compliance throughout',
          'Complete the patient\'s request if verification succeeds'
        ],
        tasks: [
          {
            description: 'Accept escalation and explain the situation to the patient',
            requiredActions: [
              {
                type: 'accept_escalation',
                target: '#escalation-queue',
                validation: 'escalation_accepted === true'
              },
              {
                type: 'explain',
                target: 'patient',
                parameters: {
                  topic: 'verification_importance',
                  tone: 'understanding',
                  emphasize: 'privacy_protection'
                },
                validation: 'explanation_given === true'
              }
            ],
            timeTarget: 90
          },
          {
            description: 'Attempt alternative verification using address',
            requiredActions: [
              {
                type: 'verify_alternative',
                target: 'patient_address',
                parameters: {
                  method: 'partial_address',
                  allowance: 'street_name_only'
                },
                validation: 'alternative_verification_attempted === true'
              }
            ],
            timeTarget: 180
          },
          {
            description: 'Make appropriate decision based on verification outcome',
            requiredActions: [
              {
                type: 'decision',
                target: 'verification_result',
                parameters: {
                  options: ['proceed_with_request', 'schedule_in_person_verification', 'refer_to_supervisor'],
                  justification_required: true
                },
                validation: 'decision_made === true && justification_provided === true'
              }
            ],
            timeTarget: 300
          }
        ],
        evaluation: [
          {
            criterion: 'HIPAA Compliance',
            weight: 0.4,
            measure: (performance: any) => performance.hipaaCompliant ? 1 : 0
          },
          {
            criterion: 'Alternative Methods Used',
            weight: 0.2,
            measure: (performance: any) => performance.alternativeMethodsUsed / 2
          },
          {
            criterion: 'Patient Understanding',
            weight: 0.2,
            measure: (performance: any) => performance.patientUnderstanding
          },
          {
            criterion: 'Appropriate Decision',
            weight: 0.15,
            measure: (performance: any) => performance.appropriateDecision ? 1 : 0
          },
          {
            criterion: 'Professional Communication',
            weight: 0.05,
            measure: (performance: any) => performance.professionalCommunication
          }
        ],
        hints: [
          {
            triggerTime: 120,
            message: 'Try asking for the street address instead of full address',
            penalty: 0.05
          },
          {
            triggerTime: 240,
            message: 'Remember: when in doubt about verification, prioritize privacy protection',
            penalty: 0.1
          },
          {
            triggerTime: 360,
            message: 'Consider offering in-person verification as an alternative',
            penalty: 0.08
          }
        ]
      },
      {
        id: 'dashboard_multiple_escalations',
        title: 'Managing Multiple Escalations',
        description: 'Handle multiple simultaneous escalations with different priority levels efficiently',
        type: 'dashboard_usage',
        difficulty: 4,
        timeLimit: 480, // 8 minutes
        context: {
          systemState: {
            activeEscalations: [
              {
                id: 'esc_001',
                priority: 'CRITICAL',
                type: 'medical_emergency',
                waitTime: 45, // seconds
                patient: 'Emergency - chest pain'
              },
              {
                id: 'esc_002',
                priority: 'HIGH',
                type: 'angry_patient',
                waitTime: 180, // seconds
                patient: 'Frustrated about appointment'
              },
              {
                id: 'esc_003',
                priority: 'MEDIUM',
                type: 'technical_issue',
                waitTime: 300, // seconds
                patient: 'Cannot schedule appointment'
              },
              {
                id: 'esc_004',
                priority: 'LOW',
                type: 'general_question',
                waitTime: 600, // seconds
                patient: 'Question about services'
              }
            ],
            availableStaff: 2,
            currentUser: 'staff_member_1'
          }
        },
        objectives: [
          'Prioritize escalations correctly',
          'Handle critical situations immediately',
          'Delegate appropriately when possible',
          'Maintain SLA compliance across all priorities'
        ],
        tasks: [
          {
            description: 'Immediately address the critical medical emergency',
            requiredActions: [
              {
                type: 'select_escalation',
                target: '#esc_001',
                validation: 'critical_escalation_selected === true'
              },
              {
                type: 'emergency_protocol',
                target: 'medical_emergency',
                parameters: {
                  actions: ['advise_911', 'stay_on_line', 'document_incident'],
                  immediateAction: true
                },
                validation: 'emergency_protocol_followed === true'
              }
            ],
            timeTarget: 120
          },
          {
            description: 'Delegate or address the high-priority angry patient',
            requiredActions: [
              {
                type: 'assess_situation',
                target: '#esc_002',
                validation: 'situation_assessed === true'
              },
              {
                type: 'decision',
                target: 'delegation',
                parameters: {
                  options: ['handle_personally', 'delegate_to_available_staff'],
                  consider: 'urgency_and_capacity'
                },
                validation: 'delegation_decision_made === true'
              }
            ],
            timeTarget: 240
          },
          {
            description: 'Queue management for remaining escalations',
            requiredActions: [
              {
                type: 'prioritize_queue',
                target: 'remaining_escalations',
                parameters: {
                  considerSLA: true,
                  optimizeWaitTimes: true
                },
                validation: 'queue_optimized === true'
              },
              {
                type: 'communicate_wait_times',
                target: 'waiting_patients',
                validation: 'wait_times_communicated === true'
              }
            ],
            timeTarget: 360
          }
        ],
        evaluation: [
          {
            criterion: 'Priority Handling',
            weight: 0.3,
            measure: (performance: any) => performance.criticalHandledFirst ? 1 : 0
          },
          {
            criterion: 'SLA Compliance',
            weight: 0.25,
            measure: (performance: any) => performance.slaComplianceRate
          },
          {
            criterion: 'Delegation Efficiency',
            weight: 0.2,
            measure: (performance: any) => performance.delegationEfficiency
          },
          {
            criterion: 'Overall Response Time',
            weight: 0.15,
            measure: (performance: any) => Math.max(0, 1 - performance.averageResponseTime / 300)
          },
          {
            criterion: 'Communication Quality',
            weight: 0.1,
            measure: (performance: any) => performance.communicationQuality
          }
        ],
        hints: [
          {
            triggerTime: 60,
            message: 'Always handle CRITICAL escalations first!',
            penalty: 0
          },
          {
            triggerTime: 180,
            message: 'Consider delegating the HIGH priority escalation to maintain efficiency',
            penalty: 0.05
          },
          {
            triggerTime: 300,
            message: 'Don\'t forget to update patients on wait times for better experience',
            penalty: 0.03
          }
        ]
      },
      {
        id: 'technical_troubleshooting',
        title: 'AI System Technical Issues',
        description: 'Diagnose and resolve common technical problems with the AI voice system',
        type: 'troubleshooting',
        difficulty: 3,
        timeLimit: 360, // 6 minutes
        context: {
          systemState: {
            aiConfidenceScore: 0.35,
            callQuality: 'poor',
            patientFrustrationLevel: 'high',
            consecutiveFailures: 3,
            lastSuccessfulAction: '5 minutes ago'
          },
          patientProfile: {
            name: 'Sarah Wilson',
            phoneQuality: 'cellular_poor_connection',
            previousSuccessfulCalls: 5
          },
          conversationHistory: [
            {
              speaker: 'AI',
              text: 'I\'m sorry, could you please repeat that?',
              timestamp: new Date('2025-01-15T09:15:00Z')
            },
            {
              speaker: 'Patient',
              text: 'I said I need to reschedule my appointment for next Thursday!',
              timestamp: new Date('2025-01-15T09:15:15Z')
            },
            {
              speaker: 'AI',
              text: 'I understand you want to schedule an appointment. What type of appointment?',
              timestamp: new Date('2025-01-15T09:15:30Z')
            },
            {
              speaker: 'Patient',
              text: 'No! RESCHEDULE! I already have an appointment!',
              timestamp: new Date('2025-01-15T09:15:45Z')
            }
          ]
        },
        objectives: [
          'Quickly diagnose the technical issue',
          'Apply appropriate troubleshooting steps',
          'Restore service quality for the patient',
          'Document the issue for technical team'
        ],
        tasks: [
          {
            description: 'Analyze the situation and identify the root cause',
            requiredActions: [
              {
                type: 'analyze',
                target: 'technical_indicators',
                parameters: {
                  checkPoints: ['confidence_score', 'call_quality', 'pattern_recognition'],
                  timeframe: 'last_5_minutes'
                },
                validation: 'root_cause_identified === true'
              }
            ],
            timeTarget: 90
          },
          {
            description: 'Take immediate action to help the patient',
            requiredActions: [
              {
                type: 'intervene',
                target: 'active_call',
                parameters: {
                  action: 'take_over_call',
                  apologize: true,
                  explainTransition: true
                },
                validation: 'call_intervention_successful === true'
              },
              {
                type: 'complete_request',
                target: 'patient_need',
                parameters: {
                  requestType: 'reschedule',
                  gatherDetails: true
                },
                validation: 'patient_request_completed === true'
              }
            ],
            timeTarget: 240
          },
          {
            description: 'Document the issue and implement preventive measures',
            requiredActions: [
              {
                type: 'document',
                target: 'technical_issue',
                parameters: {
                  severity: 'medium',
                  pattern: 'recurring',
                  recommendedActions: ['audio_quality_check', 'ai_model_review']
                },
                validation: 'issue_documented === true'
              },
              {
                type: 'preventive_action',
                target: 'system_settings',
                parameters: {
                  adjustments: ['confidence_threshold', 'fallback_triggers'],
                  temporary: true
                },
                validation: 'preventive_measures_applied === true'
              }
            ],
            timeTarget: 320
          }
        ],
        evaluation: [
          {
            criterion: 'Issue Diagnosis Speed',
            weight: 0.25,
            measure: (performance: any) => Math.max(0, 1 - performance.diagnosisTime / 90)
          },
          {
            criterion: 'Patient Recovery',
            weight: 0.3,
            measure: (performance: any) => performance.patientSatisfactionRecovery
          },
          {
            criterion: 'Documentation Quality',
            weight: 0.2,
            measure: (performance: any) => performance.documentationCompleteness
          },
          {
            criterion: 'Preventive Measures',
            weight: 0.15,
            measure: (performance: any) => performance.preventiveMeasuresApplied ? 1 : 0
          },
          {
            criterion: 'Technical Accuracy',
            weight: 0.1,
            measure: (performance: any) => performance.technicalAccuracy
          }
        ],
        hints: [
          {
            triggerTime: 60,
            message: 'Check the AI confidence score and call quality indicators first',
            penalty: 0.02
          },
          {
            triggerTime: 150,
            message: 'The patient is getting frustrated - take over the call now',
            penalty: 0.05
          },
          {
            triggerTime: 270,
            message: 'Don\'t forget to document this issue for the technical team',
            penalty: 0.08
          }
        ]
      }
    ];
  }
}