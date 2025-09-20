import { logger, auditLog } from '../utils/logger';

// Simulator Types
interface SimulatorAction {
  type: string;
  target: string;
  parameters?: any;
  validation: (result: any) => boolean;
}

interface SimulatorTask {
  description: string;
  requiredActions: SimulatorAction[];
  optionalActions: SimulatorAction[];
  forbiddenActions: SimulatorAction[];
  timeTarget: number;
}

interface EvaluationCriteria {
  criterion: string;
  weight: number;
  measure: (performance: any) => number;
}

interface ProgressiveHint {
  triggerTime: number;
  message: string;
  penalty: number;
}

interface SystemState {
  activeEscalation?: boolean;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  [key: string]: any;
}

interface SimulatorScenario {
  id: string;
  type: 'call_handling' | 'dashboard_usage' | 'escalation' | 'troubleshooting';
  difficulty: 1 | 2 | 3 | 4 | 5;
  timeLimit: number;
  setup: {
    context: string;
    mockData: any;
    systemState: SystemState;
  };
  tasks: SimulatorTask[];
  evaluation: EvaluationCriteria[];
  hints: ProgressiveHint[];
}

interface SimulatorPerformance {
  scenarioId: string;
  userId: string;
  taskResults: TaskResult[];
  overallScore: number;
  completionTime: number;
  hintsUsed: number;
  slaCompliance: boolean;
  feedback: string;
  timestamp: Date;
}

interface TaskResult {
  taskIndex: number;
  completed: boolean;
  score: number;
  timeSpent: number;
  actionsPerformed: string[];
  violations: string[];
}

class TrainingSimulatorService {
  private scenarios: Map<string, SimulatorScenario> = new Map();
  private activeSimulations: Map<string, SimulationSession> = new Map();

  constructor() {
    this.initializeScenarios();
  }

