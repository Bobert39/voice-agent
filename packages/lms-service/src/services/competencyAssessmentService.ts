import { logger, auditLog } from '../utils/logger';
import { AssessmentQuestion, AssessmentResult, Certificate } from '../types';

// Extended interfaces for competency assessment
interface CompetencyModule {
  id: string;
  name: string;
  description: string;
  competencyAreas: string[];
  questions: AssessmentQuestion[];
  practicalTasks: PracticalTask[];
  passingScore: number;
  timeLimit: number; // minutes
  maxAttempts: number;
  certificateTemplate: string;
  prerequisites: string[];
  validityDays: number;
}

interface PracticalTask {
  id: string;
  description: string;
  type: 'simulator' | 'scenario_response' | 'demonstration';
  instructions: string[];
  evaluationCriteria: EvaluationCriterion[];
  timeLimit: number; // minutes
  passingThreshold: number; // 0-1
  resources: string[];
}

interface EvaluationCriterion {
  criterion: string;
  weight: number;
  description: string;
  levels: {
    excellent: { score: number; description: string };
    good: { score: number; description: string };
    satisfactory: { score: number; description: string };
    needsImprovement: { score: number; description: string };
  };
}

interface CompetencyProfile {
  userId: string;
  role: string;
  currentCertifications: Certificate[];
  completedAssessments: AssessmentResult[];
  competencyScores: Record<string, number>;
  strengthAreas: string[];
  improvementAreas: string[];
  nextRecommendedModules: string[];
  lastAssessmentDate: Date;
  overallCompetencyLevel: 'novice' | 'developing' | 'proficient' | 'expert';
}

interface LearningPath {
  id: string;
  name: string;
  description: string;
  targetRole: string;
  modules: Array<{
    moduleId: string;
    order: number;
    required: boolean;
    estimatedHours: number;
  }>;
  totalEstimatedHours: number;
  certificationsEarned: string[];
}

class CompetencyAssessmentService {
  private modules: Map<string, CompetencyModule> = new Map();
  private assessmentResults: Map<string, AssessmentResult> = new Map();
  private certificates: Map<string, Certificate> = new Map();
  private competencyProfiles: Map<string, CompetencyProfile> = new Map();
  private learningPaths: Map<string, LearningPath> = new Map();

  constructor() {
    this.initializeAssessmentModules();
    this.initializeLearningPaths();
  }

