import express from 'express';
import { z } from 'zod';
import FeedbackService from '../services/feedbackService';
import { logger, auditLog } from '../utils/logger';
import { ApiResponse, FeedbackSchema } from '../types';

const router = express.Router();
const feedbackService = new FeedbackService();

// Validation schemas
const SubmitFeedbackSchema = FeedbackSchema.omit({
  id: true,
  status: true,
  assignee: true,
  resolution: true,
  responseTime: true,
  createdAt: true,
  updatedAt: true
});

const FeedbackFiltersSchema = z.object({
  category: z.enum(['bug', 'suggestion', 'training_gap', 'praise']).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['new', 'triaged', 'in_progress', 'resolved', 'closed']).optional(),
  submitterId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional()
});

const UpdateStatusSchema = z.object({
  status: z.enum(['new', 'triaged', 'in_progress', 'resolved', 'closed']),
  resolution: z.string().optional(),
  assignee: z.string().optional()
});

const SearchSchema = z.object({
  q: z.string().min(2),
  category: z.enum(['bug', 'suggestion', 'training_gap', 'praise']).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional()
});

/**
 * POST /submit
 * Submit new feedback from staff
 */
router.post('/submit', async (req, res) => {
  try {
    const validatedData = SubmitFeedbackSchema.parse(req.body);
    const requestingUser = (req as any).user;

    // Ensure submitter matches authenticated user (unless admin)
    if (requestingUser && requestingUser.role !== 'admin') {
      if (validatedData.submitter.staffId !== requestingUser.id) {
        const response: ApiResponse = {
          success: false,
          error: {
            message: 'Cannot submit feedback on behalf of another user',
            code: 'UNAUTHORIZED_SUBMISSION'
          }
        };
        return res.status(403).json(response);
      }
    }

    const feedback = await feedbackService.submitFeedback(validatedData);

    logger.info('Feedback submitted successfully', {
      feedbackId: feedback.id,
      category: feedback.category,
      urgency: feedback.urgency,
      submitter: feedback.submitter.staffId
    });

    const response: ApiResponse = {
      success: true,
      data: {
        feedback: {
          id: feedback.id,
          category: feedback.category,
          urgency: feedback.urgency,
          description: feedback.description,
          status: feedback.status,
          submittedAt: feedback.createdAt
        },
        message: 'Feedback submitted successfully. You will be notified of any updates.'
      }
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error('Error submitting feedback:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to submit feedback',
        code: 'FEEDBACK_SUBMISSION_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /
 * Get feedback with optional filtering (admin and assigned staff)
 */
router.get('/', async (req, res) => {
  try {
    const filters = FeedbackFiltersSchema.parse(req.query);
    const requestingUser = (req as any).user;

    // Convert date strings to Date objects
    const processedFilters = {
      ...filters,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined
    };

    let feedback;

    if (requestingUser?.role === 'admin') {
      // Admins can see all feedback
      feedback = await feedbackService.getFeedback(processedFilters);
    } else {
      // Regular users can only see their own feedback or assigned feedback
      if (requestingUser) {
        const userFilters = {
          ...processedFilters,
          submitterId: requestingUser.id
        };
        feedback = await feedbackService.getFeedback(userFilters);
      } else {
        feedback = [];
      }
    }

    // Remove sensitive information for non-admin users
    const publicFeedback = feedback.map(f => ({
      id: f.id,
      category: f.category,
      urgency: f.urgency,
      description: f.description,
      status: f.status,
      submittedBy: requestingUser?.role === 'admin' ? f.submitter : { role: f.submitter.role },
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      resolution: f.status === 'resolved' ? f.resolution : undefined
    }));

    logger.info('Feedback retrieved', {
      count: publicFeedback.length,
      filters,
      userId: requestingUser?.id,
      role: requestingUser?.role
    });

    const response: ApiResponse = {
      success: true,
      data: {
        feedback: publicFeedback,
        total: publicFeedback.length,
        filters: processedFilters
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving feedback:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve feedback',
        code: 'FEEDBACK_RETRIEVAL_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /:id
 * Get specific feedback item
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = (req as any).user;

    const feedback = await feedbackService.getFeedbackById(id);

    if (!feedback) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Feedback not found',
          code: 'FEEDBACK_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    // Check permissions
    const canView = requestingUser?.role === 'admin' ||
                   feedback.submitter.staffId === requestingUser?.id ||
                   feedback.assignee === requestingUser?.id;

    if (!canView) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to view this feedback',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    logger.info('Feedback item accessed', {
      feedbackId: id,
      userId: requestingUser?.id,
      role: requestingUser?.role
    });

    const response: ApiResponse = {
      success: true,
      data: feedback
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving feedback item:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve feedback item',
        code: 'FEEDBACK_ITEM_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * PUT /:id/status
 * Update feedback status (admin only)
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required to update feedback status',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const validatedData = UpdateStatusSchema.parse(req.body);
    const { status, resolution, assignee } = validatedData;

    const updatedFeedback = await feedbackService.updateFeedbackStatus(id, status, resolution, assignee);

    if (!updatedFeedback) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Feedback not found',
          code: 'FEEDBACK_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    auditLog.userAccess(requestingUser.id, 'FEEDBACK_STATUS_UPDATE', `/feedback/${id}`, true, {
      newStatus: status,
      hasResolution: !!resolution,
      assignee
    });

    logger.info('Feedback status updated', {
      feedbackId: id,
      newStatus: status,
      updatedBy: requestingUser.id,
      assignee
    });

    const response: ApiResponse = {
      success: true,
      data: updatedFeedback
    };

    res.json(response);
  } catch (error) {
    logger.error('Error updating feedback status:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to update feedback status',
        code: 'STATUS_UPDATE_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /search
 * Search feedback
 */
router.get('/search', async (req, res) => {
  try {
    const validatedQuery = SearchSchema.parse(req.query);
    const { q: query, category, urgency } = validatedQuery;
    const requestingUser = (req as any).user;

    const filters = { category, urgency };
    const results = await feedbackService.searchFeedback(query, filters);

    // Filter results based on user permissions
    let filteredResults = results;
    if (requestingUser?.role !== 'admin') {
      filteredResults = results.filter(f =>
        f.submitter.staffId === requestingUser?.id || f.assignee === requestingUser?.id
      );
    }

    // Remove sensitive information for non-admin users
    const publicResults = filteredResults.map(f => ({
      id: f.id,
      category: f.category,
      urgency: f.urgency,
      description: f.description.substring(0, 200) + (f.description.length > 200 ? '...' : ''),
      status: f.status,
      relevanceScore: this.calculateRelevanceScore(f, query),
      createdAt: f.createdAt
    }));

    // Sort by relevance
    publicResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    logger.info('Feedback search performed', {
      query,
      category: category || 'all',
      urgency: urgency || 'all',
      resultCount: publicResults.length,
      userId: requestingUser?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        query,
        results: publicResults,
        total: publicResults.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error searching feedback:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to search feedback',
        code: 'FEEDBACK_SEARCH_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /user/:userId
 * Get feedback submitted by specific user (admin or self only)
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUser = (req as any).user;

    // Check permissions
    const canView = requestingUser?.role === 'admin' || requestingUser?.id === userId;

    if (!canView) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to view user feedback',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    const feedback = await feedbackService.getFeedbackByStaff(userId);

    // Remove sensitive information for non-admin users
    const publicFeedback = feedback.map(f => ({
      id: f.id,
      category: f.category,
      urgency: f.urgency,
      description: f.description,
      status: f.status,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      resolution: f.status === 'resolved' ? f.resolution : undefined
    }));

    logger.info('User feedback retrieved', {
      userId,
      count: publicFeedback.length,
      requestedBy: requestingUser?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        userId,
        feedback: publicFeedback,
        total: publicFeedback.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving user feedback:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve user feedback',
        code: 'USER_FEEDBACK_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /pending
 * Get pending feedback for dashboard (assigned staff and admins)
 */
router.get('/pending', async (req, res) => {
  try {
    const requestingUser = (req as any).user;

    if (!requestingUser) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        }
      };
      return res.status(401).json(response);
    }

    const assignee = requestingUser.role === 'admin' ? undefined : requestingUser.id;
    const pendingFeedback = await feedbackService.getPendingFeedback(assignee);

    // Summarize for dashboard display
    const dashboardFeedback = pendingFeedback.map(f => ({
      id: f.id,
      category: f.category,
      urgency: f.urgency,
      description: f.description.substring(0, 100) + (f.description.length > 100 ? '...' : ''),
      status: f.status,
      submittedBy: f.submitter.role,
      createdAt: f.createdAt,
      assignee: f.assignee
    }));

    logger.info('Pending feedback retrieved for dashboard', {
      count: dashboardFeedback.length,
      userId: requestingUser.id,
      role: requestingUser.role
    });

    const response: ApiResponse = {
      success: true,
      data: {
        pendingFeedback: dashboardFeedback,
        summary: {
          total: dashboardFeedback.length,
          critical: dashboardFeedback.filter(f => f.urgency === 'critical').length,
          high: dashboardFeedback.filter(f => f.urgency === 'high').length,
          bugs: dashboardFeedback.filter(f => f.category === 'bug').length,
          suggestions: dashboardFeedback.filter(f => f.category === 'suggestion').length
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving pending feedback:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve pending feedback',
        code: 'PENDING_FEEDBACK_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /analytics
 * Get feedback analytics (admin only)
 */
router.get('/analytics', async (req, res) => {
  try {
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required for feedback analytics',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const { timeframe } = req.query;
    const validTimeframes = ['week', 'month', 'quarter', 'year'];
    const selectedTimeframe = validTimeframes.includes(timeframe as string) ? timeframe as any : undefined;

    const analytics = await feedbackService.getFeedbackAnalytics(selectedTimeframe);

    logger.info('Feedback analytics retrieved', {
      timeframe: selectedTimeframe || 'all_time',
      adminId: requestingUser.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        timeframe: selectedTimeframe || 'all_time',
        analytics
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving feedback analytics:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve feedback analytics',
        code: 'ANALYTICS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

// Helper function for search relevance
function calculateRelevanceScore(feedback: any, query: string): number {
  const searchTerm = query.toLowerCase();
  let score = 0;

  // Description match (highest weight)
  if (feedback.description.toLowerCase().includes(searchTerm)) {
    score += 10;
  }

  // Category match (medium weight)
  if (feedback.category.toLowerCase().includes(searchTerm)) {
    score += 5;
  }

  // Context feature match (lower weight)
  if (feedback.context?.affectedFeature?.toLowerCase().includes(searchTerm)) {
    score += 3;
  }

  // Resolution match (lower weight)
  if (feedback.resolution?.toLowerCase().includes(searchTerm)) {
    score += 2;
  }

  return score;
}

export default router;