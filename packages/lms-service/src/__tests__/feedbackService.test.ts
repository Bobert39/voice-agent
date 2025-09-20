import FeedbackService from '../services/feedbackService';

describe('FeedbackService', () => {
  let feedbackService: FeedbackService;

  beforeEach(() => {
    feedbackService = new FeedbackService();
  });

  describe('submitFeedback', () => {
    it('should successfully submit new feedback', async () => {
      const feedbackData = {
        category: 'suggestion' as const,
        urgency: 'medium' as const,
        description: 'Test feedback description',
        submitter: {
          staffId: 'staff_test',
          role: 'receptionist',
          experience: 'experienced' as const
        },
        context: {
          moduleId: 'test_module',
          timestamp: new Date(),
          affectedFeature: 'test_feature'
        }
      };

      const feedback = await feedbackService.submitFeedback(feedbackData);

      expect(feedback).toBeDefined();
      expect(feedback.id).toMatch(/^feedback_/);
      expect(feedback.category).toBe('suggestion');
      expect(feedback.urgency).toBe('medium');
      expect(feedback.status).toBe('new');
      expect(feedback.description).toBe('Test feedback description');
      expect(feedback.submitter.staffId).toBe('staff_test');
    });

    it('should auto-assign feedback based on category', async () => {
      const bugFeedback = {
        category: 'bug' as const,
        urgency: 'high' as const,
        description: 'Critical bug report',
        submitter: {
          staffId: 'staff_test',
          role: 'receptionist',
          experience: 'experienced' as const
        }
      };

      const feedback = await feedbackService.submitFeedback(bugFeedback);

      // Should be auto-assigned to tech team for high priority bugs
      expect(feedback.assignee).toBe('tech_team_lead');
    });
  });

  describe('getFeedback', () => {
    beforeEach(async () => {
      // Submit test feedback
      await feedbackService.submitFeedback({
        category: 'bug',
        urgency: 'high',
        description: 'Test bug',
        submitter: {
          staffId: 'staff_test_1',
          role: 'receptionist',
          experience: 'experienced'
        }
      });

      await feedbackService.submitFeedback({
        category: 'suggestion',
        urgency: 'low',
        description: 'Test suggestion',
        submitter: {
          staffId: 'staff_test_2',
          role: 'manager',
          experience: 'expert'
        }
      });
    });

    it('should retrieve all feedback when no filters applied', async () => {
      const feedback = await feedbackService.getFeedback();

      expect(feedback.length).toBeGreaterThanOrEqual(2);
      expect(feedback[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(feedback[1]?.createdAt.getTime() || 0);
    });

    it('should filter feedback by category', async () => {
      const bugFeedback = await feedbackService.getFeedback({ category: 'bug' });
      const suggestionFeedback = await feedbackService.getFeedback({ category: 'suggestion' });

      expect(bugFeedback.every(f => f.category === 'bug')).toBe(true);
      expect(suggestionFeedback.every(f => f.category === 'suggestion')).toBe(true);
    });

    it('should filter feedback by urgency', async () => {
      const highUrgencyFeedback = await feedbackService.getFeedback({ urgency: 'high' });
      const lowUrgencyFeedback = await feedbackService.getFeedback({ urgency: 'low' });

      expect(highUrgencyFeedback.every(f => f.urgency === 'high')).toBe(true);
      expect(lowUrgencyFeedback.every(f => f.urgency === 'low')).toBe(true);
    });

    it('should filter feedback by submitter', async () => {
      const userFeedback = await feedbackService.getFeedback({ submitterId: 'staff_test_1' });

      expect(userFeedback.every(f => f.submitter.staffId === 'staff_test_1')).toBe(true);
    });
  });

  describe('updateFeedbackStatus', () => {
    let feedbackId: string;

    beforeEach(async () => {
      const feedback = await feedbackService.submitFeedback({
        category: 'suggestion',
        urgency: 'medium',
        description: 'Test feedback for status update',
        submitter: {
          staffId: 'staff_test',
          role: 'receptionist',
          experience: 'experienced'
        }
      });
      feedbackId = feedback.id;
    });

    it('should successfully update feedback status', async () => {
      const updatedFeedback = await feedbackService.updateFeedbackStatus(
        feedbackId,
        'in_progress',
        undefined,
        'admin_user'
      );

      expect(updatedFeedback).toBeDefined();
      expect(updatedFeedback!.status).toBe('in_progress');
      expect(updatedFeedback!.assignee).toBe('admin_user');
    });

    it('should calculate response time when resolving feedback', async () => {
      // Add a small delay to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 1));

      const updatedFeedback = await feedbackService.updateFeedbackStatus(
        feedbackId,
        'resolved',
        'Issue has been resolved',
        'admin_user'
      );

      expect(updatedFeedback).toBeDefined();
      expect(updatedFeedback!.status).toBe('resolved');
      expect(updatedFeedback!.resolution).toBe('Issue has been resolved');
      expect(updatedFeedback!.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent feedback', async () => {
      const result = await feedbackService.updateFeedbackStatus(
        'non_existent_id',
        'resolved'
      );

      expect(result).toBeNull();
    });
  });

  describe('searchFeedback', () => {
    beforeEach(async () => {
      await feedbackService.submitFeedback({
        category: 'bug',
        urgency: 'high',
        description: 'AI recognition issues with patient accents',
        submitter: {
          staffId: 'staff_search_test',
          role: 'receptionist',
          experience: 'experienced'
        },
        context: {
          affectedFeature: 'speech_recognition'
        }
      });
    });

    it('should find feedback by description content', async () => {
      const results = await feedbackService.searchFeedback('accent');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.description.toLowerCase()).toContain('accent');
    });

    it('should find feedback by affected feature', async () => {
      const results = await feedbackService.searchFeedback('speech_recognition');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.context?.affectedFeature).toContain('speech_recognition');
    });

    it('should filter search results by category', async () => {
      const results = await feedbackService.searchFeedback('ai', { category: 'bug' });

      expect(results.every(f => f.category === 'bug')).toBe(true);
    });
  });

  describe('getFeedbackAnalytics', () => {
    beforeEach(async () => {
      // Submit various types of feedback for analytics
      await feedbackService.submitFeedback({
        category: 'bug',
        urgency: 'high',
        description: 'Bug report 1',
        submitter: { staffId: 'staff_1', role: 'receptionist', experience: 'experienced' }
      });

      await feedbackService.submitFeedback({
        category: 'suggestion',
        urgency: 'medium',
        description: 'Suggestion 1',
        submitter: { staffId: 'staff_2', role: 'manager', experience: 'expert' }
      });

      await feedbackService.submitFeedback({
        category: 'praise',
        urgency: 'low',
        description: 'Great system!',
        submitter: { staffId: 'staff_3', role: 'nurse', experience: 'new' }
      });
    });

    it('should return comprehensive analytics', async () => {
      const analytics = await feedbackService.getFeedbackAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics.totalFeedback).toBeGreaterThan(0);
      expect(analytics.byCategory).toBeDefined();
      expect(analytics.byUrgency).toBeDefined();
      expect(analytics.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(analytics.resolutionRate).toBeGreaterThanOrEqual(0);
      expect(analytics.commonIssues).toBeInstanceOf(Array);
      expect(analytics.satisfactionScore).toBeGreaterThanOrEqual(0);
      expect(analytics.monthlyTrends).toBeInstanceOf(Array);
    });

    it('should calculate satisfaction score based on feedback types', async () => {
      const analytics = await feedbackService.getFeedbackAnalytics();

      // With praise and suggestions, satisfaction should be reasonable
      expect(analytics.satisfactionScore).toBeGreaterThan(0);
      expect(analytics.satisfactionScore).toBeLessThanOrEqual(100);
    });

    it('should categorize feedback correctly', async () => {
      const analytics = await feedbackService.getFeedbackAnalytics();

      expect(analytics.byCategory.bug).toBeGreaterThan(0);
      expect(analytics.byCategory.suggestion).toBeGreaterThan(0);
      expect(analytics.byCategory.praise).toBeGreaterThan(0);
    });
  });

  describe('getPendingFeedback', () => {
    beforeEach(async () => {
      await feedbackService.submitFeedback({
        category: 'bug',
        urgency: 'critical',
        description: 'Critical bug needing immediate attention',
        submitter: { staffId: 'staff_test', role: 'receptionist', experience: 'experienced' }
      });

      await feedbackService.submitFeedback({
        category: 'suggestion',
        urgency: 'low',
        description: 'Low priority suggestion',
        submitter: { staffId: 'staff_test', role: 'receptionist', experience: 'experienced' }
      });
    });

    it('should return pending feedback sorted by priority', async () => {
      const pending = await feedbackService.getPendingFeedback();

      expect(pending.length).toBeGreaterThan(0);

      // Critical urgency should come before low urgency
      const criticalIndex = pending.findIndex(f => f.urgency === 'critical');
      const lowIndex = pending.findIndex(f => f.urgency === 'low');

      if (criticalIndex !== -1 && lowIndex !== -1) {
        expect(criticalIndex).toBeLessThan(lowIndex);
      }
    });

    it('should filter by assignee when specified', async () => {
      const assigneeFeedback = await feedbackService.getPendingFeedback('tech_team_lead');

      // All returned feedback should be assigned to the specified user
      expect(assigneeFeedback.every(f => f.assignee === 'tech_team_lead')).toBe(true);
    });
  });
});