  private initializeAssessmentModules() {
    // Core Competency Assessment Module
    const coreCompetencyModule: CompetencyModule = {
      id: 'core_competencies',
      name: 'Core AI System Competencies',
      description: 'Essential skills for working with the AI voice agent system',
      competencyAreas: ['Emergency Response', 'Patient Communication', 'System Navigation', 'HIPAA Compliance'],
      questions: [
        {
          id: 'emergency_001',
          type: 'scenario_based',
          question: 'A patient calls and immediately says "I\'m having chest pain." What is your immediate response?',
          options: [
            'Ask for their insurance information first',
            'Schedule them for the next available appointment',
            'Immediately escalate as CRITICAL and advise calling 911',
            'Transfer them to voicemail'
          ],
          correctAnswer: 'Immediately escalate as CRITICAL and advise calling 911',
          explanation: 'Medical emergencies always take priority over appointments. Patient safety comes first.',
          competencyArea: 'Emergency Response',
          points: 5
        },
        {
          id: 'hipaa_001',
          type: 'multiple_choice',
          question: 'When can you share patient health information with a family member?',
          options: [
            'Whenever they ask politely',
            'Only when you have verified authorization on file',
            'When the patient seems confused',
            'During emergencies only'
          ],
          correctAnswer: 'Only when you have verified authorization on file',
          explanation: 'HIPAA requires explicit authorization before sharing PHI with anyone, including family.',
          competencyArea: 'HIPAA Compliance',
          points: 4
        },
        {
          id: 'communication_001',
          type: 'scenario_based',
          question: 'An elderly patient is confused and frustrated because they can\'t understand the AI. How do you handle this?',
          options: [
            'Tell them the AI is working fine and they need to speak more clearly',
            'Immediately take over the call, introduce yourself, and speak slowly and clearly',
            'Transfer them to a supervisor',
            'Ask them to call back later'
          ],
          correctAnswer: 'Immediately take over the call, introduce yourself, and speak slowly and clearly',
          explanation: 'Empathy and accommodation are key to excellent patient service.',
          competencyArea: 'Patient Communication',
          points: 3
        },
        {
          id: 'system_001',
          type: 'practical',
          question: 'Using the dashboard, demonstrate how to accept a HIGH priority escalation within the 5-minute SLA.',
          correctAnswer: ['Navigate to escalations panel', 'Identify HIGH priority items', 'Click accept within 5 minutes', 'Take over call professionally'],
          explanation: 'Quick escalation response is critical for patient satisfaction and safety.',
          competencyArea: 'System Navigation',
          points: 4
        }
      ],
      practicalTasks: [
        {
          id: 'full_interaction_001',
          description: 'Handle a complete patient interaction from greeting to appointment confirmation',
          type: 'simulator',
          instructions: [
            'Accept the incoming escalation',
            'Take over the call professionally',
            'Verify patient identity using appropriate methods',
            'Address patient concern or request',
            'Complete appointment scheduling if applicable',
            'Provide appropriate follow-up information',
            'Document the interaction properly'
          ],
          evaluationCriteria: [
            {
              criterion: 'Professional Communication',
              weight: 0.25,
              description: 'Clear, empathetic, and professional interaction',
              levels: {
                excellent: { score: 1.0, description: 'Exceptional communication with perfect tone and clarity' },
                good: { score: 0.8, description: 'Good communication with minor areas for improvement' },
                satisfactory: { score: 0.6, description: 'Adequate communication meeting basic standards' },
                needsImprovement: { score: 0.4, description: 'Communication needs significant improvement' }
              }
            },
            {
              criterion: 'HIPAA Compliance',
              weight: 0.30,
              description: 'Proper verification and protection of patient information',
              levels: {
                excellent: { score: 1.0, description: 'Perfect HIPAA compliance with all protocols followed' },
                good: { score: 0.8, description: 'Good compliance with minor protocol deviations' },
                satisfactory: { score: 0.6, description: 'Basic compliance meeting minimum requirements' },
                needsImprovement: { score: 0.4, description: 'HIPAA violations or significant compliance issues' }
              }
            },
            {
              criterion: 'Task Completion',
              weight: 0.25,
              description: 'Successfully completing the patient\'s request',
              levels: {
                excellent: { score: 1.0, description: 'Task completed efficiently with patient fully satisfied' },
                good: { score: 0.8, description: 'Task completed with minor inefficiencies' },
                satisfactory: { score: 0.6, description: 'Task completed meeting basic requirements' },
                needsImprovement: { score: 0.4, description: 'Task not completed or major issues encountered' }
              }
            },
            {
              criterion: 'System Navigation',
              weight: 0.20,
              description: 'Efficient use of dashboard and system features',
              levels: {
                excellent: { score: 1.0, description: 'Expert system navigation with optimal efficiency' },
                good: { score: 0.8, description: 'Good system use with minor navigation delays' },
                satisfactory: { score: 0.6, description: 'Basic system navigation meeting requirements' },
                needsImprovement: { score: 0.4, description: 'Significant navigation difficulties or errors' }
              }
            }
          ],
          timeLimit: 15,
          passingThreshold: 0.7,
          resources: ['Dashboard access', 'Patient simulator', 'Quick reference cards']
        }
      ],
      passingScore: 80,
      timeLimit: 60, // 1 hour
      maxAttempts: 3,
      certificateTemplate: 'ai_system_certified',
      prerequisites: [],
      validityDays: 365
    };

    // Advanced Escalation Handling Module
    const escalationModule: CompetencyModule = {
      id: 'advanced_escalation',
      name: 'Advanced Escalation Handling',
      description: 'Advanced skills for complex escalation scenarios',
      competencyAreas: ['Complex Problem Solving', 'Crisis Management', 'Multi-channel Coordination'],
      questions: [
        {
          id: 'escalation_001',
          type: 'scenario_based',
          question: 'You have 3 CRITICAL escalations, 5 HIGH escalations, and 8 MEDIUM escalations in your queue. How do you prioritize?',
          options: [
            'Handle them in the order they arrived',
            'Handle all CRITICAL first, then HIGH, then MEDIUM',
            'Delegate some to other staff members',
            'Focus on the ones that look easiest to resolve'
          ],
          correctAnswer: 'Handle all CRITICAL first, then HIGH, then MEDIUM',
          explanation: 'Priority-based triage ensures patient safety and optimal resource allocation.',
          competencyArea: 'Crisis Management',
          points: 4
        }
      ],
      practicalTasks: [
        {
          id: 'multi_escalation_001',
          description: 'Manage multiple concurrent escalations with varying priorities',
          type: 'simulator',
          instructions: [
            'Monitor incoming escalations',
            'Prioritize based on urgency and severity',
            'Handle CRITICAL escalations immediately',
            'Delegate appropriately when overwhelmed',
            'Maintain quality service across all interactions'
          ],
          evaluationCriteria: [
            {
              criterion: 'Priority Management',
              weight: 0.40,
              description: 'Correct prioritization and sequencing of tasks',
              levels: {
                excellent: { score: 1.0, description: 'Perfect prioritization with optimal outcomes' },
                good: { score: 0.8, description: 'Good prioritization with minor inefficiencies' },
                satisfactory: { score: 0.6, description: 'Basic prioritization meeting requirements' },
                needsImprovement: { score: 0.4, description: 'Poor prioritization causing delays or issues' }
              }
            }
          ],
          timeLimit: 30,
          passingThreshold: 0.75,
          resources: ['Multi-escalation simulator', 'Priority matrix guide']
        }
      ],
      passingScore: 85,
      timeLimit: 90,
      maxAttempts: 2,
      certificateTemplate: 'escalation_expert',
      prerequisites: ['core_competencies'],
      validityDays: 365
    };

    // Store modules
    this.modules.set(coreCompetencyModule.id, coreCompetencyModule);
    this.modules.set(escalationModule.id, escalationModule);

    logger.info('Competency assessment modules initialized', {
      moduleCount: this.modules.size,
      modules: Array.from(this.modules.keys())
    });
  }

