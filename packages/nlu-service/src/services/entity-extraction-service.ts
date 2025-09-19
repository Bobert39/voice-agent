/**
 * Entity Extraction Service
 * Extracts healthcare domain entities from utterances
 */

import {
  ExtractedEntity,
  EntityType,
  IntentCategory
} from '../types';
import { ENTITY_PATTERNS } from '../config/intents.config';
import { logger } from '../utils/logger';

export class EntityExtractionService {
  /**
   * Extract entities from utterance based on intent category
   */
  async extractEntities(
    utterance: string,
    intentCategory: IntentCategory
  ): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = [];

    try {
      // Extract date entities
      entities.push(...this.extractDates(utterance));

      // Extract time entities
      entities.push(...this.extractTimes(utterance));

      // Extract provider names
      entities.push(...this.extractProviders(utterance));

      // Extract insurance carriers
      entities.push(...this.extractInsuranceCarriers(utterance));

      // Extract phone numbers
      entities.push(...this.extractPhoneNumbers(utterance));

      // Extract medical conditions (for emergency intents)
      if (intentCategory === IntentCategory.EMERGENCY) {
        entities.push(...this.extractMedicalConditions(utterance));
      }

      // Extract medications (for prescription intents)
      if (intentCategory === IntentCategory.PRESCRIPTION) {
        entities.push(...this.extractMedications(utterance));
      }

      // Remove duplicate entities
      return this.deduplicateEntities(entities);

    } catch (error) {
      logger.error('Entity extraction error', { error, utterance });
      return entities;
    }
  }

  /**
   * Extract date entities
   */
  private extractDates(utterance: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = ENTITY_PATTERNS[EntityType.DATE].patterns;

    for (const pattern of patterns) {
      const matches = utterance.match(pattern);
      if (matches) {
        matches.forEach(match => {
          entities.push({
            type: EntityType.DATE,
            value: match,
            normalizedValue: this.normalizeDate(match),
            confidence: 0.85,
            startPosition: utterance.indexOf(match),
            endPosition: utterance.indexOf(match) + match.length
          });
        });
      }
    }

    return entities;
  }

  /**
   * Extract time entities
   */
  private extractTimes(utterance: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = ENTITY_PATTERNS[EntityType.TIME].patterns;

    for (const pattern of patterns) {
      const matches = utterance.match(pattern);
      if (matches) {
        matches.forEach(match => {
          entities.push({
            type: EntityType.TIME,
            value: match,
            normalizedValue: this.normalizeTime(match),
            confidence: 0.8,
            startPosition: utterance.indexOf(match),
            endPosition: utterance.indexOf(match) + match.length
          });
        });
      }
    }

    return entities;
  }

  /**
   * Extract provider names
   */
  private extractProviders(utterance: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = ENTITY_PATTERNS[EntityType.PROVIDER].patterns;

    for (const pattern of patterns) {
      const matches = utterance.match(pattern);
      if (matches) {
        matches.forEach(match => {
          entities.push({
            type: EntityType.PROVIDER,
            value: match,
            normalizedValue: this.normalizeProviderName(match),
            confidence: 0.75,
            startPosition: utterance.indexOf(match),
            endPosition: utterance.indexOf(match) + match.length
          });
        });
      }
    }

    return entities;
  }

  /**
   * Extract insurance carrier names
   */
  private extractInsuranceCarriers(utterance: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = ENTITY_PATTERNS[EntityType.INSURANCE_CARRIER].patterns;

    for (const pattern of patterns) {
      const matches = utterance.match(pattern);
      if (matches) {
        matches.forEach(match => {
          entities.push({
            type: EntityType.INSURANCE_CARRIER,
            value: match,
            normalizedValue: this.normalizeInsuranceCarrier(match),
            confidence: 0.9,
            startPosition: utterance.indexOf(match),
            endPosition: utterance.indexOf(match) + match.length
          });
        });
      }
    }

    return entities;
  }

  /**
   * Extract phone numbers
   */
  private extractPhoneNumbers(utterance: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = ENTITY_PATTERNS[EntityType.PHONE_NUMBER].patterns;

    for (const pattern of patterns) {
      const matches = utterance.match(pattern);
      if (matches) {
        matches.forEach(match => {
          entities.push({
            type: EntityType.PHONE_NUMBER,
            value: match,
            normalizedValue: this.normalizePhoneNumber(match),
            confidence: 0.95,
            startPosition: utterance.indexOf(match),
            endPosition: utterance.indexOf(match) + match.length
          });
        });
      }
    }

    return entities;
  }

  /**
   * Extract medical conditions
   */
  private extractMedicalConditions(utterance: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Common eye conditions
    const conditions = [
      'glaucoma', 'cataracts', 'macular degeneration',
      'diabetic retinopathy', 'dry eye', 'conjunctivitis',
      'pink eye', 'stye', 'floaters', 'flashes',
      'blurry vision', 'double vision', 'eye pain',
      'red eye', 'swollen eye', 'itchy eyes'
    ];

    const lowerUtterance = utterance.toLowerCase();
    for (const condition of conditions) {
      if (lowerUtterance.includes(condition)) {
        const startPos = lowerUtterance.indexOf(condition);
        entities.push({
          type: EntityType.CONDITION,
          value: condition,
          normalizedValue: condition,
          confidence: 0.85,
          startPosition: startPos,
          endPosition: startPos + condition.length
        });
      }
    }

    return entities;
  }

  /**
   * Extract medications
   */
  private extractMedications(utterance: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Common eye medications
    const medications = [
      'timolol', 'latanoprost', 'brimonidine',
      'dorzolamide', 'travoprost', 'prednisolone',
      'artificial tears', 'eye drops', 'glaucoma medication',
      'antibiotic drops', 'steroid drops', 'lubricating drops'
    ];

    const lowerUtterance = utterance.toLowerCase();
    for (const medication of medications) {
      if (lowerUtterance.includes(medication)) {
        const startPos = lowerUtterance.indexOf(medication);
        entities.push({
          type: EntityType.MEDICATION,
          value: medication,
          normalizedValue: medication,
          confidence: 0.8,
          startPosition: startPos,
          endPosition: startPos + medication.length
        });
      }
    }

    return entities;
  }

  /**
   * Normalize date values
   */
  private normalizeDate(dateStr: string): string {
    const today = new Date();
    const lowerDate = dateStr.toLowerCase();

    if (lowerDate === 'today') {
      return today.toISOString().split('T')[0];
    } else if (lowerDate === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    } else if (lowerDate === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }

    // For other date formats, return as-is
    // In production, would use a date parsing library
    return dateStr;
  }

  /**
   * Normalize time values
   */
  private normalizeTime(timeStr: string): string {
    // Convert to 24-hour format
    const time = timeStr.toLowerCase();

    if (time === 'morning') return '09:00';
    if (time === 'afternoon') return '14:00';
    if (time === 'evening') return '18:00';
    if (time === 'noon') return '12:00';
    if (time === 'midnight') return '00:00';

    // For specific times, ensure consistent format
    const timeMatch = time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2] || '00';
      const meridiem = timeMatch[3];

      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      } else if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return `${hour.toString().padStart(2, '0')}:${minute}`;
    }

    return timeStr;
  }

  /**
   * Normalize provider names
   */
  private normalizeProviderName(name: string): string {
    // Remove common prefixes and standardize
    return name.replace(/^(dr\.?|doctor)\s+/i, 'Dr. ')
               .split(' ')
               .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
               .join(' ');
  }

  /**
   * Normalize insurance carrier names
   */
  private normalizeInsuranceCarrier(carrier: string): string {
    const normalizedCarriers: Record<string, string> = {
      'medicare': 'Medicare',
      'medicaid': 'Medicaid',
      'vsp': 'VSP',
      'eyemed': 'EyeMed',
      'davis vision': 'Davis Vision',
      'spectera': 'Spectera',
      'blue cross': 'Blue Cross Blue Shield',
      'blue shield': 'Blue Cross Blue Shield',
      'aetna': 'Aetna',
      'cigna': 'Cigna',
      'humana': 'Humana',
      'united': 'UnitedHealthcare',
      'tricare': 'TRICARE',
      'va benefits': 'VA Benefits'
    };

    const lower = carrier.toLowerCase();
    return normalizedCarriers[lower] || carrier;
  }

  /**
   * Normalize phone numbers
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    const numbers = phone.replace(/\D/g, '');

    // Format as XXX-XXX-XXXX
    if (numbers.length === 10) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`;
    }

    return phone;
  }

  /**
   * Remove duplicate entities
   */
  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Set<string>();
    const unique: ExtractedEntity[] = [];

    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalizedValue || entity.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entity);
      }
    }

    // Sort by position in utterance
    return unique.sort((a, b) => (a.startPosition || 0) - (b.startPosition || 0));
  }
}