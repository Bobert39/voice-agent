/**
 * Entity Extraction Service Tests
 */

import { EntityExtractionService } from '../../src/services/entity-extraction-service';
import { IntentCategory, EntityType } from '../../src/types';

describe('EntityExtractionService', () => {
  let service: EntityExtractionService;

  beforeEach(() => {
    service = new EntityExtractionService();
  });

  describe('extractEntities', () => {
    it('should extract date entities', async () => {
      const utterance = 'I need an appointment tomorrow at 2pm';
      const entities = await service.extractEntities(utterance, IntentCategory.APPOINTMENT);

      const dateEntity = entities.find(e => e.type === EntityType.DATE);
      expect(dateEntity).toBeDefined();
      expect(dateEntity?.value).toBe('tomorrow');
    });

    it('should extract time entities', async () => {
      const utterance = 'Can I come in at 3:30 PM?';
      const entities = await service.extractEntities(utterance, IntentCategory.APPOINTMENT);

      const timeEntity = entities.find(e => e.type === EntityType.TIME);
      expect(timeEntity).toBeDefined();
      expect(timeEntity?.value).toMatch(/3:30\s*PM/i);
    });

    it('should extract provider names', async () => {
      const utterance = 'I want to see Dr. Smith';
      const entities = await service.extractEntities(utterance, IntentCategory.APPOINTMENT);

      const providerEntity = entities.find(e => e.type === EntityType.PROVIDER);
      expect(providerEntity).toBeDefined();
      expect(providerEntity?.normalizedValue).toBe('Dr. Smith');
    });

    it('should extract insurance carriers', async () => {
      const utterance = 'Do you accept Medicare?';
      const entities = await service.extractEntities(utterance, IntentCategory.INSURANCE);

      const insuranceEntity = entities.find(e => e.type === EntityType.INSURANCE_CARRIER);
      expect(insuranceEntity).toBeDefined();
      expect(insuranceEntity?.normalizedValue).toBe('Medicare');
    });

    it('should extract phone numbers', async () => {
      const utterance = 'My number is 555-123-4567';
      const entities = await service.extractEntities(utterance, IntentCategory.GENERAL);

      const phoneEntity = entities.find(e => e.type === EntityType.PHONE_NUMBER);
      expect(phoneEntity).toBeDefined();
      expect(phoneEntity?.normalizedValue).toBe('555-123-4567');
    });

    it('should extract medical conditions for emergency intents', async () => {
      const utterance = 'I have severe eye pain and blurry vision';
      const entities = await service.extractEntities(utterance, IntentCategory.EMERGENCY);

      const conditions = entities.filter(e => e.type === EntityType.CONDITION);
      expect(conditions.length).toBeGreaterThan(0);
      expect(conditions.some(c => c.value === 'eye pain')).toBe(true);
      expect(conditions.some(c => c.value === 'blurry vision')).toBe(true);
    });

    it('should extract medications for prescription intents', async () => {
      const utterance = 'I need a refill on my glaucoma medication';
      const entities = await service.extractEntities(utterance, IntentCategory.PRESCRIPTION);

      const medicationEntity = entities.find(e => e.type === EntityType.MEDICATION);
      expect(medicationEntity).toBeDefined();
      expect(medicationEntity?.value).toBe('glaucoma medication');
    });

    it('should handle multiple entities in one utterance', async () => {
      const utterance = 'Can I schedule with Dr. Jones tomorrow at 10am?';
      const entities = await service.extractEntities(utterance, IntentCategory.APPOINTMENT);

      expect(entities.length).toBeGreaterThanOrEqual(3);
      expect(entities.some(e => e.type === EntityType.PROVIDER)).toBe(true);
      expect(entities.some(e => e.type === EntityType.DATE)).toBe(true);
      expect(entities.some(e => e.type === EntityType.TIME)).toBe(true);
    });

    it('should deduplicate entities', async () => {
      const utterance = 'Tomorrow, I said tomorrow';
      const entities = await service.extractEntities(utterance, IntentCategory.APPOINTMENT);

      const dateEntities = entities.filter(e => e.type === EntityType.DATE);
      expect(dateEntities.length).toBe(1);
    });

    it('should return empty array for utterances with no entities', async () => {
      const utterance = 'Hello, how are you?';
      const entities = await service.extractEntities(utterance, IntentCategory.GENERAL);

      expect(entities).toEqual([]);
    });
  });

  describe('Entity normalization', () => {
    it('should normalize dates correctly', async () => {
      const tests = [
        { input: 'today', expected: new Date().toISOString().split('T')[0] },
        { input: 'tomorrow', expected: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d.toISOString().split('T')[0];
        })() }
      ];

      for (const test of tests) {
        const utterance = `I need an appointment ${test.input}`;
        const entities = await service.extractEntities(utterance, IntentCategory.APPOINTMENT);
        const dateEntity = entities.find(e => e.type === EntityType.DATE);
        expect(dateEntity?.normalizedValue).toBe(test.expected);
      }
    });

    it('should normalize times to 24-hour format', async () => {
      const tests = [
        { input: 'morning', expected: '09:00' },
        { input: 'afternoon', expected: '14:00' },
        { input: 'evening', expected: '18:00' },
        { input: 'noon', expected: '12:00' }
      ];

      for (const test of tests) {
        const utterance = `Can I come in the ${test.input}?`;
        const entities = await service.extractEntities(utterance, IntentCategory.APPOINTMENT);
        const timeEntity = entities.find(e => e.type === EntityType.TIME);
        expect(timeEntity?.normalizedValue).toBe(test.expected);
      }
    });

    it('should normalize insurance carrier names', async () => {
      const tests = [
        { input: 'medicare', expected: 'Medicare' },
        { input: 'vsp', expected: 'VSP' },
        { input: 'blue cross', expected: 'Blue Cross Blue Shield' }
      ];

      for (const test of tests) {
        const utterance = `Do you take ${test.input}?`;
        const entities = await service.extractEntities(utterance, IntentCategory.INSURANCE);
        const insuranceEntity = entities.find(e => e.type === EntityType.INSURANCE_CARRIER);
        expect(insuranceEntity?.normalizedValue).toBe(test.expected);
      }
    });
  });
});