  private initializeLearningPaths() {
    // Receptionist Learning Path
    const receptionistPath: LearningPath = {
      id: 'receptionist_path',
      name: 'Receptionist Certification Path',
      description: 'Complete learning path for front desk and reception staff',
      targetRole: 'receptionist',
      modules: [
        { moduleId: 'core_competencies', order: 1, required: true, estimatedHours: 4 },
        { moduleId: 'customer_service_excellence', order: 2, required: true, estimatedHours: 3 },
        { moduleId: 'appointment_scheduling_mastery', order: 3, required: true, estimatedHours: 2 },
        { moduleId: 'basic_troubleshooting', order: 4, required: false, estimatedHours: 2 }
      ],
      totalEstimatedHours: 11,
      certificationsEarned: ['AI System Certified', 'Customer Service Excellence', 'Scheduling Specialist']
    };

    // Manager Learning Path
    const managerPath: LearningPath = {
      id: 'manager_path',
      name: 'Management Certification Path',
      description: 'Comprehensive path for supervisory and management staff',
      targetRole: 'manager',
      modules: [
        { moduleId: 'core_competencies', order: 1, required: true, estimatedHours: 4 },
        { moduleId: 'advanced_escalation', order: 2, required: true, estimatedHours: 6 },
        { moduleId: 'team_coordination', order: 3, required: true, estimatedHours: 4 },
        { moduleId: 'analytics_and_reporting', order: 4, required: true, estimatedHours: 3 },
        { moduleId: 'staff_training_delivery', order: 5, required: false, estimatedHours: 4 }
      ],
      totalEstimatedHours: 21,
      certificationsEarned: ['AI System Certified', 'Escalation Expert', 'Team Leader', 'Analytics Specialist']
    };

    this.learningPaths.set(receptionistPath.id, receptionistPath);
    this.learningPaths.set(managerPath.id, managerPath);
  }

