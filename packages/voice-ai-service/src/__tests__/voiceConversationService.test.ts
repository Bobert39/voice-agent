import { VoiceConversationService } from '../services/voice/voiceConversationService';

describe('VoiceConversationService', () => {
  let service: VoiceConversationService;

  beforeEach(() => {
    service = new VoiceConversationService();
  });

  describe('processInput', () => {
    it('should handle practice hours inquiry', async () => {
      const response = await service.processInput('Are you open?', 'test-call-123');
      
      expect(response.intent).toBe('practice_hours');
      expect(response.confidence).toBe(0.9);
      expect(response.expectsMoreInput).toBe(false);
      expect(response.message).toContain('office hours');
    });

    it('should handle greeting', async () => {
      const response = await service.processInput('Hello', 'test-call-123');
      
      expect(response.intent).toBe('greeting');
      expect(response.confidence).toBe(0.8);
      expect(response.expectsMoreInput).toBe(true);
      expect(response.message).toContain('Capitol Eye Care');
    });

    it('should handle goodbye', async () => {
      const response = await service.processInput('Thank you, goodbye', 'test-call-123');
      
      expect(response.intent).toBe('goodbye');
      expect(response.confidence).toBe(0.8);
      expect(response.expectsMoreInput).toBe(false);
      expect(response.message).toContain('Thank you');
    });

    it('should handle help requests', async () => {
      const response = await service.processInput('I need help', 'test-call-123');
      
      expect(response.intent).toBe('help_request');
      expect(response.confidence).toBe(0.7);
      expect(response.expectsMoreInput).toBe(true);
      expect(response.message).toContain('assistance');
    });

    it('should provide clarification for unclear input', async () => {
      const response = await service.processInput('umm something about', 'test-call-123');
      
      expect(response.intent).toBe('clarification_needed');
      expect(response.confidence).toBe(0.5);
      expect(response.expectsMoreInput).toBe(true);
      expect(response.message).toContain('understand you correctly');
    });

    it('should handle various practice hours inquiries', async () => {
      const inquiries = [
        'What time do you close?',
        'When are you open?',
        'What are your hours?',
        'Are you closed today?',
        'What time do you open?'
      ];

      for (const inquiry of inquiries) {
        const response = await service.processInput(inquiry, 'test-call-123');
        expect(response.intent).toBe('practice_hours');
        expect(response.confidence).toBe(0.9);
      }
    });

    it('should handle system errors gracefully', async () => {
      // Mock an error condition by passing invalid input
      jest.spyOn(service as any, 'isPracticeHoursInquiry').mockImplementation(() => {
        throw new Error('Test error');
      });

      const response = await service.processInput('Are you open?', 'test-call-123');
      
      expect(response.intent).toBe('system_error');
      expect(response.confidence).toBe(1.0);
      expect(response.expectsMoreInput).toBe(false);
      expect(response.message).toContain('trouble processing');
    });
  });

  describe('practice hours logic', () => {
    it('should correctly identify weekday hours', () => {
      // Mock current time to Wednesday 10 AM
      const mockDate = new Date();
      mockDate.setDate(mockDate.getDate() - mockDate.getDay() + 3); // Wednesday
      mockDate.setHours(10, 0, 0, 0);
      
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      const isOpen = (service as any).isCurrentlyOpen(10, 3); // Wednesday, 10 AM
      expect(isOpen).toBe(true);
      
      jest.restoreAllMocks();
    });

    it('should correctly identify after-hours', () => {
      const isOpen = (service as any).isCurrentlyOpen(18, 3); // Wednesday, 6 PM
      expect(isOpen).toBe(false);
    });

    it('should correctly identify Sunday as closed', () => {
      const isOpen = (service as any).isCurrentlyOpen(12, 0); // Sunday, 12 PM
      expect(isOpen).toBe(false);
    });

    it('should correctly identify Saturday hours', () => {
      const isOpenMorning = (service as any).isCurrentlyOpen(11, 6); // Saturday, 11 AM
      const isClosedAfternoon = (service as any).isCurrentlyOpen(15, 6); // Saturday, 3 PM
      
      expect(isOpenMorning).toBe(true);
      expect(isClosedAfternoon).toBe(false);
    });
  });

  describe('intent detection', () => {
    it('should detect practice hours keywords', () => {
      const inputs = [
        'are you open',
        'what time do you close',
        'when are your hours',
        'what are your operating hours',
        'are you available now'
      ];

      inputs.forEach(input => {
        const result = (service as any).isPracticeHoursInquiry(input.toLowerCase());
        expect(result).toBe(true);
      });
    });

    it('should detect greeting keywords', () => {
      const inputs = [
        'hello',
        'hi there',
        'good morning',
        'good afternoon',
        'hey'
      ];

      inputs.forEach(input => {
        const result = (service as any).isGreeting(input.toLowerCase());
        expect(result).toBe(true);
      });
    });

    it('should detect goodbye keywords', () => {
      const inputs = [
        'goodbye',
        'thank you',
        'thanks for your help',
        'that\'s all I need',
        'have a good day'
      ];

      inputs.forEach(input => {
        const result = (service as any).isGoodbye(input.toLowerCase());
        expect(result).toBe(true);
      });
    });

    it('should detect help requests', () => {
      const inputs = [
        'I need help',
        'can you assist me',
        'I\'m confused',
        'what can you do',
        'I don\'t understand'
      ];

      inputs.forEach(input => {
        const result = (service as any).needsHelp(input.toLowerCase());
        expect(result).toBe(true);
      });
    });
  });
});