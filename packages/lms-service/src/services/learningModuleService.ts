import { LearningModule, LearningModuleSchema, ApiResponse } from '../types';
import { logger } from '../utils/logger';

export class LearningModuleService {
  private modules: Map<string, LearningModule> = new Map();

  constructor() {
    this.initializeDefaultModules();
  }

  private initializeDefaultModules(): void {
    const defaultModules = this.getDefaultTrainingModules();
    defaultModules.forEach(module => {
      this.modules.set(module.id, module);
    });
    logger.info(`Initialized ${this.modules.size} default training modules`);
  }

  async getAllModules(): Promise<ApiResponse<LearningModule[]>> {
    try {
      const modules = Array.from(this.modules.values());
      return {
        success: true,
        data: modules
      };
    } catch (error) {
      logger.error('Error fetching learning modules:', error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch learning modules',
          details: error
        }
      };
    }
  }

  async getModuleById(id: string): Promise<ApiResponse<LearningModule>> {
    try {
      const module = this.modules.get(id);
      if (!module) {
        return {
          success: false,
          error: {
            message: 'Learning module not found',
            code: 'MODULE_NOT_FOUND'
          }
        };
      }

      return {
        success: true,
        data: module
      };
    } catch (error) {
      logger.error(`Error fetching module ${id}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch learning module',
          details: error
        }
      };
    }
  }

  async createModule(moduleData: Omit<LearningModule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<LearningModule>> {
    try {
      const validation = LearningModuleSchema.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(moduleData);

      if (!validation.success) {
        return {
          success: false,
          error: {
            message: 'Invalid module data',
            details: validation.error.issues
          }
        };
      }

      const id = this.generateId();
      const now = new Date();
      const module: LearningModule = {
        ...moduleData,
        id,
        createdAt: now,
        updatedAt: now
      };

      this.modules.set(id, module);
      logger.info(`Created new learning module: ${module.title}`);

      return {
        success: true,
        data: module
      };
    } catch (error) {
      logger.error('Error creating learning module:', error);
      return {
        success: false,
        error: {
          message: 'Failed to create learning module',
          details: error
        }
      };
    }
  }

  async updateModule(id: string, updates: Partial<LearningModule>): Promise<ApiResponse<LearningModule>> {
    try {
      const existingModule = this.modules.get(id);
      if (!existingModule) {
        return {
          success: false,
          error: {
            message: 'Learning module not found',
            code: 'MODULE_NOT_FOUND'
          }
        };
      }

      const updatedModule: LearningModule = {
        ...existingModule,
        ...updates,
        id, // Ensure ID doesn't change
        updatedAt: new Date()
      };

      const validation = LearningModuleSchema.safeParse(updatedModule);
      if (!validation.success) {
        return {
          success: false,
          error: {
            message: 'Invalid module updates',
            details: validation.error.issues
          }
        };
      }

      this.modules.set(id, updatedModule);
      logger.info(`Updated learning module: ${updatedModule.title}`);

      return {
        success: true,
        data: updatedModule
      };
    } catch (error) {
      logger.error(`Error updating module ${id}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to update learning module',
          details: error
        }
      };
    }
  }

  async deleteModule(id: string): Promise<ApiResponse<void>> {
    try {
      const module = this.modules.get(id);
      if (!module) {
        return {
          success: false,
          error: {
            message: 'Learning module not found',
            code: 'MODULE_NOT_FOUND'
          }
        };
      }

      this.modules.delete(id);
      logger.info(`Deleted learning module: ${module.title}`);

      return {
        success: true
      };
    } catch (error) {
      logger.error(`Error deleting module ${id}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to delete learning module',
          details: error
        }
      };
    }
  }

  async getModulesByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): Promise<ApiResponse<LearningModule[]>> {
    try {
      const modules = Array.from(this.modules.values())
        .filter(module => module.difficulty === difficulty);

      return {
        success: true,
        data: modules
      };
    } catch (error) {
      logger.error(`Error fetching modules by difficulty ${difficulty}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch modules by difficulty',
          details: error
        }
      };
    }
  }

  private generateId(): string {
    return `module_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultTrainingModules(): LearningModule[] {
    return [
      {
        id: 'ai-fundamentals',
        title: 'AI System Fundamentals',
        description: 'Understanding AI voice agent capabilities, limitations, and human-AI collaboration principles',
        duration: 120, // 2 hours
        difficulty: 'beginner',
        prerequisites: [],
        objectives: [
          'Understand what the AI voice agent is and isn\'t capable of',
          'Learn how AI processes patient conversations',
          'Identify situations requiring human intervention',
          'Master basic human-AI collaboration principles'
        ],
        content: {
          sections: [
            {
              title: 'Introduction to AI Voice Agents',
              type: 'video',
              content: {
                videoUrl: '/videos/ai-introduction.mp4',
                transcript: 'Introduction to AI technology and its role in healthcare communication...',
                slides: []
              },
              duration: 15
            },
            {
              title: 'AI Capabilities Map',
              type: 'interactive',
              content: {
                componentType: 'capability-map',
                interactions: [
                  {
                    category: 'Appointment Scheduling',
                    capabilities: ['Book appointments', 'Reschedule', 'Cancel'],
                    limitations: ['Complex medical scheduling', 'Emergency procedures']
                  },
                  {
                    category: 'Patient Verification',
                    capabilities: ['Basic identity verification', 'Standard questions'],
                    limitations: ['Complex verification issues', 'Suspicious activity']
                  }
                ]
              },
              duration: 20
            },
            {
              title: 'Common AI Misconceptions',
              type: 'quiz',
              content: {
                questions: [
                  {
                    question: 'Can the AI diagnose medical conditions?',
                    options: ['Yes, it\'s trained on medical data', 'No, it only handles administrative tasks', 'Sometimes, for simple cases'],
                    correct: 1,
                    explanation: 'The AI voice agent is designed only for administrative tasks and cannot provide medical advice or diagnoses.'
                  }
                ]
              },
              duration: 10
            }
          ]
        },
        assessment: {
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              question: 'When should you intervene in an AI conversation with a patient?',
              options: [
                'When the patient sounds confused',
                'When the AI confidence score drops below 60%',
                'When the patient requests to speak to a human',
                'All of the above'
              ],
              correctAnswer: 'All of the above',
              explanation: 'Staff should intervene in all these situations to ensure quality patient care.',
              competencyArea: 'Human-AI Collaboration',
              points: 1
            }
          ],
          passingScore: 80,
          timeLimit: 1800 // 30 minutes
        },
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01')
      },
      {
        id: 'dashboard-navigation',
        title: 'Dashboard Navigation Mastery',
        description: 'Comprehensive training on monitoring, managing, and responding through the staff dashboard',
        duration: 90, // 1.5 hours
        difficulty: 'beginner',
        prerequisites: ['ai-fundamentals'],
        objectives: [
          'Navigate all dashboard features confidently',
          'Monitor active calls and system status',
          'Access patient interaction history',
          'Use real-time controls effectively'
        ],
        content: {
          sections: [
            {
              title: 'Dashboard Overview Tour',
              type: 'interactive',
              content: {
                componentType: 'guided-tour',
                steps: [
                  {
                    target: '.dashboard-header',
                    title: 'Main Navigation',
                    description: 'Access key sections from here'
                  },
                  {
                    target: '#active-calls-panel',
                    title: 'Active Calls Monitor',
                    description: 'See all ongoing conversations in real-time'
                  }
                ]
              },
              duration: 25
            },
            {
              title: 'Call Management Practice',
              type: 'simulation',
              content: {
                scenarioType: 'dashboard-interaction',
                mockData: {
                  activeCalls: 3,
                  waitingEscalations: 1,
                  systemStatus: 'healthy'
                }
              },
              duration: 40
            }
          ]
        },
        assessment: {
          questions: [
            {
              id: 'nav1',
              type: 'practical',
              question: 'Using the dashboard, locate and accept a high-priority escalation within 2 minutes',
              correctAnswer: 'escalation_accepted',
              explanation: 'High-priority escalations must be handled promptly to maintain SLA compliance.',
              competencyArea: 'Dashboard Navigation',
              points: 2
            }
          ],
          passingScore: 85,
          timeLimit: 2700 // 45 minutes
        },
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01')
      },
      {
        id: 'escalation-handling',
        title: 'Escalation Response Mastery',
        description: 'Advanced training for handling escalations with confidence and efficiency',
        duration: 120, // 2 hours
        difficulty: 'intermediate',
        prerequisites: ['ai-fundamentals', 'dashboard-navigation'],
        objectives: [
          'Recognize escalation triggers and priorities',
          'Respond to escalations within SLA timeframes',
          'Handle different types of patient concerns',
          'De-escalate tense situations effectively'
        ],
        content: {
          sections: [
            {
              title: 'Escalation Types and Priorities',
              type: 'text',
              content: {
                markdown: `# Escalation Priority Matrix

## Critical (< 2 minutes)
- Medical emergencies
- Severe patient distress
- System failures affecting patient safety

## High (< 5 minutes)
- Patient verification failures
- Angry or frustrated patients
- AI confidence score < 40%

## Medium (< 15 minutes)
- Complex appointment requests
- Patient confusion or repeated questions
- Technical difficulties

## Low (< 30 minutes)
- General questions
- Feedback or suggestions
- Non-urgent administrative issues`
              },
              duration: 20
            },
            {
              title: 'Scenario Practice: Confused Elderly Patient',
              type: 'simulation',
              content: {
                scenarioId: 'confused_elderly_patient',
                patientProfile: {
                  name: 'Margaret Thompson',
                  age: 78,
                  conditions: ['Mild hearing impairment']
                },
                conversationHistory: [
                  { speaker: 'AI', text: 'Good morning! I understand you\'d like to schedule an appointment?' },
                  { speaker: 'Patient', text: 'What? I can\'t... who is this? Is this the eye doctor?' }
                ]
              },
              duration: 30
            }
          ]
        },
        assessment: {
          questions: [
            {
              id: 'esc1',
              type: 'scenario_based',
              question: 'A patient calls and immediately says "I\'m having chest pain." What do you do?',
              correctAnswer: ['Immediately escalate as CRITICAL', 'Advise patient to call 911', 'Stay on line until help arrives'],
              explanation: 'Medical emergencies always take priority over appointments and require immediate escalation.',
              competencyArea: 'Emergency Response',
              points: 3
            }
          ],
          passingScore: 80,
          timeLimit: 3600 // 1 hour
        },
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01')
      },
      {
        id: 'hipaa-compliance',
        title: 'HIPAA Compliance with AI Systems',
        description: 'Essential training on protecting patient privacy and handling PHI in AI-enhanced workflows',
        duration: 60, // 1 hour
        difficulty: 'intermediate',
        prerequisites: ['ai-fundamentals'],
        objectives: [
          'Understand HIPAA requirements in AI context',
          'Protect PHI during AI interactions',
          'Handle security incidents appropriately',
          'Maintain compliance during system failures'
        ],
        content: {
          sections: [
            {
              title: 'HIPAA and AI: Key Principles',
              type: 'video',
              content: {
                videoUrl: '/videos/hipaa-ai-principles.mp4',
                key_points: [
                  'AI systems must maintain same HIPAA standards',
                  'Never share PHI without proper verification',
                  'Document all PHI disclosures',
                  'Report security incidents immediately'
                ]
              },
              duration: 20
            },
            {
              title: 'Compliance Scenarios',
              type: 'quiz',
              content: {
                scenarios: [
                  {
                    description: 'Patient cannot verify identity after 3 attempts',
                    correct_action: 'Never share PHI without verification',
                    wrong_actions: ['Provide appointment details to be helpful', 'Give hints about personal information'],
                    consequence: 'HIPAA violation, potential $50,000 fine'
                  }
                ]
              },
              duration: 25
            }
          ]
        },
        assessment: {
          questions: [
            {
              id: 'hipaa1',
              type: 'multiple_choice',
              question: 'A spouse calls asking about their partner\'s appointment. What should you do first?',
              options: ['Provide the appointment details', 'Verify authorization on file', 'Ask for the patient\'s consent', 'Refuse all information'],
              correctAnswer: 'Verify authorization on file',
              explanation: 'Always verify proper authorization before sharing any PHI with family members.',
              competencyArea: 'HIPAA Compliance',
              points: 2
            }
          ],
          passingScore: 90,
          timeLimit: 1800 // 30 minutes
        },
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01')
      },
      {
        id: 'troubleshooting-guide',
        title: 'Common Issues Troubleshooting',
        description: 'Practical solutions for frequent technical issues and system problems',
        duration: 90, // 1.5 hours
        difficulty: 'intermediate',
        prerequisites: ['dashboard-navigation'],
        objectives: [
          'Diagnose common technical issues quickly',
          'Apply standard troubleshooting procedures',
          'Know when to escalate to technical support',
          'Maintain service continuity during problems'
        ],
        content: {
          sections: [
            {
              title: 'Common Issue Patterns',
              type: 'text',
              content: {
                troubleshooting_guides: [
                  {
                    issue: 'AI Not Understanding Patient',
                    symptoms: ['AI repeatedly asks same question', 'Patient getting frustrated', 'Confidence score below 60%'],
                    quick_fix: ['Take over the call', 'Apologize for confusion', 'Complete task manually', 'Note issue in feedback'],
                    prevention: ['Monitor confidence scores', 'Intervene early', 'Coach clear communication']
                  }
                ]
              },
              duration: 30
            },
            {
              title: 'Hands-on Troubleshooting',
              type: 'simulation',
              content: {
                scenarioType: 'technical-issue',
                issues: ['low_confidence', 'call_dropout', 'verification_failure']
              },
              duration: 45
            }
          ]
        },
        assessment: {
          questions: [
            {
              id: 'trouble1',
              type: 'practical',
              question: 'The AI confidence score drops to 45% during a call. What are your next steps?',
              correctAnswer: 'Take over call, apologize to patient, complete task manually, log feedback',
              explanation: 'Low confidence scores indicate the AI is struggling and human intervention is needed.',
              competencyArea: 'Technical Troubleshooting',
              points: 2
            }
          ],
          passingScore: 85,
          timeLimit: 2700 // 45 minutes
        },
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01')
      }
    ];
  }
}