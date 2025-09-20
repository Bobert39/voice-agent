import { logger, auditLog } from '../utils/logger';
import { Feedback } from '../types';

// Feedback Ticket Interface
interface FeedbackTicket {
  id: string;
  status: 'new' | 'triaged' | 'in_progress' | 'resolved' | 'closed';
  assignee?: string;
  resolution?: string;
  responseTime: number; // hours
  priority: number; // 1-5, 5 being highest
  tags: string[];
  relatedTickets: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface FeedbackAnalytics {
  totalFeedback: number;
  byCategory: Record<string, number>;
  byUrgency: Record<string, number>;
  averageResponseTime: number;
  resolutionRate: number;
  commonIssues: Array<{
    category: string;
    count: number;
    percentage: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
  satisfactionScore: number;
  monthlyTrends: Array<{
    month: string;
    feedbackCount: number;
    resolutionRate: number;
    averageResponseTime: number;
  }>;
}

class FeedbackService {
  private feedbackStorage: Map<string, Feedback> = new Map();
  private ticketStorage: Map<string, FeedbackTicket> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData() {
    // Add some sample feedback for demonstration
    const sampleFeedback: Feedback[] = [
      {
        id: 'feedback_001',
        category: 'suggestion',
        urgency: 'medium',
        description: 'The AI sometimes has trouble understanding patients with accents. Could we add accent training?',
        context: {
          moduleId: 'ai_fundamentals',
          timestamp: new Date('2025-01-10'),
          affectedFeature: 'speech_recognition'
        },
        submitter: {
          staffId: 'staff_001',
          role: 'receptionist',
          experience: 'experienced'
        },
        status: 'triaged',
        assignee: 'ai_team_lead',
        responseTime: 4,
        createdAt: new Date('2025-01-10'),
        updatedAt: new Date('2025-01-11')
      },
      {
        id: 'feedback_002',
        category: 'bug',
        urgency: 'high',
        description: 'Dashboard freezes when multiple escalations come in at once',
        context: {
          timestamp: new Date('2025-01-12'),
          affectedFeature: 'dashboard_escalations'
        },
        submitter: {
          staffId: 'staff_002',
          role: 'manager',
          experience: 'expert'
        },
        status: 'in_progress',
        assignee: 'tech_team',
        responseTime: 2,
        createdAt: new Date('2025-01-12'),
        updatedAt: new Date('2025-01-13')
      },
      {
        id: 'feedback_003',
        category: 'praise',
        urgency: 'low',
        description: 'The new training simulator is excellent! Really helps practice difficult scenarios.',
        context: {
          moduleId: 'escalation_handling',
          scenarioId: 'confused_elderly_patient'
        },
        submitter: {
          staffId: 'staff_003',
          role: 'nurse',
          experience: 'new'
        },
        status: 'resolved',
        responseTime: 24,
        resolution: 'Positive feedback shared with development team and used for case study',
        createdAt: new Date('2025-01-08'),
        updatedAt: new Date('2025-01-09')
      }
    ];

    sampleFeedback.forEach(feedback => {
      this.feedbackStorage.set(feedback.id, feedback);
    });

    logger.info('Feedback service initialized with sample data', {
      feedbackCount: this.feedbackStorage.size
    });
  }

  // Submit new feedback
  async submitFeedback(feedbackData: Omit<Feedback, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<Feedback> {
    const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const feedback: Feedback = {
      ...feedbackData,
      id: feedbackId,
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.feedbackStorage.set(feedbackId, feedback);

    // Create corresponding ticket
    const ticket: FeedbackTicket = {
      id: `ticket_${feedbackId}`,
      status: 'new',
      responseTime: 0,
      priority: this.calculatePriority(feedback),
      tags: this.generateTags(feedback),
      relatedTickets: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.ticketStorage.set(ticket.id, ticket);

    // Auto-assign based on category and urgency
    const assignee = this.autoAssignTicket(feedback);
    if (assignee) {
      feedback.assignee = assignee;
      ticket.assignee = assignee;
      ticket.status = 'triaged';
      this.feedbackStorage.set(feedbackId, feedback); // Update feedback with assignee
    }

    auditLog.userAccess(feedback.submitter.staffId, 'FEEDBACK_SUBMIT', `/feedback/${feedbackId}`, true);

    logger.info('Feedback submitted', {
      feedbackId,
      category: feedback.category,
      urgency: feedback.urgency,
      submitter: feedback.submitter.staffId,
      assignee: ticket.assignee
    });

    return feedback;
  }

  // Get all feedback with filtering
  async getFeedback(filters?: {
    category?: string;
    urgency?: string;
    status?: string;
    submitterId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Feedback[]> {
    let feedback = Array.from(this.feedbackStorage.values());

    if (filters) {
      if (filters.category) {
        feedback = feedback.filter(f => f.category === filters.category);
      }
      if (filters.urgency) {
        feedback = feedback.filter(f => f.urgency === filters.urgency);
      }
      if (filters.status) {
        feedback = feedback.filter(f => f.status === filters.status);
      }
      if (filters.submitterId) {
        feedback = feedback.filter(f => f.submitter.staffId === filters.submitterId);
      }
      if (filters.dateFrom) {
        feedback = feedback.filter(f => f.createdAt >= filters.dateFrom!);
      }
      if (filters.dateTo) {
        feedback = feedback.filter(f => f.createdAt <= filters.dateTo!);
      }
    }

    return feedback.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Get specific feedback item
  async getFeedbackById(id: string): Promise<Feedback | null> {
    return this.feedbackStorage.get(id) || null;
  }

  // Update feedback status
  async updateFeedbackStatus(
    id: string,
    status: Feedback['status'],
    resolution?: string,
    assignee?: string
  ): Promise<Feedback | null> {
    const feedback = this.feedbackStorage.get(id);
    if (!feedback) {
      return null;
    }

    feedback.status = status;
    feedback.updatedAt = new Date();

    if (resolution) {
      feedback.resolution = resolution;
    }

    if (assignee) {
      feedback.assignee = assignee;
    }

    if (status === 'resolved' || status === 'closed') {
      const responseTime = (feedback.updatedAt.getTime() - feedback.createdAt.getTime()) / (1000 * 60 * 60); // hours
      feedback.responseTime = responseTime;
    }

    this.feedbackStorage.set(id, feedback);

    // Update corresponding ticket
    const ticketId = `ticket_${id}`;
    const ticket = this.ticketStorage.get(ticketId);
    if (ticket) {
      ticket.status = status as any;
      ticket.updatedAt = new Date();
      if (assignee) ticket.assignee = assignee;
      if (feedback.responseTime) ticket.responseTime = feedback.responseTime;
      this.ticketStorage.set(ticketId, ticket);
    }

    logger.info('Feedback status updated', {
      feedbackId: id,
      newStatus: status,
      assignee,
      hasResolution: !!resolution
    });

    return feedback;
  }

  // Get feedback analytics
  async getFeedbackAnalytics(timeframe?: 'week' | 'month' | 'quarter' | 'year'): Promise<FeedbackAnalytics> {
    const allFeedback = Array.from(this.feedbackStorage.values());

    // Filter by timeframe if specified
    let filteredFeedback = allFeedback;
    if (timeframe) {
      const now = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(now.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }

      filteredFeedback = allFeedback.filter(f => f.createdAt >= startDate);
    }

    // Calculate analytics
    const totalFeedback = filteredFeedback.length;

    const byCategory = filteredFeedback.reduce((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byUrgency = filteredFeedback.reduce((acc, f) => {
      acc[f.urgency] = (acc[f.urgency] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const resolvedFeedback = filteredFeedback.filter(f => f.status === 'resolved' || f.status === 'closed');
    const resolutionRate = totalFeedback > 0 ? (resolvedFeedback.length / totalFeedback) * 100 : 0;

    const avgResponseTime = resolvedFeedback.length > 0
      ? resolvedFeedback.reduce((sum, f) => sum + (f.responseTime || 0), 0) / resolvedFeedback.length
      : 0;

    // Common issues analysis
    const commonIssues = Object.entries(byCategory).map(([category, count]) => ({
      category,
      count,
      percentage: (count / totalFeedback) * 100,
      trend: 'stable' as const // In real implementation, would calculate based on historical data
    })).sort((a, b) => b.count - a.count);

    // Satisfaction score (based on praise vs complaints)
    const praiseCount = byCategory.praise || 0;
    const complaintCount = (byCategory.bug || 0) + (byCategory.training_gap || 0);
    const satisfactionScore = totalFeedback > 0
      ? Math.max(0, Math.min(100, 50 + ((praiseCount - complaintCount) / totalFeedback) * 50))
      : 75;

    // Monthly trends (mock data for demonstration)
    const monthlyTrends = [
      { month: '2024-11', feedbackCount: 12, resolutionRate: 85, averageResponseTime: 6.2 },
      { month: '2024-12', feedbackCount: 18, resolutionRate: 78, averageResponseTime: 5.8 },
      { month: '2025-01', feedbackCount: totalFeedback, resolutionRate, averageResponseTime: avgResponseTime }
    ];

    return {
      totalFeedback,
      byCategory,
      byUrgency,
      averageResponseTime: avgResponseTime,
      resolutionRate,
      commonIssues,
      satisfactionScore,
      monthlyTrends
    };
  }

  // Search feedback
  async searchFeedback(query: string, filters?: { category?: string; urgency?: string }): Promise<Feedback[]> {
    const searchTerm = query.toLowerCase();
    let feedback = Array.from(this.feedbackStorage.values());

    // Apply filters
    if (filters?.category) {
      feedback = feedback.filter(f => f.category === filters.category);
    }
    if (filters?.urgency) {
      feedback = feedback.filter(f => f.urgency === filters.urgency);
    }

    // Search in description, context, and resolution
    const results = feedback.filter(f =>
      f.description.toLowerCase().includes(searchTerm) ||
      f.context?.affectedFeature?.toLowerCase().includes(searchTerm) ||
      f.resolution?.toLowerCase().includes(searchTerm)
    );

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Get feedback by staff member
  async getFeedbackByStaff(staffId: string): Promise<Feedback[]> {
    return Array.from(this.feedbackStorage.values())
      .filter(f => f.submitter.staffId === staffId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Get pending feedback (for staff dashboard)
  async getPendingFeedback(assignee?: string): Promise<Feedback[]> {
    let feedback = Array.from(this.feedbackStorage.values())
      .filter(f => f.status === 'new' || f.status === 'triaged' || f.status === 'in_progress');

    if (assignee) {
      feedback = feedback.filter(f => f.assignee === assignee);
    }

    return feedback.sort((a, b) => {
      // Sort by urgency first, then by creation date
      const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aUrgency = urgencyOrder[a.urgency as keyof typeof urgencyOrder] || 0;
      const bUrgency = urgencyOrder[b.urgency as keyof typeof urgencyOrder] || 0;

      if (aUrgency !== bUrgency) {
        return bUrgency - aUrgency;
      }

      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  // Private helper methods
  private calculatePriority(feedback: Feedback): number {
    let priority = 1;

    // Base priority on urgency
    switch (feedback.urgency) {
      case 'critical': priority = 5; break;
      case 'high': priority = 4; break;
      case 'medium': priority = 3; break;
      case 'low': priority = 2; break;
    }

    // Increase priority for certain categories
    if (feedback.category === 'bug') priority += 1;
    if (feedback.category === 'training_gap') priority += 1;

    // Increase priority for experienced staff feedback
    if (feedback.submitter.experience === 'expert') priority += 1;

    return Math.min(5, priority);
  }

  private generateTags(feedback: Feedback): string[] {
    const tags: string[] = [feedback.category, feedback.urgency];

    if (feedback.context?.moduleId) {
      tags.push(`module:${feedback.context.moduleId}`);
    }

    if (feedback.context?.scenarioId) {
      tags.push(`scenario:${feedback.context.scenarioId}`);
    }

    if (feedback.context?.affectedFeature) {
      tags.push(`feature:${feedback.context.affectedFeature}`);
    }

    tags.push(`role:${feedback.submitter.role}`);
    tags.push(`experience:${feedback.submitter.experience}`);

    return tags;
  }

  private autoAssignTicket(feedback: Feedback): string | undefined {
    // Auto-assignment logic based on category and urgency
    switch (feedback.category) {
      case 'bug':
        return feedback.urgency === 'critical' || feedback.urgency === 'high'
          ? 'tech_team_lead'
          : 'tech_team';

      case 'training_gap':
        return 'training_coordinator';

      case 'suggestion':
        return feedback.urgency === 'high'
          ? 'product_manager'
          : 'feedback_coordinator';

      case 'praise':
        return 'training_coordinator'; // For positive reinforcement tracking

      default:
        return 'feedback_coordinator';
    }
  }
}

export default FeedbackService;