import { logger, auditLog } from '../utils/logger';

// Video Library Types
interface Video {
  id: string;
  title: string;
  description: string;
  category: 'getting_started' | 'advanced_features' | 'troubleshooting' | 'best_practices';
  topics: string[];
  duration: string; // HH:MM:SS format
  durationSeconds: number;
  thumbnailUrl: string;
  videoUrl: string;
  transcriptUrl?: string;
  closedCaptionsUrl?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
  learningObjectives: string[];
  relatedModules: string[];
  relatedScenarios: string[];
  tags: string[];
  viewCount: number;
  averageRating: number;
  ratings: VideoRating[];
  comments: VideoComment[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  accessLevel: 'public' | 'staff_only' | 'admin_only';
}

interface VideoRating {
  userId: string;
  rating: number; // 1-5 stars
  review?: string;
  createdAt: Date;
}

interface VideoComment {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  timestamp: number; // seconds into video
  replies: VideoCommentReply[];
  createdAt: Date;
  isStaff: boolean;
}

interface VideoCommentReply {
  id: string;
  userId: string;
  userName: string;
  reply: string;
  createdAt: Date;
  isStaff: boolean;
}

interface VideoPlaylist {
  id: string;
  title: string;
  description: string;
  category: string;
  videos: string[]; // video IDs in order
  estimatedDuration: number; // total seconds
  targetAudience: string[];
  learningPath: string;
  createdBy: string;
  createdAt: Date;
  isPublic: boolean;
}

interface VideoAnalytics {
  videoId: string;
  totalViews: number;
  uniqueViewers: number;
  averageViewDuration: number;
  completionRate: number;
  engagementScore: number;
  popularSegments: Array<{
    startTime: number;
    endTime: number;
    viewCount: number;
    description: string;
  }>;
  viewerFeedback: {
    averageRating: number;
    totalRatings: number;
    satisfactionScore: number;
    commonTopics: string[];
  };
}

interface ContentManagementMetrics {
  totalVideos: number;
  totalViewTime: number;
  averageRating: number;
  contentGaps: string[];
  popularContent: string[];
  updateNeeded: string[];
  userEngagement: {
    activeViewers: number;
    averageSessionDuration: number;
    returnRate: number;
  };
}

class VideoLibraryService {
  private videos: Map<string, Video> = new Map();
  private playlists: Map<string, VideoPlaylist> = new Map();
  private analytics: Map<string, VideoAnalytics> = new Map();

  constructor() {
    this.initializeVideoLibrary();
  }

