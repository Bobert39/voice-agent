import { UserProgress, UserProgressSchema, ApiResponse, TrainingAnalytics } from '../types';
import { logger, auditLog, performanceLog } from '../utils/logger';

export class UserProgressService {
  private userProgress: Map<string, UserProgress[]> = new Map();

  constructor() {
    this.initializeSampleData();
  }

  private initializeSampleData(): void {
    // Initialize with some sample progress data
    const sampleProgress: UserProgress[] = [
      {
        userId: 'user_001',
        moduleId: 'ai-fundamentals',
        status: 'completed',
        progress: 100,
        score: 92,
        completedAt: new Date('2025-01-10T14:30:00Z'),
        certificateId: 'cert_001',
        timeSpent: 115,
        attempts: 1,
        lastAccessed: new Date('2025-01-10T14:30:00Z')
      },
      {
        userId: 'user_001',
        moduleId: 'dashboard-navigation',
        status: 'in_progress',
        progress: 65,
        timeSpent: 45,
        attempts: 1,
        lastAccessed: new Date('2025-01-15T10:15:00Z')
      }
    ];

    this.userProgress.set('user_001', sampleProgress);
    logger.info('Initialized sample user progress data');
  }

  async getUserProgress(userId: string): Promise<ApiResponse<UserProgress[]>> {
    try {
      auditLog.dataAccess(userId, 'user_progress', userId, 'READ');

      const progress = this.userProgress.get(userId) || [];

      return {
        success: true,
        data: progress
      };
    } catch (error) {
      logger.error(`Error fetching user progress for ${userId}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch user progress',
          details: error
        }
      };
    }
  }

  async getModuleProgress(userId: string, moduleId: string): Promise<ApiResponse<UserProgress>> {
    try {
      auditLog.dataAccess(userId, 'module_progress', moduleId, 'READ');

      const userProgressList = this.userProgress.get(userId) || [];
      const moduleProgress = userProgressList.find(p => p.moduleId === moduleId);

      if (!moduleProgress) {
        return {
          success: false,
          error: {
            message: 'Module progress not found',
            code: 'PROGRESS_NOT_FOUND'
          }
        };
      }

      return {
        success: true,
        data: moduleProgress
      };
    } catch (error) {
      logger.error(`Error fetching module progress for ${userId}/${moduleId}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch module progress',
          details: error
        }
      };
    }
  }

  async updateProgress(userId: string, moduleId: string, progressUpdate: Partial<UserProgress>): Promise<ApiResponse<UserProgress>> {
    try {
      const startTime = Date.now();
      auditLog.dataAccess(userId, 'user_progress', moduleId, 'UPDATE');

      let userProgressList = this.userProgress.get(userId) || [];
      let existingProgressIndex = userProgressList.findIndex(p => p.moduleId === moduleId);

      let updatedProgress: UserProgress;

      if (existingProgressIndex >= 0) {
        // Update existing progress
        const existingProgress = userProgressList[existingProgressIndex];
        updatedProgress = {
          ...existingProgress,
          ...progressUpdate,
          userId,
          moduleId,
          lastAccessed: new Date()
        };

        // Validate the updated progress
        const validation = UserProgressSchema.safeParse(updatedProgress);
        if (!validation.success) {
          return {
            success: false,
            error: {
              message: 'Invalid progress update data',
              details: validation.error.issues
            }
          };
        }

        userProgressList[existingProgressIndex] = updatedProgress;
      } else {
        // Create new progress record
        updatedProgress = {
          userId,
          moduleId,
          status: 'in_progress',
          progress: 0,
          timeSpent: 0,
          attempts: 1,
          lastAccessed: new Date(),
          ...progressUpdate
        };

        // Validate the new progress
        const validation = UserProgressSchema.safeParse(updatedProgress);
        if (!validation.success) {
          return {
            success: false,
            error: {
              message: 'Invalid progress data',
              details: validation.error.issues
            }
          };
        }

        userProgressList.push(updatedProgress);
      }

      this.userProgress.set(userId, userProgressList);

      const duration = Date.now() - startTime;
      performanceLog.training(userId, moduleId, 'progress_update', duration, true);

      logger.info(`Updated progress for user ${userId} in module ${moduleId}`, {
        progress: updatedProgress.progress,
        status: updatedProgress.status
      });

      return {
        success: true,
        data: updatedProgress
      };
    } catch (error) {
      logger.error(`Error updating progress for ${userId}/${moduleId}:`, error);
      performanceLog.training(userId, moduleId, 'progress_update', 0, false);

      return {
        success: false,
        error: {
          message: 'Failed to update progress',
          details: error
        }
      };
    }
  }

  async completeModule(userId: string, moduleId: string, finalScore: number): Promise<ApiResponse<UserProgress>> {
    try {
      const completionData: Partial<UserProgress> = {
        status: 'completed',
        progress: 100,
        score: finalScore,
        completedAt: new Date()
      };

      const result = await this.updateProgress(userId, moduleId, completionData);

      if (result.success && result.data) {
        auditLog.systemEvent('MODULE_COMPLETED', {
          userId,
          moduleId,
          score: finalScore,
          completedAt: result.data.completedAt
        }, 'medium');

        logger.info(`User ${userId} completed module ${moduleId} with score ${finalScore}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error completing module for ${userId}/${moduleId}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to complete module',
          details: error
        }
      };
    }
  }

  async getCompletionRate(moduleId?: string): Promise<ApiResponse<number>> {
    try {
      let totalUsers = 0;
      let completedUsers = 0;

      for (const userProgressList of this.userProgress.values()) {
        if (moduleId) {
          const moduleProgress = userProgressList.find(p => p.moduleId === moduleId);
          if (moduleProgress) {
            totalUsers++;
            if (moduleProgress.status === 'completed' || moduleProgress.status === 'certified') {
              completedUsers++;
            }
          }
        } else {
          // Overall completion rate across all modules
          totalUsers += userProgressList.length;
          completedUsers += userProgressList.filter(p =>
            p.status === 'completed' || p.status === 'certified'
          ).length;
        }
      }

      const completionRate = totalUsers > 0 ? (completedUsers / totalUsers) * 100 : 0;

      return {
        success: true,
        data: completionRate
      };
    } catch (error) {
      logger.error('Error calculating completion rate:', error);
      return {
        success: false,
        error: {
          message: 'Failed to calculate completion rate',
          details: error
        }
      };
    }
  }

  async getTrainingAnalytics(): Promise<ApiResponse<TrainingAnalytics>> {
    try {
      const analytics: TrainingAnalytics = {
        completionRates: {
          overall: 0,
          byModule: {},
          byRole: {}
        },
        averageScores: {
          overall: 0,
          byModule: {},
          byRole: {}
        },
        timeToCompletion: {
          average: 0,
          byModule: {}
        },
        certificationsIssued: {
          total: 0,
          thisMonth: 0,
          expiringSoon: 0
        },
        commonIssues: []
      };

      // Calculate overall completion rate
      let totalRecords = 0;
      let completedRecords = 0;
      let totalScore = 0;
      let totalTime = 0;
      let scoredRecords = 0;

      const moduleStats = new Map<string, { total: number; completed: number; totalScore: number; totalTime: number; scoredCount: number }>();

      for (const userProgressList of this.userProgress.values()) {
        for (const progress of userProgressList) {
          totalRecords++;
          totalTime += progress.timeSpent;

          if (progress.status === 'completed' || progress.status === 'certified') {
            completedRecords++;
            if (progress.score !== undefined) {
              totalScore += progress.score;
              scoredRecords++;
            }
          }

          // Module-specific stats
          if (!moduleStats.has(progress.moduleId)) {
            moduleStats.set(progress.moduleId, {
              total: 0,
              completed: 0,
              totalScore: 0,
              totalTime: 0,
              scoredCount: 0
            });
          }

          const moduleData = moduleStats.get(progress.moduleId)!;
          moduleData.total++;
          moduleData.totalTime += progress.timeSpent;

          if (progress.status === 'completed' || progress.status === 'certified') {
            moduleData.completed++;
            if (progress.score !== undefined) {
              moduleData.totalScore += progress.score;
              moduleData.scoredCount++;
            }
          }
        }
      }

      // Calculate analytics
      analytics.completionRates.overall = totalRecords > 0 ? (completedRecords / totalRecords) * 100 : 0;
      analytics.averageScores.overall = scoredRecords > 0 ? totalScore / scoredRecords : 0;
      analytics.timeToCompletion.average = completedRecords > 0 ? totalTime / completedRecords : 0;

      // Module-specific analytics
      for (const [moduleId, stats] of moduleStats.entries()) {
        analytics.completionRates.byModule[moduleId] = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
        analytics.averageScores.byModule[moduleId] = stats.scoredCount > 0 ? stats.totalScore / stats.scoredCount : 0;
        analytics.timeToCompletion.byModule[moduleId] = stats.completed > 0 ? stats.totalTime / stats.completed : 0;
      }

      // Count certifications (simplified for now)
      analytics.certificationsIssued.total = completedRecords;
      analytics.certificationsIssued.thisMonth = Math.floor(completedRecords * 0.3); // Simplified calculation
      analytics.certificationsIssued.expiringSoon = Math.floor(completedRecords * 0.1); // Simplified calculation

      logger.info('Generated training analytics', {
        totalRecords,
        completedRecords,
        overallCompletionRate: analytics.completionRates.overall
      });

      return {
        success: true,
        data: analytics
      };
    } catch (error) {
      logger.error('Error generating training analytics:', error);
      return {
        success: false,
        error: {
          message: 'Failed to generate training analytics',
          details: error
        }
      };
    }
  }

  async getUsersByCompletionStatus(status: 'not_started' | 'in_progress' | 'completed' | 'certified'): Promise<ApiResponse<string[]>> {
    try {
      const userIds: string[] = [];

      for (const [userId, userProgressList] of this.userProgress.entries()) {
        const hasStatusMatch = userProgressList.some(progress => progress.status === status);
        if (hasStatusMatch) {
          userIds.push(userId);
        }
      }

      return {
        success: true,
        data: userIds
      };
    } catch (error) {
      logger.error(`Error fetching users by completion status ${status}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch users by completion status',
          details: error
        }
      };
    }
  }

  async incrementAttempt(userId: string, moduleId: string): Promise<ApiResponse<UserProgress>> {
    try {
      const userProgressList = this.userProgress.get(userId) || [];
      const progressIndex = userProgressList.findIndex(p => p.moduleId === moduleId);

      if (progressIndex >= 0) {
        const progress = userProgressList[progressIndex];
        progress.attempts = (progress.attempts || 0) + 1;
        progress.lastAccessed = new Date();

        return {
          success: true,
          data: progress
        };
      } else {
        // Create new progress record with first attempt
        const newProgress: UserProgress = {
          userId,
          moduleId,
          status: 'in_progress',
          progress: 0,
          timeSpent: 0,
          attempts: 1,
          lastAccessed: new Date()
        };

        userProgressList.push(newProgress);
        this.userProgress.set(userId, userProgressList);

        return {
          success: true,
          data: newProgress
        };
      }
    } catch (error) {
      logger.error(`Error incrementing attempt for ${userId}/${moduleId}:`, error);
      return {
        success: false,
        error: {
          message: 'Failed to increment attempt',
          details: error
        }
      };
    }
  }
}