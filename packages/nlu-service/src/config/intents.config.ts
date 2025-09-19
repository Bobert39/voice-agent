/**
 * Intent Configuration for Optometry Practice
 * Healthcare-specific intent patterns and training data
 */

import { IntentCategory, EntityType, IntentTrainingData } from '../types';

export const INTENT_TRAINING_DATA: IntentTrainingData[] = [
  {
    category: IntentCategory.APPOINTMENT,
    examples: [
      'I need to schedule an appointment',
      'Can I book an eye exam',
      'What times are available this week',
      'I need to reschedule my appointment',
      'Cancel my appointment tomorrow',
      'Do you have any openings today',
      'When is my next appointment',
      'I\'d like to see Dr. Smith next week',
      'Can I come in for an emergency',
      'My vision is blurry, when can I come in'
    ],
    entities: [EntityType.DATE, EntityType.TIME, EntityType.PROVIDER],
    confidenceThreshold: 0.75
  },
  {
    category: IntentCategory.PRACTICE_INFO,
    examples: [
      'What are your hours',
      'Are you open on Saturday',
      'Where are you located',
      'Do you have parking',
      'How do I get to your office',
      'What\'s your address',
      'Are you closed for lunch',
      'Do you see children',
      'What services do you offer',
      'Do you do contact lens fittings'
    ],
    entities: [EntityType.LOCATION, EntityType.TIME],
    confidenceThreshold: 0.7
  },
  {
    category: IntentCategory.INSURANCE,
    examples: [
      'Do you accept Medicare',
      'Is VSP insurance accepted',
      'What insurance plans do you take',
      'How much is an eye exam without insurance',
      'Do I need a referral',
      'Is my insurance active',
      'What\'s my copay',
      'Do you bill insurance directly',
      'Is vision therapy covered',
      'What about Medicaid'
    ],
    entities: [EntityType.INSURANCE_CARRIER],
    confidenceThreshold: 0.75
  },
  {
    category: IntentCategory.PRESCRIPTION,
    examples: [
      'I need a prescription refill',
      'Can you refill my eye drops',
      'I\'m out of my glaucoma medication',
      'When can I order new contacts',
      'My prescription expired',
      'Can you send my prescription to the pharmacy',
      'I need my prescription for glasses',
      'What\'s my current prescription',
      'Can I get a copy of my prescription',
      'How long is my prescription valid'
    ],
    entities: [EntityType.MEDICATION],
    confidenceThreshold: 0.8
  },
  {
    category: IntentCategory.EMERGENCY,
    examples: [
      'I have something in my eye',
      'My eye is red and painful',
      'I think I have an eye infection',
      'I can\'t see suddenly',
      'There\'s a curtain over my vision',
      'I\'m seeing flashing lights',
      'My contact lens is stuck',
      'I got chemicals in my eye',
      'My eye is swollen shut',
      'I have severe eye pain'
    ],
    entities: [EntityType.CONDITION],
    confidenceThreshold: 0.7
  },
  {
    category: IntentCategory.GENERAL,
    examples: [
      'I have a question',
      'Can you help me',
      'I need to speak to someone',
      'Thank you',
      'Goodbye',
      'Hello',
      'What can you do',
      'I don\'t understand',
      'Can you repeat that',
      'I need help'
    ],
    entities: [],
    confidenceThreshold: 0.6
  }
];

// Common speech pattern variations for better recognition
export const SPEECH_PATTERNS = {
  commonPauses: ['um', 'uh', 'let me think', 'what\'s it called', 'you know'],
  clarificationRequests: ['again', 'what did you say', 'can you repeat', 'I didn\'t catch that'],
  termSimplifications: {
    'ophthalmologist': ['eye doctor', 'doctor'],
    'optometrist': ['eye doctor', 'vision doctor'],
    'prescription': ['medicine', 'eye drops', 'medication'],
    'appointment': ['visit', 'see the doctor', 'come in'],
    'insurance': ['coverage', 'plan', 'Medicare']
  }
};

// Confidence thresholds for different scenarios
export const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.6,
  low: 0.6,
  escalation: 0.5,
  emergency: 0.7
};

// Entity patterns for extraction
export const ENTITY_PATTERNS = {
  [EntityType.DATE]: {
    patterns: [
      /\b(today|tomorrow|yesterday)\b/i,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b(next|this|last)\s+(week|month|year)\b/i,
      /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i
    ]
  },
  [EntityType.TIME]: {
    patterns: [
      /\b\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)?\b/,
      /\b(morning|afternoon|evening|night)\b/i,
      /\b(noon|midnight)\b/i,
      /\b(early|late)\s+(morning|afternoon|evening)\b/i
    ]
  },
  [EntityType.PROVIDER]: {
    patterns: [
      /\bdr\.?\s+\w+/i,
      /\bdoctor\s+\w+/i,
      /\b(smith|jones|williams|brown|davis|miller|wilson|moore|taylor|anderson)\b/i
    ]
  },
  [EntityType.INSURANCE_CARRIER]: {
    patterns: [
      /\b(medicare|medicaid)\b/i,
      /\b(vsp|eyemed|davis vision|spectera)\b/i,
      /\b(blue cross|blue shield|aetna|cigna|humana|united)\b/i,
      /\b(tricare|va benefits)\b/i
    ]
  },
  [EntityType.PHONE_NUMBER]: {
    patterns: [
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
      /\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/
    ]
  }
};

// Escalation triggers
export const ESCALATION_TRIGGERS = {
  keywords: [
    'emergency', 'urgent', 'pain', 'can\'t see', 'blind',
    'lawyer', 'complaint', 'sue', 'manager', 'supervisor',
    'angry', 'upset', 'frustrated'
  ],
  lowConfidenceCount: 3, // Escalate after 3 low confidence responses
  maxRetries: 3
};