  private initializeVideoLibrary() {
    // Initialize video library with sample content
    const sampleVideos: Video[] = [
      {
        id: 'video_001',
        title: 'Welcome to Capitol Eye Care AI',
        description: 'Introduction to the AI voice agent system and your role as a staff member',
        category: 'getting_started',
        topics: ['Introduction', 'Benefits', 'Your Role', 'First Steps'],
        duration: '05:30',
        durationSeconds: 330,
        thumbnailUrl: '/thumbnails/welcome-intro.jpg',
        videoUrl: '/videos/welcome-intro.mp4',
        transcriptUrl: '/transcripts/welcome-intro.txt',
        closedCaptionsUrl: '/captions/welcome-intro.vtt',
        difficulty: 'beginner',
        prerequisites: [],
        learningObjectives: [
          'Understand what the AI voice agent is and how it helps patients',
          'Learn your role in supporting the AI system',
          'Identify key benefits for both staff and patients',
          'Know where to get help and additional training'
        ],
        relatedModules: ['ai_fundamentals'],
        relatedScenarios: [],
        tags: ['introduction', 'overview', 'getting_started', 'onboarding'],
        viewCount: 89,
        averageRating: 4.6,
        ratings: [
          { userId: 'staff_001', rating: 5, review: 'Great introduction, very clear!', createdAt: new Date('2025-01-10') },
          { userId: 'staff_002', rating: 4, createdAt: new Date('2025-01-12') }
        ],
        comments: [
          {
            id: 'comment_001',
            userId: 'staff_003',
            userName: 'Sarah M.',
            comment: 'This really helped me understand how the AI works with our daily workflow.',
            timestamp: 185,
            replies: [
              {
                id: 'reply_001',
                userId: 'trainer_001',
                userName: 'Training Coordinator',
                reply: 'Glad this was helpful! Let us know if you have questions about specific scenarios.',
                createdAt: new Date('2025-01-11'),
                isStaff: true
              }
            ],
            createdAt: new Date('2025-01-11'),
            isStaff: false
          }
        ],
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-05'),
        isActive: true,
        accessLevel: 'staff_only'
      },

      {
        id: 'video_002',
        title: 'First Day with the AI System',
        description: 'Step-by-step walkthrough of your first day using the AI voice agent',
        category: 'getting_started',
        topics: ['Login Process', 'Dashboard Tour', 'First Call', 'Basic Navigation'],
        duration: '12:45',
        durationSeconds: 765,
        thumbnailUrl: '/thumbnails/first-day.jpg',
        videoUrl: '/videos/first-day.mp4',
        transcriptUrl: '/transcripts/first-day.txt',
        closedCaptionsUrl: '/captions/first-day.vtt',
        difficulty: 'beginner',
        prerequisites: ['video_001'],
        learningObjectives: [
          'Successfully log into the staff dashboard',
          'Navigate the main dashboard features',
          'Handle your first AI-assisted call',
          'Use basic system features confidently'
        ],
        relatedModules: ['dashboard_navigation'],
        relatedScenarios: ['basic_call_handling'],
        tags: ['first_day', 'dashboard', 'login', 'navigation', 'practical'],
        viewCount: 76,
        averageRating: 4.8,
        ratings: [
          { userId: 'staff_004', rating: 5, review: 'Perfect for new employees!', createdAt: new Date('2025-01-08') }
        ],
        comments: [],
        createdAt: new Date('2025-01-02'),
        updatedAt: new Date('2025-01-06'),
        isActive: true,
        accessLevel: 'staff_only'
      },

      {
        id: 'video_003',
        title: 'Managing Multiple Escalations',
        description: 'Advanced techniques for handling multiple concurrent escalations efficiently',
        category: 'advanced_features',
        topics: ['Priority Queue', 'Delegation', 'Handoffs', 'Stress Management'],
        duration: '08:20',
        durationSeconds: 500,
        thumbnailUrl: '/thumbnails/multiple-escalations.jpg',
        videoUrl: '/videos/multiple-escalations.mp4',
        transcriptUrl: '/transcripts/multiple-escalations.txt',
        closedCaptionsUrl: '/captions/multiple-escalations.vtt',
        difficulty: 'advanced',
        prerequisites: ['video_001', 'video_002'],
        learningObjectives: [
          'Prioritize multiple escalations effectively',
          'Use delegation strategies to manage workload',
          'Handle stress during high-volume periods',
          'Maintain quality service under pressure'
        ],
        relatedModules: ['advanced_escalation'],
        relatedScenarios: ['multi_escalation_001'],
        tags: ['escalation', 'multitasking', 'priority', 'advanced', 'management'],
        viewCount: 45,
        averageRating: 4.9,
        ratings: [
          { userId: 'staff_005', rating: 5, review: 'Exactly what I needed for busy days!', createdAt: new Date('2025-01-14') }
        ],
        comments: [
          {
            id: 'comment_002',
            userId: 'staff_006',
            userName: 'Mike R.',
            comment: 'The priority matrix at 3:45 is really helpful. Can we get a printable version?',
            timestamp: 225,
            replies: [
              {
                id: 'reply_002',
                userId: 'trainer_001',
                userName: 'Training Coordinator',
                reply: 'Yes! Check the Quick Reference section for the Escalation Priority Guide.',
                createdAt: new Date('2025-01-15'),
                isStaff: true
              }
            ],
            createdAt: new Date('2025-01-14'),
            isStaff: false
          }
        ],
        createdAt: new Date('2025-01-03'),
        updatedAt: new Date('2025-01-07'),
        isActive: true,
        accessLevel: 'staff_only'
      },

      {
        id: 'video_004',
        title: 'When the AI Gets Stuck',
        description: 'Troubleshooting common AI issues and when to take manual control',
        category: 'troubleshooting',
        topics: ['Common Issues', 'Quick Fixes', 'Escalation Triggers', 'System Recovery'],
        duration: '06:30',
        durationSeconds: 390,
        thumbnailUrl: '/thumbnails/ai-troubleshooting.jpg',
        videoUrl: '/videos/ai-troubleshooting.mp4',
        transcriptUrl: '/transcripts/ai-troubleshooting.txt',
        closedCaptionsUrl: '/captions/ai-troubleshooting.vtt',
        difficulty: 'intermediate',
        prerequisites: ['video_001'],
        learningObjectives: [
          'Recognize when the AI needs assistance',
          'Apply quick fixes for common issues',
          'Know when to escalate to technical support',
          'Maintain patient satisfaction during technical difficulties'
        ],
        relatedModules: ['troubleshooting'],
        relatedScenarios: ['ai_not_understanding'],
        tags: ['troubleshooting', 'technical_issues', 'ai_problems', 'fixes'],
        viewCount: 63,
        averageRating: 4.7,
        ratings: [],
        comments: [],
        createdAt: new Date('2025-01-04'),
        updatedAt: new Date('2025-01-08'),
        isActive: true,
        accessLevel: 'staff_only'
      },

      {
        id: 'video_005',
        title: 'Using Analytics for Improvement',
        description: 'How to use system analytics and reports to improve your performance',
        category: 'best_practices',
        topics: ['Reports', 'Patterns', 'Feedback Analysis', 'Personal Development'],
        duration: '10:15',
        durationSeconds: 615,
        thumbnailUrl: '/thumbnails/analytics-improvement.jpg',
        videoUrl: '/videos/analytics-improvement.mp4',
        transcriptUrl: '/transcripts/analytics-improvement.txt',
        closedCaptionsUrl: '/captions/analytics-improvement.vtt',
        difficulty: 'intermediate',
        prerequisites: ['video_001', 'video_002'],
        learningObjectives: [
          'Understand key performance metrics',
          'Identify improvement opportunities from data',
          'Set personal development goals',
          'Use feedback effectively for growth'
        ],
        relatedModules: ['analytics_and_reporting'],
        relatedScenarios: [],
        tags: ['analytics', 'improvement', 'performance', 'development', 'metrics'],
        viewCount: 31,
        averageRating: 4.5,
        ratings: [],
        comments: [],
        createdAt: new Date('2025-01-05'),
        updatedAt: new Date('2025-01-09'),
        isActive: true,
        accessLevel: 'staff_only'
      }
    ];

    // Store videos
    sampleVideos.forEach(video => {
      this.videos.set(video.id, video);
    });

    // Initialize sample playlists
    const samplePlaylists: VideoPlaylist[] = [
      {
        id: 'playlist_001',
        title: 'New Employee Onboarding',
        description: 'Essential videos for new staff members to get started with the AI system',
        category: 'getting_started',
        videos: ['video_001', 'video_002'],
        estimatedDuration: 1095, // 18:15
        targetAudience: ['new_employees', 'receptionists', 'nurses'],
        learningPath: 'receptionist_path',
        createdBy: 'training_coordinator',
        createdAt: new Date('2025-01-01'),
        isPublic: true
      },
      {
        id: 'playlist_002',
        title: 'Advanced Staff Training',
        description: 'Advanced features and techniques for experienced staff',
        category: 'advanced_features',
        videos: ['video_003', 'video_005'],
        estimatedDuration: 1115, // 18:35
        targetAudience: ['experienced_staff', 'managers', 'team_leads'],
        learningPath: 'manager_path',
        createdBy: 'training_coordinator',
        createdAt: new Date('2025-01-02'),
        isPublic: true
      },
      {
        id: 'playlist_003',
        title: 'Troubleshooting Guide',
        description: 'Videos for handling technical issues and system problems',
        category: 'troubleshooting',
        videos: ['video_004'],
        estimatedDuration: 390, // 6:30
        targetAudience: ['all_staff'],
        learningPath: 'troubleshooting_track',
        createdBy: 'tech_support',
        createdAt: new Date('2025-01-03'),
        isPublic: true
      }
    ];

    samplePlaylists.forEach(playlist => {
      this.playlists.set(playlist.id, playlist);
    });

    // Initialize sample analytics
    sampleVideos.forEach(video => {
      const analytics: VideoAnalytics = {
        videoId: video.id,
        totalViews: video.viewCount,
        uniqueViewers: Math.round(video.viewCount * 0.8), // Assume 80% unique
        averageViewDuration: Math.round(video.durationSeconds * 0.75), // 75% completion on average
        completionRate: 75,
        engagementScore: video.averageRating * 20, // Convert 5-star to 100-point scale
        popularSegments: this.generatePopularSegments(video),
        viewerFeedback: {
          averageRating: video.averageRating,
          totalRatings: video.ratings.length,
          satisfactionScore: Math.round(video.averageRating * 20),
          commonTopics: video.topics.slice(0, 2)
        }
      };
      this.analytics.set(video.id, analytics);
    });

    logger.info('Video library initialized', {
      videoCount: this.videos.size,
      playlistCount: this.playlists.size,
      categories: [...new Set(sampleVideos.map(v => v.category))]
    });
  }

