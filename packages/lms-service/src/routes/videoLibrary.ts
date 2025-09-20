import express from 'express';
import { z } from 'zod';
import VideoLibraryService from '../services/videoLibraryService';
import { logger, auditLog } from '../utils/logger';
import { ApiResponse } from '../types';

const router = express.Router();
const videoLibraryService = new VideoLibraryService();

// Validation schemas
const VideoFiltersSchema = z.object({
  category: z.enum(['getting_started', 'advanced_features', 'troubleshooting', 'best_practices']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  tags: z.string().optional(), // Comma-separated tags
  search: z.string().optional(),
  accessLevel: z.enum(['public', 'staff_only', 'admin_only']).optional()
});

const RecordViewSchema = z.object({
  videoId: z.string(),
  viewDuration: z.number().min(0),
  userId: z.string()
});

const AddRatingSchema = z.object({
  videoId: z.string(),
  rating: z.number().min(1).max(5),
  review: z.string().optional()
});

const AddCommentSchema = z.object({
  videoId: z.string(),
  comment: z.string().min(1).max(1000),
  timestamp: z.number().min(0).optional()
});

const SearchSchema = z.object({
  q: z.string().min(2),
  category: z.enum(['getting_started', 'advanced_features', 'troubleshooting', 'best_practices']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional()
});

/**
 * GET /videos
 * Get all videos with optional filtering
 */
router.get('/videos', async (req, res) => {
  try {
    const filters = VideoFiltersSchema.parse(req.query);
    const requestingUser = (req as any).user;

    // Process tags if provided
    const processedFilters = {
      ...filters,
      tags: filters.tags ? filters.tags.split(',').map(tag => tag.trim()) : undefined
    };

    // Set access level based on user role
    if (!processedFilters.accessLevel) {
      if (requestingUser?.role === 'admin') {
        processedFilters.accessLevel = undefined; // Admins can see all
      } else {
        processedFilters.accessLevel = 'staff_only';
      }
    }

    const videos = await videoLibraryService.getVideos(processedFilters);

    // Remove sensitive information and video URLs for security
    const publicVideos = videos.map(video => ({
      id: video.id,
      title: video.title,
      description: video.description,
      category: video.category,
      topics: video.topics,
      duration: video.duration,
      durationSeconds: video.durationSeconds,
      thumbnailUrl: video.thumbnailUrl,
      difficulty: video.difficulty,
      prerequisites: video.prerequisites,
      learningObjectives: video.learningObjectives,
      relatedModules: video.relatedModules,
      relatedScenarios: video.relatedScenarios,
      tags: video.tags,
      viewCount: video.viewCount,
      averageRating: video.averageRating,
      ratingCount: video.ratings.length,
      accessLevel: video.accessLevel,
      hasTranscript: !!video.transcriptUrl,
      hasClosedCaptions: !!video.closedCaptionsUrl
    }));

    logger.info('Videos retrieved', {
      count: publicVideos.length,
      filters: processedFilters,
      userId: requestingUser?.id,
      role: requestingUser?.role
    });

    const response: ApiResponse = {
      success: true,
      data: {
        videos: publicVideos,
        total: publicVideos.length,
        filters: processedFilters
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving videos:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve videos',
        code: 'VIDEO_RETRIEVAL_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /videos/:id
 * Get specific video details
 */
router.get('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = (req as any).user;

    const video = await videoLibraryService.getVideo(id);

    if (!video) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Video not found',
          code: 'VIDEO_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    // Check access permissions
    const hasAccess = video.accessLevel === 'public' ||
                     (video.accessLevel === 'staff_only' && requestingUser) ||
                     (video.accessLevel === 'admin_only' && requestingUser?.role === 'admin');

    if (!hasAccess) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to access this video',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    // Return video details with video URL for authorized users
    const videoResponse = {
      ...video,
      videoUrl: hasAccess ? video.videoUrl : undefined,
      transcriptUrl: hasAccess ? video.transcriptUrl : undefined,
      closedCaptionsUrl: hasAccess ? video.closedCaptionsUrl : undefined,
      comments: video.comments.map(comment => ({
        ...comment,
        replies: comment.replies
      }))
    };

    auditLog.userAccess(requestingUser?.id || 'anonymous', 'VIDEO_ACCESS', `/video/${id}`, true);

    logger.info('Video details accessed', {
      videoId: id,
      title: video.title,
      userId: requestingUser?.id,
      role: requestingUser?.role
    });

    const response: ApiResponse = {
      success: true,
      data: videoResponse
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving video details:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve video details',
        code: 'VIDEO_DETAILS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /videos/view
 * Record a video view for analytics
 */
router.post('/videos/view', async (req, res) => {
  try {
    const validatedData = RecordViewSchema.parse(req.body);
    const { videoId, viewDuration, userId } = validatedData;
    const requestingUser = (req as any).user;

    // Verify user can record view for this user
    const canRecord = requestingUser?.role === 'admin' || requestingUser?.id === userId;
    if (!canRecord) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Cannot record view for another user',
          code: 'UNAUTHORIZED_VIEW_RECORD'
        }
      };
      return res.status(403).json(response);
    }

    await videoLibraryService.recordVideoView(videoId, userId, viewDuration);

    logger.info('Video view recorded', {
      videoId,
      userId,
      viewDuration,
      recordedBy: requestingUser?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Video view recorded successfully'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error recording video view:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to record video view',
        code: 'VIEW_RECORD_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * POST /videos/rating
 * Add or update a video rating
 */
router.post('/videos/rating', async (req, res) => {
  try {
    const validatedData = AddRatingSchema.parse(req.body);
    const { videoId, rating, review } = validatedData;
    const requestingUser = (req as any).user;

    if (!requestingUser) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Authentication required to rate videos',
          code: 'AUTHENTICATION_REQUIRED'
        }
      };
      return res.status(401).json(response);
    }

    const success = await videoLibraryService.addVideoRating(videoId, requestingUser.id, rating, review);

    if (!success) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Video not found',
          code: 'VIDEO_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    logger.info('Video rating added', {
      videoId,
      userId: requestingUser.id,
      rating,
      hasReview: !!review
    });

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Video rating added successfully'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error adding video rating:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to add video rating',
        code: 'RATING_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * POST /videos/comment
 * Add a comment to a video
 */
router.post('/videos/comment', async (req, res) => {
  try {
    const validatedData = AddCommentSchema.parse(req.body);
    const { videoId, comment, timestamp = 0 } = validatedData;
    const requestingUser = (req as any).user;

    if (!requestingUser) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Authentication required to comment on videos',
          code: 'AUTHENTICATION_REQUIRED'
        }
      };
      return res.status(401).json(response);
    }

    const isStaff = ['admin', 'manager', 'trainer'].includes(requestingUser.role);
    const userName = `${requestingUser.firstName} ${requestingUser.lastName.charAt(0)}.` || requestingUser.username;

    const commentId = await videoLibraryService.addVideoComment(
      videoId,
      requestingUser.id,
      userName,
      comment,
      timestamp,
      isStaff
    );

    if (!commentId) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Video not found',
          code: 'VIDEO_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    logger.info('Video comment added', {
      videoId,
      commentId,
      userId: requestingUser.id,
      timestamp,
      isStaff
    });

    const response: ApiResponse = {
      success: true,
      data: {
        commentId,
        message: 'Comment added successfully'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error adding video comment:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to add video comment',
        code: 'COMMENT_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /playlists
 * Get all video playlists
 */
router.get('/playlists', async (req, res) => {
  try {
    const { category } = req.query;

    const playlists = await videoLibraryService.getPlaylists(category as string);

    logger.info('Playlists retrieved', {
      count: playlists.length,
      category: category || 'all',
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        playlists,
        total: playlists.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving playlists:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve playlists',
        code: 'PLAYLIST_RETRIEVAL_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /playlists/:id
 * Get specific playlist with video details
 */
router.get('/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const playlist = await videoLibraryService.getPlaylist(id);

    if (!playlist) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Playlist not found',
          code: 'PLAYLIST_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    // Remove video URLs for security, keep only metadata
    const playlistResponse = {
      ...playlist,
      videoDetails: playlist.videoDetails.map(video => ({
        id: video.id,
        title: video.title,
        description: video.description,
        duration: video.duration,
        durationSeconds: video.durationSeconds,
        thumbnailUrl: video.thumbnailUrl,
        difficulty: video.difficulty,
        topics: video.topics,
        averageRating: video.averageRating,
        viewCount: video.viewCount
      }))
    };

    logger.info('Playlist accessed', {
      playlistId: id,
      title: playlist.title,
      videoCount: playlist.videoDetails.length,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: playlistResponse
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving playlist:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve playlist',
        code: 'PLAYLIST_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /search
 * Search videos
 */
router.get('/search', async (req, res) => {
  try {
    const validatedQuery = SearchSchema.parse(req.query);
    const { q: query, category, difficulty } = validatedQuery;

    const results = await videoLibraryService.searchVideos(query, { category, difficulty });

    // Remove sensitive information from search results
    const searchResults = results.map(video => ({
      id: video.id,
      title: video.title,
      description: video.description.substring(0, 200) + (video.description.length > 200 ? '...' : ''),
      category: video.category,
      topics: video.topics,
      duration: video.duration,
      thumbnailUrl: video.thumbnailUrl,
      difficulty: video.difficulty,
      averageRating: video.averageRating,
      viewCount: video.viewCount,
      relevanceScore: this.calculateRelevanceScore(video, query)
    }));

    logger.info('Video search performed', {
      query,
      category: category || 'all',
      difficulty: difficulty || 'all',
      resultCount: searchResults.length,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        query,
        results: searchResults,
        total: searchResults.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error searching videos:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to search videos',
        code: 'VIDEO_SEARCH_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /recommendations/:userId
 * Get personalized video recommendations
 */
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUser = (req as any).user;

    // Verify permissions
    const canView = requestingUser?.role === 'admin' || requestingUser?.id === userId;
    if (!canView) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Insufficient permissions to view recommendations for this user',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      };
      return res.status(403).json(response);
    }

    // In a real implementation, you would fetch user's role and completed modules from the database
    const userRole = requestingUser?.role || 'receptionist';
    const completedModules = ['ai_fundamentals']; // Mock data

    const recommendations = await videoLibraryService.getRecommendedVideos(userId, userRole, completedModules);

    // Remove sensitive information from recommendations
    const publicRecommendations = recommendations.map(video => ({
      id: video.id,
      title: video.title,
      description: video.description,
      category: video.category,
      duration: video.duration,
      thumbnailUrl: video.thumbnailUrl,
      difficulty: video.difficulty,
      topics: video.topics,
      averageRating: video.averageRating,
      viewCount: video.viewCount,
      relatedModules: video.relatedModules
    }));

    logger.info('Video recommendations retrieved', {
      userId,
      userRole,
      recommendationCount: publicRecommendations.length,
      requestedBy: requestingUser?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        userId,
        userRole,
        recommendations: publicRecommendations,
        total: publicRecommendations.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving video recommendations:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve video recommendations',
        code: 'RECOMMENDATIONS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /analytics/:videoId
 * Get video analytics (admin only)
 */
router.get('/analytics/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required for video analytics',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const analytics = await videoLibraryService.getVideoAnalytics(videoId);

    if (!analytics) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Video analytics not found',
          code: 'ANALYTICS_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    logger.info('Video analytics accessed', {
      videoId,
      adminId: requestingUser.id
    });

    const response: ApiResponse = {
      success: true,
      data: analytics
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving video analytics:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve video analytics',
        code: 'ANALYTICS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /analytics/content-management
 * Get content management metrics (admin only)
 */
router.get('/analytics/content-management', async (req, res) => {
  try {
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required for content management metrics',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const metrics = await videoLibraryService.getContentManagementMetrics();

    logger.info('Content management metrics accessed', {
      adminId: requestingUser.id
    });

    const response: ApiResponse = {
      success: true,
      data: metrics
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving content management metrics:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve content management metrics',
        code: 'CONTENT_METRICS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

// Helper function for search relevance (using 'this' context appropriately)
function calculateRelevanceScore(video: any, query: string): number {
  const searchTerm = query.toLowerCase();
  let score = 0;

  if (video.title.toLowerCase().includes(searchTerm)) score += 10;
  if (video.description.toLowerCase().includes(searchTerm)) score += 5;
  if (video.topics.some((topic: string) => topic.toLowerCase().includes(searchTerm))) score += 8;
  if (video.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm))) score += 3;

  // Boost popular and highly rated content
  if (video.viewCount > 50) score += 2;
  if (video.averageRating > 4.5) score += 2;

  return score;
}

export default router;