  // Start an assessment
  async startAssessment(userId: string, moduleId: string): Promise<{ assessmentId: string; module: CompetencyModule }> {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Assessment module not found: ${moduleId}`);
    }

    // Check prerequisites
    const userProfile = await this.getCompetencyProfile(userId);
    const missingPrereqs = module.prerequisites.filter(prereq =>
      !userProfile.currentCertifications.some(cert => cert.moduleId === prereq)
    );

    if (missingPrereqs.length > 0) {
      throw new Error(`Missing prerequisites: ${missingPrereqs.join(', ')}`);
    }

    // Check attempt limits
    const previousAttempts = userProfile.completedAssessments.filter(
      result => result.moduleId === moduleId
    ).length;

    if (previousAttempts >= module.maxAttempts) {
      throw new Error(`Maximum attempts (${module.maxAttempts}) exceeded for this module`);
    }

    const assessmentId = `assessment_${userId}_${moduleId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    auditLog.userAccess(userId, 'ASSESSMENT_START', `/assessment/${moduleId}`, true);

    logger.info('Assessment started', {
      assessmentId,
      userId,
      moduleId,
      attemptNumber: previousAttempts + 1
    });

    return { assessmentId, module };
  }

  // Submit assessment answers
  async submitAssessment(
    userId: string,
    moduleId: string,
    assessmentId: string,
    answers: Array<{
      questionId: string;
      answer: string | string[];
      timeSpent: number;
    }>,
    practicalTaskResults?: Array<{
      taskId: string;
      score: number;
      evaluatorNotes: string;
      timeSpent: number;
    }>
  ): Promise<AssessmentResult> {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Assessment module not found: ${moduleId}`);
    }

    // Calculate scores
    let totalScore = 0;
    let maxScore = 0;
    const questionResults = [];

    for (const answer of answers) {
      const question = module.questions.find(q => q.id === answer.questionId);
      if (!question) continue;

      const isCorrect = this.evaluateAnswer(question, answer.answer);
      const points = isCorrect ? question.points : 0;

      questionResults.push({
        questionId: answer.questionId,
        answer: answer.answer,
        correct: isCorrect,
        points
      });

      totalScore += points;
      maxScore += question.points;
    }

    // Add practical task scores
    if (practicalTaskResults) {
      for (const taskResult of practicalTaskResults) {
        const task = module.practicalTasks.find(t => t.id === taskResult.taskId);
        if (task) {
          const taskPoints = Math.round(taskResult.score * 20); // Convert 0-1 score to points
          totalScore += taskPoints;
          maxScore += 20;
        }
      }
    }

    const finalScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const passed = finalScore >= module.passingScore;

    const result: AssessmentResult = {
      userId,
      moduleId,
      assessmentId,
      score: finalScore,
      maxScore: 100,
      passed,
      answers: questionResults,
      timeSpent: answers.reduce((sum, a) => sum + a.timeSpent, 0),
      completedAt: new Date(),
      feedback: this.generateFeedback(finalScore, module.passingScore, questionResults)
    };

    this.assessmentResults.set(assessmentId, result);

    // Generate certificate if passed
    if (passed) {
      const certificate = await this.generateCertificate(userId, moduleId, result);
      result.feedback += `\n\nCongratulations! You have earned the "${certificate.certificateName}" certificate.`;
    }

    // Update competency profile
    await this.updateCompetencyProfile(userId, result);

    auditLog.userAccess(userId, 'ASSESSMENT_COMPLETE', `/assessment/${moduleId}`, true);

    logger.info('Assessment completed', {
      assessmentId,
      userId,
      moduleId,
      score: finalScore,
      passed,
      certificateEarned: passed
    });

    return result;
  }

  // Get assessment result
  async getAssessmentResult(assessmentId: string): Promise<AssessmentResult | null> {
    return this.assessmentResults.get(assessmentId) || null;
  }

  // Get user's competency profile
  async getCompetencyProfile(userId: string): Promise<CompetencyProfile> {
    let profile = this.competencyProfiles.get(userId);

    if (!profile) {
      // Create new profile
      profile = {
        userId,
        role: 'receptionist', // Default, should be fetched from user service
        currentCertifications: [],
        completedAssessments: [],
        competencyScores: {},
        strengthAreas: [],
        improvementAreas: [],
        nextRecommendedModules: ['core_competencies'],
        lastAssessmentDate: new Date(),
        overallCompetencyLevel: 'novice'
      };

      this.competencyProfiles.set(userId, profile);
    }

    return profile;
  }

  // Get learning path for role
  async getLearningPath(roleOrPathId: string): Promise<LearningPath | null> {
    // First try as path ID
    let path = this.learningPaths.get(roleOrPathId);

    if (!path) {
      // Try to find by target role
      path = Array.from(this.learningPaths.values()).find(p => p.targetRole === roleOrPathId);
    }

    return path || null;
  }

  // Get user's progress on learning path
  async getLearningPathProgress(userId: string, pathId: string): Promise<{
    path: LearningPath;
    progress: Array<{
      moduleId: string;
      completed: boolean;
      score?: number;
      certificateEarned?: boolean;
      estimatedTimeRemaining: number;
    }>;
    overallProgress: number;
    estimatedTimeRemaining: number;
  } | null> {
    const path = await this.getLearningPath(pathId);
    if (!path) return null;

    const profile = await this.getCompetencyProfile(userId);

    const progress = path.modules.map(module => {
      const assessment = profile.completedAssessments.find(a => a.moduleId === module.moduleId);
      const certificate = profile.currentCertifications.find(c => c.moduleId === module.moduleId);

      return {
        moduleId: module.moduleId,
        completed: !!assessment?.passed,
        score: assessment?.score,
        certificateEarned: !!certificate,
        estimatedTimeRemaining: assessment?.passed ? 0 : module.estimatedHours
      };
    });

    const completedModules = progress.filter(p => p.completed).length;
    const overallProgress = Math.round((completedModules / path.modules.length) * 100);
    const estimatedTimeRemaining = progress.reduce((sum, p) => sum + p.estimatedTimeRemaining, 0);

    return {
      path,
      progress,
      overallProgress,
      estimatedTimeRemaining
    };
  }

  // Get competency analytics
  async getCompetencyAnalytics(): Promise<{
    totalAssessments: number;
    passRate: number;
    averageScore: number;
    competencyDistribution: Record<string, number>;
    certificationsIssued: number;
    topPerformers: Array<{ userId: string; averageScore: number; certificationsEarned: number }>;
    improvementAreas: Array<{ area: string; averageScore: number; assessmentCount: number }>;
  }> {
    const allResults = Array.from(this.assessmentResults.values());
    const allProfiles = Array.from(this.competencyProfiles.values());

    const totalAssessments = allResults.length;
    const passedAssessments = allResults.filter(r => r.passed).length;
    const passRate = totalAssessments > 0 ? (passedAssessments / totalAssessments) * 100 : 0;

    const averageScore = totalAssessments > 0
      ? allResults.reduce((sum, r) => sum + r.score, 0) / totalAssessments
      : 0;

    const competencyDistribution = allProfiles.reduce((acc, profile) => {
      acc[profile.overallCompetencyLevel] = (acc[profile.overallCompetencyLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const certificationsIssued = Array.from(this.certificates.values()).length;

    // Calculate top performers
    const topPerformers = allProfiles
      .map(profile => ({
        userId: profile.userId,
        averageScore: profile.completedAssessments.length > 0
          ? profile.completedAssessments.reduce((sum, a) => sum + a.score, 0) / profile.completedAssessments.length
          : 0,
        certificationsEarned: profile.currentCertifications.length
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 10);

    // Mock improvement areas data
    const improvementAreas = [
      { area: 'HIPAA Compliance', averageScore: 72, assessmentCount: 45 },
      { area: 'Emergency Response', averageScore: 85, assessmentCount: 38 },
      { area: 'System Navigation', averageScore: 78, assessmentCount: 52 },
      { area: 'Patient Communication', averageScore: 88, assessmentCount: 41 }
    ];

    return {
      totalAssessments,
      passRate,
      averageScore,
      competencyDistribution,
      certificationsIssued,
      topPerformers,
      improvementAreas
    };
  }

  // Private helper methods
  private evaluateAnswer(question: AssessmentQuestion, answer: string | string[]): boolean {
    const correctAnswer = question.correctAnswer;

    if (Array.isArray(correctAnswer)) {
      // Multiple correct answers
      if (Array.isArray(answer)) {
        return correctAnswer.every(correct => answer.includes(correct));
      } else {
        return correctAnswer.includes(answer);
      }
    } else {
      // Single correct answer
      if (Array.isArray(answer)) {
        return answer.includes(correctAnswer);
      } else {
        return answer === correctAnswer;
      }
    }
  }

  private generateFeedback(score: number, passingScore: number, questionResults: any[]): string {
    let feedback = '';

    if (score >= passingScore) {
      if (score >= 95) {
        feedback = 'Excellent! You demonstrated exceptional competency in all areas.';
      } else if (score >= 85) {
        feedback = 'Great job! You showed strong competency with room for minor improvements.';
      } else {
        feedback = 'Good work! You passed the assessment and demonstrated basic competency.';
      }
    } else {
      feedback = `Assessment not passed. You scored ${score}% but need ${passingScore}% to pass. `;

      const incorrectAnswers = questionResults.filter(r => !r.correct);
      if (incorrectAnswers.length > 0) {
        feedback += `Focus on improving your understanding of the areas where you had incorrect answers. `;
      }

      feedback += 'Review the training materials and try again when ready.';
    }

    return feedback;
  }

  private async generateCertificate(userId: string, moduleId: string, _result: AssessmentResult): Promise<Certificate> {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error('Module not found for certificate generation');
    }

    const certificateId = `cert_${userId}_${moduleId}_${Date.now()}`;
    const verificationCode = this.generateVerificationCode();

    const certificate: Certificate = {
      id: certificateId,
      userId,
      moduleId,
      certificateName: this.getCertificateName(module.certificateTemplate),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + (module.validityDays * 24 * 60 * 60 * 1000)),
      validityDays: module.validityDays,
      verificationCode,
      status: 'active'
    };

    this.certificates.set(certificateId, certificate);

    // Add to user's profile
    const profile = await this.getCompetencyProfile(userId);
    profile.currentCertifications.push(certificate);

    logger.info('Certificate generated', {
      certificateId,
      userId,
      moduleId,
      certificateName: certificate.certificateName,
      verificationCode
    });

    return certificate;
  }

  private async updateCompetencyProfile(userId: string, result: AssessmentResult): Promise<void> {
    const profile = await this.getCompetencyProfile(userId);

    // Add assessment result
    profile.completedAssessments.push(result);
    profile.lastAssessmentDate = result.completedAt;

    // Update competency scores by area
    const module = this.modules.get(result.moduleId);
    if (module) {
      module.competencyAreas.forEach(area => {
        profile.competencyScores[area] = result.score;
      });
    }

    // Calculate overall competency level
    const scores = Object.values(profile.competencyScores);
    const averageScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

    if (averageScore >= 90) {
      profile.overallCompetencyLevel = 'expert';
    } else if (averageScore >= 75) {
      profile.overallCompetencyLevel = 'proficient';
    } else if (averageScore >= 60) {
      profile.overallCompetencyLevel = 'developing';
    } else {
      profile.overallCompetencyLevel = 'novice';
    }

    // Update strength and improvement areas
    profile.strengthAreas = Object.entries(profile.competencyScores)
      .filter(([_, score]) => score >= 85)
      .map(([area, _]) => area);

    profile.improvementAreas = Object.entries(profile.competencyScores)
      .filter(([_, score]) => score < 75)
      .map(([area, _]) => area);

    // Update recommended modules
    profile.nextRecommendedModules = this.getRecommendedModules(profile);

    this.competencyProfiles.set(userId, profile);
  }

  private getRecommendedModules(profile: CompetencyProfile): string[] {
    const completedModules = profile.completedAssessments
      .filter(a => a.passed)
      .map(a => a.moduleId);

    const availableModules = Array.from(this.modules.values())
      .filter(module => {
        // Check if not already completed
        if (completedModules.includes(module.id)) return false;

        // Check prerequisites
        const hasPrereqs = module.prerequisites.every(prereq =>
          completedModules.includes(prereq)
        );

        return hasPrereqs;
      })
      .sort((a, b) => a.prerequisites.length - b.prerequisites.length) // Prioritize by prerequisite count
      .slice(0, 3)
      .map(module => module.id);

    return availableModules;
  }

  private getCertificateName(template: string): string {
    const certificateNames: Record<string, string> = {
      'ai_system_certified': 'AI System Certified Professional',
      'escalation_expert': 'Escalation Handling Expert',
      'customer_service_excellence': 'Customer Service Excellence',
      'scheduling_specialist': 'Appointment Scheduling Specialist'
    };

    return certificateNames[template] || 'Competency Certification';
  }

  private generateVerificationCode(): string {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
  }
}

export default CompetencyAssessmentService;