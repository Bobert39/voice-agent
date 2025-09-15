// Natural Language Understanding (NLU) services for Capitol Eye Care
// GPT-4 powered intent recognition and conversation analysis

export { IntentRecognitionService } from './intentRecognitionService';
export { NaturalLanguageService } from './naturalLanguageService';
export { NLUServiceFactory } from './nluServiceFactory';

export type {
  IntentResult,
  ExtractedEntity,
  IntentContext
} from './intentRecognitionService';

export type {
  NLUResult,
  ConversationContext
} from './naturalLanguageService';