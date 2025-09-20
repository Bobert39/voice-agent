import CompetencyAssessmentService from '../services/competencyAssessmentService';

describe('CompetencyAssessmentService', () => {
  let assessmentService: CompetencyAssessmentService;

  beforeEach(() => {
    assessmentService = new CompetencyAssessmentService();
  });

  describe('startAssessment', () => {
    it('should successfully start an assessment for a qualified user', async () => {
      const { assessmentId, module } = await assessmentService.startAssessment('user_test', 'core_competencies');

      expect(assessmentId).toMatch(/^assessment_/);
      expect(module).toBeDefined();
      expect(module.id).toBe('core_competencies');
      expect(module.name).toBe('Core AI System Competencies');
      expect(module.questions.length).toBeGreaterThan(0);
    });

    it('should reject assessment start for non-existent module', async () => {
      await expect(
        assessmentService.startAssessment('user_test', 'non_existent_module')
      ).rejects.toThrow('Assessment module not found');
    });

    it('should reject assessment start when prerequisites not met', async () => {
      // Try to start advanced escalation without completing core competencies
      await expect(
        assessmentService.startAssessment('user_test', 'advanced_escalation')
      ).rejects.toThrow('Missing prerequisites');
    });

    it('should allow assessment restart within attempt limits', async () => {
      const user = 'user_attempt_test';
      const module = 'core_competencies';

      // First attempt
      const { assessmentId: firstId } = await assessmentService.startAssessment(user, module);
      expect(firstId).toBeDefined();

      // Second attempt should be allowed
      const { assessmentId: secondId } = await assessmentService.startAssessment(user, module);
      expect(secondId).toBeDefined();
      expect(secondId).not.toBe(firstId);
    });
  });

  describe('submitAssessment', () => {
    let assessmentId: string;
    let moduleId: string;
    let userId: string;

    beforeEach(async () => {
      userId = 'user_submit_test';
      moduleId = 'core_competencies';
      const { assessmentId: id } = await assessmentService.startAssessment(userId, moduleId);
      assessmentId = id;
    });

    it('should successfully submit assessment with correct answers', async () => {
      const answers = [
        {
          questionId: 'emergency_001',
          answer: 'Immediately escalate as CRITICAL and advise calling 911',
          timeSpent: 30
        },
        {
          questionId: 'hipaa_001',
          answer: 'Only when you have verified authorization on file',
          timeSpent: 45
        },
        {
          questionId: 'communication_001',
          answer: 'Immediately take over the call, introduce yourself, and speak slowly and clearly',
          timeSpent: 25
        },
        {
          questionId: 'system_001',
          answer: ['Navigate to escalations panel', 'Identify HIGH priority items', 'Click accept within 5 minutes', 'Take over call professionally'],
          timeSpent: 60
        }
      ];

      const practicalTaskResults = [
        {
          taskId: 'full_interaction_001',
          score: 0.85,
          evaluatorNotes: 'Excellent performance with minor areas for improvement',
          timeSpent: 12 * 60 // 12 minutes
        }
      ];

      const result = await assessmentService.submitAssessment(
        userId,
        moduleId,
        assessmentId,
        answers,
        practicalTaskResults
      );

      expect(result).toBeDefined();
      expect(result.assessmentId).toBe(assessmentId);
      expect(result.score).toBeGreaterThan(80); // Should pass
      expect(result.passed).toBe(true);
      expect(result.answers.length).toBe(4);
      expect(result.feedback).toContain('Great job!');
    });

    it('should fail assessment with incorrect answers', async () => {
      const answers = [
        {
          questionId: 'emergency_001',
          answer: 'Ask for their insurance information first', // Wrong answer
          timeSpent: 30
        },
        {
          questionId: 'hipaa_001',
          answer: 'Whenever they ask politely', // Wrong answer
          timeSpent: 45
        }
      ];

      const result = await assessmentService.submitAssessment(
        userId,
        moduleId,
        assessmentId,
        answers
      );

      expect(result.score).toBeLessThan(80); // Should fail
      expect(result.passed).toBe(false);
      expect(result.feedback).toContain('not passed');
    });

    it('should generate certificate for passing assessment', async () => {
      const answers = [
        {
          questionId: 'emergency_001',
          answer: 'Immediately escalate as CRITICAL and advise calling 911',
          timeSpent: 30
        },
        {
          questionId: 'hipaa_001',
          answer: 'Only when you have verified authorization on file',
          timeSpent: 45
        },
        {
          questionId: 'communication_001',
          answer: 'Immediately take over the call, introduce yourself, and speak slowly and clearly',
          timeSpent: 25
        },
        {
          questionId: 'system_001',
          answer: ['Navigate to escalations panel', 'Identify HIGH priority items', 'Click accept within 5 minutes', 'Take over call professionally'],
          timeSpent: 60
        }
      ];

      const practicalTaskResults = [
        {
          taskId: 'full_interaction_001',
          score: 0.9,
          evaluatorNotes: 'Outstanding performance',
          timeSpent: 10 * 60
        }
      ];

      const result = await assessmentService.submitAssessment(
        userId,
        moduleId,
        assessmentId,
        answers,
        practicalTaskResults
      );

      expect(result.passed).toBe(true);
      expect(result.feedback).toContain('certificate');

      // Check that competency profile was updated
      const profile = await assessmentService.getCompetencyProfile(userId);
      expect(profile.currentCertifications.length).toBeGreaterThan(0);
      expect(profile.completedAssessments.length).toBeGreaterThan(0);
    });
  });

  describe('getAssessmentResult', () => {
    it('should return assessment result for existing assessment', async () => {
      const userId = 'user_result_test';
      const moduleId = 'core_competencies';
      const { assessmentId } = await assessmentService.startAssessment(userId, moduleId);

      const answers = [
        {
          questionId: 'emergency_001',
          answer: 'Immediately escalate as CRITICAL and advise calling 911',
          timeSpent: 30
        }
      ];

      await assessmentService.submitAssessment(userId, moduleId, assessmentId, answers);

      const result = await assessmentService.getAssessmentResult(assessmentId);

      expect(result).toBeDefined();
      expect(result!.assessmentId).toBe(assessmentId);
      expect(result!.userId).toBe(userId);
      expect(result!.moduleId).toBe(moduleId);
    });

    it('should return null for non-existent assessment', async () => {
      const result = await assessmentService.getAssessmentResult('non_existent_id');
      expect(result).toBeNull();
    });
  });

  describe('getCompetencyProfile', () => {
    it('should return competency profile for any user', async () => {
      const profile = await assessmentService.getCompetencyProfile('new_user_test');

      expect(profile).toBeDefined();
      expect(profile.userId).toBe('new_user_test');
      expect(profile.role).toBeDefined();
      expect(profile.currentCertifications).toBeInstanceOf(Array);
      expect(profile.completedAssessments).toBeInstanceOf(Array);
      expect(profile.competencyScores).toBeDefined();
      expect(profile.overallCompetencyLevel).toBeDefined();
    });

    it('should update competency profile after successful assessment', async () => {
      const userId = 'user_profile_test';
      const moduleId = 'core_competencies';

      // Get initial profile
      const initialProfile = await assessmentService.getCompetencyProfile(userId);
      expect(initialProfile.completedAssessments.length).toBe(0);

      // Complete assessment
      const { assessmentId } = await assessmentService.startAssessment(userId, moduleId);
      const answers = [
        {
          questionId: 'emergency_001',
          answer: 'Immediately escalate as CRITICAL and advise calling 911',
          timeSpent: 30
        },
        {
          questionId: 'hipaa_001',
          answer: 'Only when you have verified authorization on file',
          timeSpent: 45
        },
        {
          questionId: 'communication_001',
          answer: 'Immediately take over the call, introduce yourself, and speak slowly and clearly',
          timeSpent: 25
        },
        {
          questionId: 'system_001',
          answer: ['Navigate to escalations panel', 'Identify HIGH priority items', 'Click accept within 5 minutes', 'Take over call professionally'],
          timeSpent: 60
        }
      ];

      await assessmentService.submitAssessment(userId, moduleId, assessmentId, answers);

      // Check updated profile
      const updatedProfile = await assessmentService.getCompetencyProfile(userId);
      expect(updatedProfile.completedAssessments.length).toBeGreaterThan(0);
      expect(updatedProfile.overallCompetencyLevel).not.toBe('novice');
    });
  });

  describe('getLearningPath', () => {
    it('should return learning path by ID', async () => {
      const path = await assessmentService.getLearningPath('receptionist_path');

      expect(path).toBeDefined();
      expect(path!.id).toBe('receptionist_path');
      expect(path!.targetRole).toBe('receptionist');
      expect(path!.modules.length).toBeGreaterThan(0);
      expect(path!.totalEstimatedHours).toBeGreaterThan(0);
    });

    it('should return learning path by target role', async () => {
      const path = await assessmentService.getLearningPath('manager');

      expect(path).toBeDefined();
      expect(path!.targetRole).toBe('manager');
      expect(path!.modules.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent path', async () => {
      const path = await assessmentService.getLearningPath('non_existent_path');
      expect(path).toBeNull();
    });
  });

  describe('getLearningPathProgress', () => {
    it('should return learning path progress for user', async () => {
      const userId = 'user_progress_test';
      const pathId = 'receptionist_path';

      const progress = await assessmentService.getLearningPathProgress(userId, pathId);

      expect(progress).toBeDefined();
      expect(progress!.path.id).toBe(pathId);
      expect(progress!.progress).toBeInstanceOf(Array);
      expect(progress!.overallProgress).toBeGreaterThanOrEqual(0);
      expect(progress!.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should show updated progress after completing modules', async () => {
      const userId = 'user_progress_complete_test';
      const pathId = 'receptionist_path';

      // Get initial progress
      const initialProgress = await assessmentService.getLearningPathProgress(userId, pathId);
      expect(initialProgress!.overallProgress).toBe(0);

      // Complete core competencies assessment
      const { assessmentId } = await assessmentService.startAssessment(userId, 'core_competencies');
      const answers = [
        {
          questionId: 'emergency_001',
          answer: 'Immediately escalate as CRITICAL and advise calling 911',
          timeSpent: 30
        },
        {
          questionId: 'hipaa_001',
          answer: 'Only when you have verified authorization on file',
          timeSpent: 45
        },
        {
          questionId: 'communication_001',
          answer: 'Immediately take over the call, introduce yourself, and speak slowly and clearly',
          timeSpent: 25
        },
        {
          questionId: 'system_001',
          answer: ['Navigate to escalations panel', 'Identify HIGH priority items', 'Click accept within 5 minutes', 'Take over call professionally'],
          timeSpent: 60
        }
      ];

      await assessmentService.submitAssessment(userId, 'core_competencies', assessmentId, answers);

      // Check updated progress
      const updatedProgress = await assessmentService.getLearningPathProgress(userId, pathId);
      expect(updatedProgress!.overallProgress).toBeGreaterThan(0);

      const coreCompetencyProgress = updatedProgress!.progress.find(p => p.moduleId === 'core_competencies');
      expect(coreCompetencyProgress?.completed).toBe(true);
    });
  });

  describe('getCompetencyAnalytics', () => {
    beforeEach(async () => {
      // Complete some assessments for analytics
      const user1 = 'analytics_user_1';
      const user2 = 'analytics_user_2';

      // User 1 - successful assessment
      const { assessmentId: id1 } = await assessmentService.startAssessment(user1, 'core_competencies');
      await assessmentService.submitAssessment(user1, 'core_competencies', id1, [
        {
          questionId: 'emergency_001',
          answer: 'Immediately escalate as CRITICAL and advise calling 911',
          timeSpent: 30
        }
      ]);

      // User 2 - failed assessment
      const { assessmentId: id2 } = await assessmentService.startAssessment(user2, 'core_competencies');
      await assessmentService.submitAssessment(user2, 'core_competencies', id2, [
        {
          questionId: 'emergency_001',
          answer: 'Ask for their insurance information first', // Wrong answer
          timeSpent: 30
        }
      ]);
    });

    it('should return comprehensive competency analytics', async () => {
      const analytics = await assessmentService.getCompetencyAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics.totalAssessments).toBeGreaterThan(0);
      expect(analytics.passRate).toBeGreaterThanOrEqual(0);
      expect(analytics.averageScore).toBeGreaterThanOrEqual(0);
      expect(analytics.competencyDistribution).toBeDefined();
      expect(analytics.certificationsIssued).toBeGreaterThanOrEqual(0);
      expect(analytics.topPerformers).toBeInstanceOf(Array);
      expect(analytics.improvementAreas).toBeInstanceOf(Array);
    });

    it('should calculate pass rate correctly', async () => {
      const analytics = await assessmentService.getCompetencyAnalytics();

      expect(analytics.passRate).toBeGreaterThanOrEqual(0);
      expect(analytics.passRate).toBeLessThanOrEqual(100);
    });

    it('should identify top performers', async () => {
      const analytics = await assessmentService.getCompetencyAnalytics();

      expect(analytics.topPerformers.length).toBeGreaterThanOrEqual(0);
      if (analytics.topPerformers.length > 1) {
        // Should be sorted by average score descending
        expect(analytics.topPerformers[0]?.averageScore).toBeGreaterThanOrEqual(
          analytics.topPerformers[1]?.averageScore || 0
        );
      }
    });
  });
});