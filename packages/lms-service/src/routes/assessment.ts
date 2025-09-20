import express from 'express';
import { z } from 'zod';
import CompetencyAssessmentService from '../services/competencyAssessmentService';
import { logger, auditLog } from '../utils/logger';
import { ApiResponse } from '../types';

const router = express.Router();
const assessmentService = new CompetencyAssessmentService();

// Validation schemas
const StartAssessmentSchema = z.object({
  userId: z.string(),
  moduleId: z.string()
});

const SubmitAssessmentSchema = z.object({
  userId: z.string(),
  moduleId: z.string(),
  assessmentId: z.string(),
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.union([z.string(), z.array(z.string())]),
    timeSpent: z.number().min(0)
  })),
  practicalTaskResults: z.array(z.object({
    taskId: z.string(),
    score: z.number().min(0).max(1),
    evaluatorNotes: z.string(),
    timeSpent: z.number().min(0)
  })).optional()
});

/**
 * POST /start
 * Start a new competency assessment
 */
router.post('/start', async (req, res) => {
  try {
    const validatedData = StartAssessmentSchema.parse(req.body);
    const { userId, moduleId } = validatedData;
    const requestingUser = (req as any).user;

    // Verify permissions
    const canStart = requestingUser?.role === 'admin' || requestingUser?.id === userId;
    if (!canStart) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to start assessment for this user',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    const { assessmentId, module } = await assessmentService.startAssessment(userId, moduleId);

    // Return assessment info without revealing answers
    const assessmentInfo = {
      assessmentId,
      moduleInfo: {
        id: module.id,
        name: module.name,
        description: module.description,
        competencyAreas: module.competencyAreas,
        questionCount: module.questions.length,
        practicalTaskCount: module.practicalTasks.length,
        passingScore: module.passingScore,
        timeLimit: module.timeLimit,
        maxAttempts: module.maxAttempts
      },
      questions: module.questions.map(q => ({
        id: q.id,
        type: q.type,
        question: q.question,
        options: q.options,
        competencyArea: q.competencyArea,
        points: q.points
      })),
      practicalTasks: module.practicalTasks.map(task => ({
        id: task.id,
        description: task.description,
        type: task.type,
        instructions: task.instructions,
        timeLimit: task.timeLimit,
        resources: task.resources,
        evaluationCriteria: task.evaluationCriteria.map(criteria => ({
          criterion: criteria.criterion,
          weight: criteria.weight,
          description: criteria.description
        }))
      })),
      startedAt: new Date().toISOString()
    };

    logger.info('Assessment started', {
      assessmentId,
      userId,
      moduleId,
      startedBy: requestingUser?.id
    });

    const response: ApiResponse = {
      success: true,
      data: assessmentInfo
    };

    res.json(response);
  } catch (error) {
    logger.error('Error starting assessment:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error.message.includes('Prerequisites') || error.message.includes('Maximum attempts')
          ? error.message
          : 'Failed to start assessment',
        code: 'ASSESSMENT_START_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * POST /submit
 * Submit assessment answers for evaluation
 */
router.post('/submit', async (req, res) => {
  try {
    const validatedData = SubmitAssessmentSchema.parse(req.body);
    const { userId, moduleId, assessmentId, answers, practicalTaskResults } = validatedData;
    const requestingUser = (req as any).user;

    // Verify permissions
    const canSubmit = requestingUser?.role === 'admin' || requestingUser?.id === userId;
    if (!canSubmit) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to submit assessment for this user',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    const result = await assessmentService.submitAssessment(
      userId,
      moduleId,
      assessmentId,
      answers,
      practicalTaskResults
    );

    // Return results without revealing correct answers
    const publicResult = {
      assessmentId: result.assessmentId,
      score: result.score,
      maxScore: result.maxScore,
      passed: result.passed,
      feedback: result.feedback,
      timeSpent: result.timeSpent,
      completedAt: result.completedAt,
      questionResults: result.answers.map(answer => ({
        questionId: answer.questionId,
        correct: answer.correct,
        points: answer.points
      })),
      certificateEarned: result.passed
    };

    logger.info('Assessment submitted', {
      assessmentId,
      userId,
      moduleId,
      score: result.score,
      passed: result.passed,
      submittedBy: requestingUser?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        result: publicResult,
        nextSteps: result.passed
          ? 'Congratulations! You can now proceed to advanced modules.'
          : 'Review the training materials and try again when ready.'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error submitting assessment:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to submit assessment',
        code: 'ASSESSMENT_SUBMISSION_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /result/:assessmentId
 * Get assessment result details
 */
router.get('/result/:assessmentId', async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const requestingUser = (req as any).user;

    const result = await assessmentService.getAssessmentResult(assessmentId);

    if (!result) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Assessment result not found',
          code: 'RESULT_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    // Verify permissions
    const canView = requestingUser?.role === 'admin' || requestingUser?.id === result.userId;
    if (!canView) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to view this assessment result',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    // Return results without revealing correct answers for non-admin users
    const publicResult = {
      assessmentId: result.assessmentId,
      moduleId: result.moduleId,
      score: result.score,
      maxScore: result.maxScore,
      passed: result.passed,
      feedback: result.feedback,
      timeSpent: result.timeSpent,
      completedAt: result.completedAt,
      questionResults: requestingUser?.role === 'admin'
        ? result.answers
        : result.answers.map(answer => ({
            questionId: answer.questionId,
            correct: answer.correct,
            points: answer.points
          }))
    };

    logger.info('Assessment result accessed', {
      assessmentId,
      userId: result.userId,
      accessedBy: requestingUser?.id,
      role: requestingUser?.role
    });

    const response: ApiResponse = {
      success: true,
      data: publicResult
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving assessment result:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve assessment result',
        code: 'RESULT_RETRIEVAL_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /profile/:userId
 * Get user's competency profile
 */
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUser = (req as any).user;

    // Verify permissions
    const canView = requestingUser?.role === 'admin' || requestingUser?.id === userId;
    if (!canView) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to view this competency profile',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    const profile = await assessmentService.getCompetencyProfile(userId);

    // Remove sensitive information for non-admin users
    const publicProfile = {
      userId: profile.userId,
      role: profile.role,
      currentCertifications: profile.currentCertifications.map(cert => ({
        id: cert.id,
        certificateName: cert.certificateName,
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
        status: cert.status,
        verificationCode: requestingUser?.role === 'admin' ? cert.verificationCode : undefined
      })),
      competencyScores: profile.competencyScores,
      strengthAreas: profile.strengthAreas,
      improvementAreas: profile.improvementAreas,
      nextRecommendedModules: profile.nextRecommendedModules,
      lastAssessmentDate: profile.lastAssessmentDate,
      overallCompetencyLevel: profile.overallCompetencyLevel,
      assessmentHistory: profile.completedAssessments.map(assessment => ({
        moduleId: assessment.moduleId,
        score: assessment.score,
        passed: assessment.passed,
        completedAt: assessment.completedAt
      }))
    };

    logger.info('Competency profile accessed', {
      userId,
      accessedBy: requestingUser?.id,
      role: requestingUser?.role,
      competencyLevel: profile.overallCompetencyLevel
    });

    const response: ApiResponse = {
      success: true,
      data: publicProfile
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving competency profile:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve competency profile',
        code: 'PROFILE_RETRIEVAL_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /learning-path/:pathId
 * Get learning path information
 */
router.get('/learning-path/:pathId', async (req, res) => {
  try {
    const { pathId } = req.params;

    const learningPath = await assessmentService.getLearningPath(pathId);

    if (!learningPath) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Learning path not found',
          code: 'LEARNING_PATH_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    logger.info('Learning path accessed', {
      pathId,
      targetRole: learningPath.targetRole,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: learningPath
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving learning path:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve learning path',
        code: 'LEARNING_PATH_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /learning-path/:pathId/progress/:userId
 * Get user's progress on a learning path
 */
router.get('/learning-path/:pathId/progress/:userId', async (req, res) => {
  try {
    const { pathId, userId } = req.params;
    const requestingUser = (req as any).user;

    // Verify permissions
    const canView = requestingUser?.role === 'admin' || requestingUser?.id === userId;
    if (!canView) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to view learning path progress',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    const progress = await assessmentService.getLearningPathProgress(userId, pathId);

    if (!progress) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Learning path not found',
          code: 'LEARNING_PATH_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    logger.info('Learning path progress accessed', {
      pathId,
      userId,
      progress: progress.overallProgress,
      accessedBy: requestingUser?.id
    });

    const response: ApiResponse = {
      success: true,
      data: progress
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving learning path progress:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve learning path progress',
        code: 'PROGRESS_RETRIEVAL_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /certificate/verify/:verificationCode
 * Verify a certificate using its verification code
 */
router.get('/certificate/verify/:verificationCode', async (req, res) => {
  try {
    const { verificationCode } = req.params;

    // In a real implementation, this would query the certificate database
    // For now, we'll return mock verification data
    const mockCertificate = {
      certificateId: 'cert_123456',
      certificateName: 'AI System Certified Professional',
      holderName: 'John Doe',
      issuedAt: new Date('2025-01-15'),
      expiresAt: new Date('2026-01-15'),
      status: 'active',
      issuingOrganization: 'Capitol Eye Care',
      verificationCode,
      valid: true
    };

    logger.info('Certificate verification accessed', {
      verificationCode,
      valid: mockCertificate.valid,
      accessedBy: (req as any).user?.id || 'public'
    });

    const response: ApiResponse = {
      success: true,
      data: {
        verification: mockCertificate,
        message: mockCertificate.valid
          ? 'Certificate is valid and active'
          : 'Certificate is not valid or has expired'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error verifying certificate:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to verify certificate',
        code: 'CERTIFICATE_VERIFICATION_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /analytics
 * Get competency analytics (admin only)
 */
router.get('/analytics', async (req, res) => {
  try {
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required for competency analytics',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const analytics = await assessmentService.getCompetencyAnalytics();

    logger.info('Competency analytics retrieved', {
      adminId: requestingUser.id
    });

    const response: ApiResponse = {
      success: true,
      data: analytics
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving competency analytics:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve competency analytics',
        code: 'ANALYTICS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

export default router;