  private initializeScenarios() {
    // Verification Escalation Scenario
    const verificationEscalationScenario: SimulatorScenario = {
      id: "handle_verification_failure",
      type: "escalation",
      difficulty: 2,
      timeLimit: 300, // 5 minutes

      setup: {
        context: "Elderly patient unable to verify date of birth after 3 attempts",
        mockData: {
          patient: {
            name: "Robert Johnson",
            actualDOB: "1945-03-15",
            attemptedDOBs: ["March 15, 1954", "May 3rd, 1945", "March 5th, 1945"]
          },
          callDuration: 185,
          aiConfidence: 0.3
        },
        systemState: {
          activeEscalation: true,
          priority: "HIGH"
        }
      },

      tasks: [
        {
          description: "Accept the escalation within SLA",
          requiredActions: [{
            type: "click",
            target: "#escalation-accept-btn",
            validation: (result) => result.acceptedWithin < 120
          }],
          optionalActions: [],
          forbiddenActions: [],
          timeTarget: 120
        },
        {
          description: "Take over the call and verify patient using alternative method",
          requiredActions: [
            {
              type: "click",
              target: "#take-over-call-btn",
              validation: (result) => result.callTransferred === true
            },
            {
              type: "speak",
              target: "patient",
              parameters: {
                mustInclude: ["staff member", "help you"],
                tone: "friendly"
              },
              validation: (result) => result.sentimentScore > 0.6
            }
          ],
          optionalActions: [
            {
              type: "lookup",
              target: "patient-history",
              validation: (result) => true
            }
          ],
          forbiddenActions: [
            {
              type: "disclose",
              target: "PHI",
              validation: (result) => !result.phiDisclosed
            }
          ],
          timeTarget: 180
        }
      ],

      evaluation: [
        {
          criterion: "SLA Compliance",
          weight: 0.3,
          measure: (performance) => performance.escalationResponseTime < 120 ? 1 : 0
        },
        {
          criterion: "Patient Satisfaction",
          weight: 0.3,
          measure: (performance) => performance.patientSentiment
        },
        {
          criterion: "HIPAA Compliance",
          weight: 0.3,
          measure: (performance) => performance.phiProtected ? 1 : 0
        },
        {
          criterion: "Efficiency",
          weight: 0.1,
          measure: (performance) => Math.max(0, 1 - performance.totalTime / 300)
        }
      ],

      hints: [
        {
          triggerTime: 60,
          message: "Remember to accept the escalation first!",
          penalty: 0.05
        },
        {
          triggerTime: 180,
          message: "Consider using address verification as an alternative",
          penalty: 0.1
        }
      ]
    };

    // Confused Elderly Patient Scenario
    const confusedElderlyScenario: SimulatorScenario = {
      id: "confused_elderly_patient",
      type: "call_handling",
      difficulty: 1,
      timeLimit: 420, // 7 minutes

      setup: {
        context: "Elderly patient with hearing impairment is confused about AI interaction",
        mockData: {
          patient: {
            name: "Margaret Thompson",
            age: 78,
            conditions: ["Mild hearing impairment"],
            preferredCommunication: "Slow, clear speech"
          },
          conversationHistory: [
            { speaker: "AI", text: "Good morning! I understand you'd like to schedule an appointment?" },
            { speaker: "Patient", text: "What? I can't... who is this? Is this the eye doctor?" },
            { speaker: "AI", text: "Yes, this is Capitol Eye Care. Can you please tell me your name?" },
            { speaker: "Patient", text: "I don't understand. I need to see Dr. Johnson. Hello?" }
          ],
          escalationReason: "Patient confusion, potential hearing difficulty",
          aiRecommendation: "Transfer to human agent for assisted communication"
        },
        systemState: {
          activeEscalation: true,
          priority: "MEDIUM"
        }
      },

      tasks: [
        {
          description: "Take over the call smoothly",
          requiredActions: [
            {
              type: "click",
              target: "#take-over-call-btn",
              validation: (result) => result.callTransferred === true
            },
            {
              type: "speak",
              target: "patient",
              parameters: {
                mustInclude: ["staff member", "Capitol Eye Care"],
                tone: "reassuring",
                pace: "slow"
              },
              validation: (result) => result.sentimentScore > 0.7
            }
          ],
          optionalActions: [],
          forbiddenActions: [],
          timeTarget: 60
        },
        {
          description: "Complete appointment scheduling with appropriate accommodation",
          requiredActions: [
            {
              type: "speak",
              target: "patient",
              parameters: {
                accommodations: ["slow pace", "clear pronunciation", "confirmation"],
                mustComplete: "appointment_booking"
              },
              validation: (result) => result.appointmentScheduled === true
            }
          ],
          optionalActions: [
            {
              type: "note",
              target: "patient-file",
              parameters: { note: "hearing accommodation needed" },
              validation: (result) => true
            }
          ],
          forbiddenActions: [],
          timeTarget: 300
        }
      ],

      evaluation: [
        {
          criterion: "Patient Comfort",
          weight: 0.4,
          measure: (performance) => performance.patientSentiment
        },
        {
          criterion: "Task Completion",
          weight: 0.3,
          measure: (performance) => performance.appointmentCompleted ? 1 : 0
        },
        {
          criterion: "Accommodation Quality",
          weight: 0.2,
          measure: (performance) => performance.accommodationScore
        },
        {
          criterion: "Efficiency",
          weight: 0.1,
          measure: (performance) => Math.max(0, 1 - performance.totalTime / 420)
        }
      ],

      hints: [
        {
          triggerTime: 120,
          message: "Consider speaking more slowly and confirming understanding",
          penalty: 0.05
        },
        {
          triggerTime: 240,
          message: "Add notes about patient's hearing needs for future calls",
          penalty: 0.1
        }
      ]
    };

    // Technical Issue Troubleshooting Scenario
    const technicalTroubleshootingScenario: SimulatorScenario = {
      id: "ai_not_understanding",
      type: "troubleshooting",
      difficulty: 3,
      timeLimit: 240, // 4 minutes

      setup: {
        context: "AI repeatedly failing to understand patient with accent, confidence score dropping",
        mockData: {
          patient: {
            name: "Carlos Martinez",
            accent: "Spanish",
            frustrationLevel: "moderate"
          },
          aiMetrics: {
            confidenceScore: 0.4,
            consecutiveFailures: 4,
            patientRepetitions: 6
          },
          callDuration: 280
        },
        systemState: {
          activeEscalation: false,
          priority: "MEDIUM",
          autoEscalationPending: true
        }
      },

      tasks: [
        {
          description: "Identify the technical issue quickly",
          requiredActions: [
            {
              type: "check",
              target: "#ai-confidence-score",
              validation: (result) => result.scoreChecked === true
            },
            {
              type: "assess",
              target: "situation",
              parameters: { factors: ["accent", "background_noise", "ai_confusion"] },
              validation: (result) => result.issueIdentified === "accent_recognition"
            }
          ],
          optionalActions: [],
          forbiddenActions: [],
          timeTarget: 60
        },
        {
          description: "Take corrective action",
          requiredActions: [
            {
              type: "click",
              target: "#manual-takeover-btn",
              validation: (result) => result.takeoverInitiated === true
            },
            {
              type: "speak",
              target: "patient",
              parameters: {
                language: "accommodating",
                mustInclude: ["apologize", "staff member", "help"]
              },
              validation: (result) => result.patientCalmed === true
            }
          ],
          optionalActions: [
            {
              type: "report",
              target: "ai-team",
              parameters: { issue: "accent_recognition_failure" },
              validation: (result) => true
            }
          ],
          forbiddenActions: [],
          timeTarget: 120
        }
      ],

      evaluation: [
        {
          criterion: "Issue Recognition Speed",
          weight: 0.3,
          measure: (performance) => Math.max(0, 1 - performance.identificationTime / 60)
        },
        {
          criterion: "Customer Recovery",
          weight: 0.4,
          measure: (performance) => performance.patientSatisfactionRecovery
        },
        {
          criterion: "Process Adherence",
          weight: 0.2,
          measure: (performance) => performance.processStepsFollowed / performance.totalProcessSteps
        },
        {
          criterion: "Learning Contribution",
          weight: 0.1,
          measure: (performance) => performance.reportSubmitted ? 1 : 0
        }
      ],

      hints: [
        {
          triggerTime: 45,
          message: "Check the AI confidence score indicator",
          penalty: 0.05
        },
        {
          triggerTime: 120,
          message: "Consider if this could be an accent recognition issue",
          penalty: 0.1
        }
      ]
    };

    // Store scenarios
    this.scenarios.set(verificationEscalationScenario.id, verificationEscalationScenario);
    this.scenarios.set(confusedElderlyScenario.id, confusedElderlyScenario);
    this.scenarios.set(technicalTroubleshootingScenario.id, technicalTroubleshootingScenario);

    logger.info('Training scenarios initialized', {
      scenarioCount: this.scenarios.size,
      scenarios: Array.from(this.scenarios.keys())
    });
  }