  private generatePopularSegments(video: Video): Array<{ startTime: number; endTime: number; viewCount: number; description: string }> {
    // Generate mock popular segments based on video content
    const segments = [];
    const segmentCount = Math.min(3, Math.floor(video.durationSeconds / 120)); // Max 3 segments, one per 2 minutes

    for (let i = 0; i < segmentCount; i++) {
      const startTime = Math.floor((video.durationSeconds / segmentCount) * i);
      const endTime = Math.min(startTime + 60, video.durationSeconds);
      segments.push({
        startTime,
        endTime,
        viewCount: Math.round(video.viewCount * (0.9 - i * 0.2)), // Decreasing popularity
        description: `Key concept ${i + 1}: ${video.topics[i] || 'Important information'}`
      });
    }

    return segments;
  }

  // Get all videos with filtering
  async getVideos(filters?: {
    category?: string;
    difficulty?: string;
    tags?: string[];
    search?: string;
    accessLevel?: string;
  }): Promise<Video[]> {
    let videos = Array.from(this.videos.values()).filter(v => v.isActive);

    if (filters) {
      if (filters.category) {
        videos = videos.filter(v => v.category === filters.category);
      }

      if (filters.difficulty) {
        videos = videos.filter(v => v.difficulty === filters.difficulty);
      }

      if (filters.tags && filters.tags.length > 0) {
        videos = videos.filter(v =>
          filters.tags!.some(tag => v.tags.includes(tag))
        );
      }

      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        videos = videos.filter(v =>
          v.title.toLowerCase().includes(searchTerm) ||
          v.description.toLowerCase().includes(searchTerm) ||
          v.topics.some(topic => topic.toLowerCase().includes(searchTerm)) ||
          v.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
      }

      if (filters.accessLevel) {
        videos = videos.filter(v => v.accessLevel === filters.accessLevel || v.accessLevel === 'public');
      }
    }

    return videos.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Get specific video
  async getVideo(id: string): Promise<Video | null> {
    const video = this.videos.get(id);
    return video && video.isActive ? video : null;
  }

  // Record video view
  async recordVideoView(videoId: string, userId: string, viewDuration: number): Promise<void> {
    const video = this.videos.get(videoId);
    if (!video) return;

    // Update view count
    video.viewCount++;

    // Update analytics
    const analytics = this.analytics.get(videoId);
    if (analytics) {
      analytics.totalViews++;

      // Update average view duration (weighted average)
      const totalDuration = analytics.averageViewDuration * (analytics.totalViews - 1) + viewDuration;
      analytics.averageViewDuration = Math.round(totalDuration / analytics.totalViews);

      // Update completion rate
      const completion = (viewDuration / video.durationSeconds) * 100;
      analytics.completionRate = Math.round(
        (analytics.completionRate * (analytics.totalViews - 1) + completion) / analytics.totalViews
      );
    }

    auditLog.userAccess(userId, 'VIDEO_VIEW', `/video/${videoId}`, true, {
      duration: viewDuration,
      completionPercentage: Math.round((viewDuration / video.durationSeconds) * 100)
    });

    logger.info('Video view recorded', {
      videoId,
      userId,
      viewDuration,
      totalViews: video.viewCount
    });
  }

  // Add video rating
  async addVideoRating(videoId: string, userId: string, rating: number, review?: string): Promise<boolean> {
    const video = this.videos.get(videoId);
    if (!video) return false;

    // Remove existing rating from this user
    video.ratings = video.ratings.filter(r => r.userId !== userId);

    // Add new rating
    video.ratings.push({
      userId,
      rating,
      review,
      createdAt: new Date()
    });

    // Update average rating
    const totalRating = video.ratings.reduce((sum, r) => sum + r.rating, 0);
    video.averageRating = totalRating / video.ratings.length;

    // Update analytics
    const analytics = this.analytics.get(videoId);
    if (analytics) {
      analytics.viewerFeedback.averageRating = video.averageRating;
      analytics.viewerFeedback.totalRatings = video.ratings.length;
      analytics.viewerFeedback.satisfactionScore = Math.round(video.averageRating * 20);
    }

    logger.info('Video rating added', {
      videoId,
      userId,
      rating,
      newAverageRating: video.averageRating
    });

    return true;
  }

  // Add video comment
  async addVideoComment(videoId: string, userId: string, userName: string, comment: string, timestamp: number = 0, isStaff: boolean = false): Promise<string | null> {
    const video = this.videos.get(videoId);
    if (!video) return null;

    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    video.comments.push({
      id: commentId,
      userId,
      userName,
      comment,
      timestamp,
      replies: [],
      createdAt: new Date(),
      isStaff
    });

    logger.info('Video comment added', {
      videoId,
      commentId,
      userId,
      timestamp,
      isStaff
    });

    return commentId;
  }

  // Get playlists
  async getPlaylists(category?: string): Promise<VideoPlaylist[]> {
    let playlists = Array.from(this.playlists.values()).filter(p => p.isPublic);

    if (category) {
      playlists = playlists.filter(p => p.category === category);
    }

    return playlists.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Get specific playlist with video details
  async getPlaylist(id: string): Promise<(VideoPlaylist & { videoDetails: Video[] }) | null> {
    const playlist = this.playlists.get(id);
    if (!playlist || !playlist.isPublic) return null;

    const videoDetails = playlist.videos
      .map(videoId => this.videos.get(videoId))
      .filter(video => video && video.isActive) as Video[];

    return {
      ...playlist,
      videoDetails
    };
  }

  // Get video analytics
  async getVideoAnalytics(videoId: string): Promise<VideoAnalytics | null> {
    return this.analytics.get(videoId) || null;
  }

  // Get content management metrics
  async getContentManagementMetrics(): Promise<ContentManagementMetrics> {
    const videos = Array.from(this.videos.values()).filter(v => v.isActive);
    const analytics = Array.from(this.analytics.values());

    const totalVideos = videos.length;
    const totalViewTime = analytics.reduce((sum, a) => sum + (a.averageViewDuration * a.totalViews), 0);
    const averageRating = videos.reduce((sum, v) => sum + v.averageRating, 0) / totalVideos;

    // Identify content gaps (topics with low video count)
    const topicCounts: Record<string, number> = {};
    videos.forEach(video => {
      video.topics.forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
    });

    const contentGaps = Object.entries(topicCounts)
      .filter(([_, count]) => count < 2)
      .map(([topic, _]) => topic);

    // Popular content (high view count and rating)
    const popularContent = videos
      .filter(v => v.viewCount > 50 && v.averageRating > 4.0)
      .map(v => v.title);

    // Content needing updates (low ratings or old content)
    const updateNeeded = videos
      .filter(v => v.averageRating < 4.0 ||
        (Date.now() - v.updatedAt.getTime()) > (90 * 24 * 60 * 60 * 1000)) // 90 days old
      .map(v => v.title);

    return {
      totalVideos,
      totalViewTime: Math.round(totalViewTime),
      averageRating: Math.round(averageRating * 100) / 100,
      contentGaps,
      popularContent,
      updateNeeded,
      userEngagement: {
        activeViewers: Math.round(analytics.reduce((sum, a) => sum + a.uniqueViewers, 0) / 30), // Monthly active
        averageSessionDuration: Math.round(totalViewTime / analytics.reduce((sum, a) => sum + a.totalViews, 0)),
        returnRate: 65 // Mock return rate percentage
      }
    };
  }

  // Search videos
  async searchVideos(query: string, filters?: { category?: string; difficulty?: string }): Promise<Video[]> {
    const searchTerm = query.toLowerCase();
    let videos = Array.from(this.videos.values()).filter(v => v.isActive);

    // Apply filters
    if (filters?.category) {
      videos = videos.filter(v => v.category === filters.category);
    }
    if (filters?.difficulty) {
      videos = videos.filter(v => v.difficulty === filters.difficulty);
    }

    // Search and score relevance
    const searchResults = videos
      .map(video => ({
        video,
        relevanceScore: this.calculateRelevanceScore(video, searchTerm)
      }))
      .filter(result => result.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map(result => result.video);

    return searchResults;
  }

  // Get recommended videos for user
  async getRecommendedVideos(userId: string, userRole: string, completedModules: string[] = []): Promise<Video[]> {
    let videos = Array.from(this.videos.values()).filter(v => v.isActive);

    // Filter by access level and role
    videos = videos.filter(v => {
      if (v.accessLevel === 'admin_only' && userRole !== 'admin') return false;
      if (v.accessLevel === 'staff_only' && userRole === 'public') return false;
      return true;
    });

    // Score videos based on relevance to user
    const recommendations = videos
      .map(video => ({
        video,
        score: this.calculateRecommendationScore(video, userRole, completedModules)
      }))
      .filter(rec => rec.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Top 10 recommendations
      .map(rec => rec.video);

    return recommendations;
  }

  // Private helper methods
  private calculateRelevanceScore(video: Video, searchTerm: string): number {
    let score = 0;

    if (video.title.toLowerCase().includes(searchTerm)) score += 10;
    if (video.description.toLowerCase().includes(searchTerm)) score += 5;
    if (video.topics.some(topic => topic.toLowerCase().includes(searchTerm))) score += 8;
    if (video.tags.some(tag => tag.toLowerCase().includes(searchTerm))) score += 3;

    // Boost popular and highly rated content
    if (video.viewCount > 50) score += 2;
    if (video.averageRating > 4.5) score += 2;

    return score;
  }

  private calculateRecommendationScore(video: Video, userRole: string, completedModules: string[]): number {
    let score = 0;

    // Base score from video quality
    score += video.averageRating * 10;
    score += Math.min(video.viewCount / 10, 10); // Cap at 10 points for popularity

    // Boost based on completion of related modules
    const relatedCompleted = video.relatedModules.filter(module => completedModules.includes(module)).length;
    score += relatedCompleted * 15;

    // Role-specific recommendations
    if (userRole === 'manager' && video.category === 'advanced_features') score += 20;
    if (userRole === 'receptionist' && video.category === 'getting_started') score += 15;
    if (video.category === 'troubleshooting') score += 10; // Always useful

    // Penalize if prerequisites not met
    const unmetPrereqs = video.prerequisites.filter(prereq => !completedModules.includes(prereq)).length;
    score -= unmetPrereqs * 5;

    return Math.max(0, score);
  }
}

export default VideoLibraryService;