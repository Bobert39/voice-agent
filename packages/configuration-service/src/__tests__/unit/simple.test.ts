import { describe, it, expect } from '@jest/globals';
import { ConfigurationValidator } from '../../utils/validation';

describe('Simple Configuration Tests', () => {
  describe('ConfigurationValidator', () => {
    it('should validate practice settings correctly', () => {
      const validData = {
        practice_id: 'practice-123',
        setting_key: 'practice_hours',
        setting_value: {
          monday: { open: '09:00', close: '17:00', is_closed: false },
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validatePracticeSettings(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate cron expressions correctly', () => {
      expect(ConfigurationValidator.validateCronExpression('0 2 * * *')).toBe(true);
      expect(ConfigurationValidator.validateCronExpression('invalid')).toBe(false);
    });

    it('should sanitize sensitive data for logging', () => {
      const data = {
        setting_key: 'email_config',
        password: 'secret123',
        api_key: 'key123',
        public_info: 'not secret',
      };

      const sanitized = ConfigurationValidator.sanitizeForLogging(data);
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.public_info).toBe('not secret');
    });
  });
});