  // Start a new simulation session
  async startSimulation(userId: string, scenarioId: string): Promise<SimulationSession> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    const sessionId = `sim_${userId}_${scenarioId}_${Date.now()}`;
    const session: SimulationSession = {
      id: sessionId,
      userId,
      scenarioId,
      status: 'active',
      startTime: new Date(),
      currentTaskIndex: 0,
      performance: {
        actionsPerformed: [],
        hintsUsed: 0,
        violations: [],
        taskScores: []
      },
      scenario
    };

    this.activeSimulations.set(sessionId, session);

    auditLog.userAccess(userId, 'SIMULATION_START', `/simulator/${scenarioId}`, true, {
      sessionId,
      difficulty: scenario.difficulty
    });

    logger.info('Simulation started', {
      sessionId,
      userId,
      scenarioId,
      difficulty: scenario.difficulty
    });

    return session;
  }

  // Process a user action during simulation
  async processAction(sessionId: string, action: any): Promise<ActionResult> {
    const session = this.activeSimulations.get(sessionId);
    if (!session) {
      throw new Error(`Simulation session not found: ${sessionId}`);
    }

    const currentTask = session.scenario.tasks[session.currentTaskIndex];
    if (!currentTask) {
      throw new Error('No current task found');
    }

    const result: ActionResult = {
      success: false,
      message: '',
      score: 0,
      violations: [],
      nextHint: null
    };

    // Check forbidden actions first
    const forbiddenAction = currentTask.forbiddenActions.find(fa =>
      fa.type === action.type && fa.target === action.target
    );

    if (forbiddenAction) {
      result.violations.push(`Forbidden action: ${action.type} on ${action.target}`);
      session.performance.violations.push(result.violations[0]);

      logger.warn('Forbidden action attempted', {
        sessionId,
        action: action.type,
        target: action.target
      });

      return result;
    }

    // Check required actions
    const requiredAction = currentTask.requiredActions.find(ra =>
      ra.type === action.type && ra.target === action.target
    );

    if (requiredAction) {
      const validationResult = requiredAction.validation(action.result || {});
      if (validationResult) {
        result.success = true;
        result.score = 100;
        result.message = 'Required action completed successfully';

        session.performance.actionsPerformed.push({
          type: action.type,
          target: action.target,
          timestamp: new Date(),
          score: result.score
        });

        // Check if this completes the task
        const allRequiredCompleted = currentTask.requiredActions.every(ra =>
          session.performance.actionsPerformed.some(ap =>
            ap.type === ra.type && ap.target === ra.target && ap.score > 0
          )
        );

        if (allRequiredCompleted) {
          session.currentTaskIndex++;
          result.message += ' - Task completed!';

          if (session.currentTaskIndex >= session.scenario.tasks.length) {
            await this.completeSimulation(sessionId);
            result.message += ' - Simulation completed!';
          }
        }
      } else {
        result.message = 'Action validation failed';
        result.score = 30;
      }
    }

    // Check optional actions
    const optionalAction = currentTask.optionalActions?.find(oa =>
      oa.type === action.type && oa.target === action.target
    );

    if (optionalAction) {
      result.success = true;
      result.score = 50;
      result.message = 'Optional action completed';

      session.performance.actionsPerformed.push({
        type: action.type,
        target: action.target,
        timestamp: new Date(),
        score: result.score
      });
    }

    // Check if hints should be provided
    const elapsedTime = (Date.now() - session.startTime.getTime()) / 1000;
    const availableHint = session.scenario.hints.find(hint =>
      hint.triggerTime <= elapsedTime &&
      !session.performance.hintsShown?.includes(hint.message)
    );

    if (availableHint) {
      result.nextHint = availableHint;
      session.performance.hintsUsed++;
      session.performance.hintsShown = session.performance.hintsShown || [];
      session.performance.hintsShown.push(availableHint.message);
    }

    return result;
  }

  // Complete a simulation and calculate final score
  async completeSimulation(sessionId: string): Promise<SimulatorPerformance> {
    const session = this.activeSimulations.get(sessionId);
    if (!session) {
      throw new Error(`Simulation session not found: ${sessionId}`);
    }

    session.status = 'completed';
    session.endTime = new Date();

    const completionTime = (session.endTime.getTime() - session.startTime.getTime()) / 1000;

    // Calculate performance based on evaluation criteria
    const performanceData = {
      escalationResponseTime: this.calculateResponseTime(session),
      patientSentiment: this.calculatePatientSentiment(session),
      phiProtected: this.checkHIPAACompliance(session),
      totalTime: completionTime,
      appointmentCompleted: this.checkTaskCompletion(session, 'appointment_booking'),
      accommodationScore: this.calculateAccommodationScore(session),
      patientSatisfactionRecovery: this.calculateRecoveryScore(session),
      processStepsFollowed: this.countProcessSteps(session),
      totalProcessSteps: session.scenario.tasks.length,
      reportSubmitted: this.checkReportSubmission(session),
      identificationTime: this.calculateIdentificationTime(session)
    };

    let overallScore = 0;
    for (const criteria of session.scenario.evaluation) {
      const criteriaScore = criteria.measure(performanceData);
      overallScore += criteriaScore * criteria.weight;
    }

    // Apply hint penalties
    const hintPenalty = session.performance.hintsUsed * 0.05;
    overallScore = Math.max(0, overallScore - hintPenalty);

    const performance: SimulatorPerformance = {
      scenarioId: session.scenarioId,
      userId: session.userId,
      taskResults: this.generateTaskResults(session),
      overallScore: Math.round(overallScore * 100),
      completionTime,
      hintsUsed: session.performance.hintsUsed,
      slaCompliance: this.checkSLACompliance(session),
      feedback: this.generateFeedback(session, overallScore),
      timestamp: new Date()
    };

    // Clean up active session
    this.activeSimulations.delete(sessionId);

    auditLog.userAccess(session.userId, 'SIMULATION_COMPLETE', `/simulator/${session.scenarioId}`, true, {
      sessionId,
      score: performance.overallScore,
      completionTime,
      hintsUsed: session.performance.hintsUsed
    });

    logger.info('Simulation completed', {
      sessionId,
      userId: session.userId,
      scenarioId: session.scenarioId,
      score: performance.overallScore,
      completionTime
    });

    return performance;
  }

  // Get available scenarios
  getScenarios(filters?: { type?: string; difficulty?: number }): SimulatorScenario[] {
    let scenarios = Array.from(this.scenarios.values());

    if (filters?.type) {
      scenarios = scenarios.filter(s => s.type === filters.type);
    }

    if (filters?.difficulty) {
      scenarios = scenarios.filter(s => s.difficulty === filters.difficulty);
    }

    return scenarios;
  }

  // Get simulation session status
  getSimulationStatus(sessionId: string): SimulationStatus | null {
    const session = this.activeSimulations.get(sessionId);
    if (!session) {
      return null;
    }

    const elapsedTime = (Date.now() - session.startTime.getTime()) / 1000;
    const remainingTime = Math.max(0, session.scenario.timeLimit - elapsedTime);

    return {
      sessionId,
      status: session.status,
      currentTaskIndex: session.currentTaskIndex,
      totalTasks: session.scenario.tasks.length,
      elapsedTime,
      remainingTime,
      currentScore: this.calculateCurrentScore(session),
      hintsUsed: session.performance.hintsUsed,
      violations: session.performance.violations.length
    };
  }

  // Helper methods for performance calculation
  private calculateResponseTime(session: SimulationSession): number {
    const firstAction = session.performance.actionsPerformed[0];
    if (!firstAction) return 999;
    return (firstAction.timestamp.getTime() - session.startTime.getTime()) / 1000;
  }

  private calculatePatientSentiment(session: SimulationSession): number {
    // Simulate sentiment based on actions and violations
    let sentiment = 0.8;
    sentiment -= session.performance.violations.length * 0.2;
    sentiment += session.performance.actionsPerformed.filter(a => a.type === 'speak').length * 0.1;
    return Math.max(0, Math.min(1, sentiment));
  }

  private checkHIPAACompliance(session: SimulationSession): boolean {
    return !session.performance.violations.some(v => v.includes('PHI') || v.includes('HIPAA'));
  }

  private checkTaskCompletion(session: SimulationSession, taskType: string): boolean {
    return session.performance.actionsPerformed.some(a =>
      a.target === taskType || (a as any).parameters?.mustComplete === taskType
    );
  }

  private calculateAccommodationScore(session: SimulationSession): number {
    const accommodatingActions = session.performance.actionsPerformed.filter(a =>
      (a as any).parameters?.accommodations || (a as any).parameters?.pace === 'slow'
    );
    return Math.min(1, accommodatingActions.length / 2);
  }

  private calculateRecoveryScore(session: SimulationSession): number {
    // Simulate recovery based on response time and actions
    const responseTime = this.calculateResponseTime(session);
    const recoveryActions = session.performance.actionsPerformed.filter(a => a.type === 'speak').length;
    return Math.max(0, Math.min(1, 1 - (responseTime / 120) + (recoveryActions * 0.2)));
  }

  private countProcessSteps(session: SimulationSession): number {
    return session.performance.actionsPerformed.length;
  }

  private checkReportSubmission(session: SimulationSession): boolean {
    return session.performance.actionsPerformed.some(a => a.type === 'report');
  }

  private calculateIdentificationTime(session: SimulationSession): number {
    const identificationAction = session.performance.actionsPerformed.find(a => a.type === 'assess');
    if (!identificationAction) return 999;
    return (identificationAction.timestamp.getTime() - session.startTime.getTime()) / 1000;
  }

  private generateTaskResults(session: SimulationSession): TaskResult[] {
    return session.scenario.tasks.map((task, index) => ({
      taskIndex: index,
      completed: index < session.currentTaskIndex,
      score: index < session.currentTaskIndex ? 100 : 0,
      timeSpent: 60, // Simplified
      actionsPerformed: session.performance.actionsPerformed
        .filter(a => a.timestamp.getTime() < session.startTime.getTime() + ((index + 1) * 60000))
        .map(a => `${a.type}:${a.target}`),
      violations: session.performance.violations.filter(v => v.includes(`Task ${index + 1}`))
    }));
  }

  private checkSLACompliance(session: SimulationSession): boolean {
    const responseTime = this.calculateResponseTime(session);
    return responseTime < 120; // 2 minutes SLA
  }

  private generateFeedback(session: SimulationSession, score: number): string {
    if (score >= 0.9) {
      return "Excellent! You handled the scenario with professionalism and efficiency.";
    } else if (score >= 0.7) {
      return "Good job! Consider reviewing best practices for even better performance.";
    } else if (score >= 0.5) {
      return "Fair performance. Focus on key training areas and try again.";
    } else {
      return "Needs improvement. Review the training materials and practice more scenarios.";
    }
  }

  private calculateCurrentScore(session: SimulationSession): number {
    const completedTasks = session.currentTaskIndex;
    const totalTasks = session.scenario.tasks.length;
    return Math.round((completedTasks / totalTasks) * 100);
  }
}

// Supporting interfaces
interface SimulationSession {
  id: string;
  userId: string;
  scenarioId: string;
  status: 'active' | 'completed' | 'abandoned';
  startTime: Date;
  endTime?: Date;
  currentTaskIndex: number;
  performance: {
    actionsPerformed: Array<{
      type: string;
      target: string;
      timestamp: Date;
      score: number;
      parameters?: any;
    }>;
    hintsUsed: number;
    hintsShown?: string[];
    violations: string[];
    taskScores: number[];
  };
  scenario: SimulatorScenario;
}

interface ActionResult {
  success: boolean;
  message: string;
  score: number;
  violations: string[];
  nextHint: ProgressiveHint | null;
}

interface SimulationStatus {
  sessionId: string;
  status: string;
  currentTaskIndex: number;
  totalTasks: number;
  elapsedTime: number;
  remainingTime: number;
  currentScore: number;
  hintsUsed: number;
  violations: number;
}

export default TrainingSimulatorService;