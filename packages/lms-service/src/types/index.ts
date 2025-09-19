import { z } from 'zod';

// Learning Module Types
export const LearningModuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  duration: z.number(), // minutes
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  prerequisites: z.array(z.string()).optional(),
  objectives: z.array(z.string()),
  content: z.object({
    sections: z.array(z.object({
      title: z.string(),
      type: z.enum(['video', 'text', 'interactive', 'quiz', 'simulation']),
      content: z.any(),
      duration: z.number().optional()
    }))
  }),
  assessment: z.object({
    questions: z.array(z.any()),
    passingScore: z.number(),
    timeLimit: z.number().optional()
  }).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type LearningModule = z.infer<typeof LearningModuleSchema>;

// Training Scenario Types
export const TrainingScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['call_handling', 'dashboard_usage', 'escalation', 'troubleshooting']),
  difficulty: z.number().min(1).max(5),
  timeLimit: z.number(), // seconds
  context: z.object({
    patientProfile: z.any().optional(),
    conversationHistory: z.array(z.object({
      speaker: z.string(),
      text: z.string(),
      timestamp: z.date().optional()
    })).optional(),
    escalationReason: z.string().optional(),
    aiRecommendation: z.string().optional(),
    systemState: z.any().optional()
  }),
  objectives: z.array(z.string()),
  tasks: z.array(z.object({
    description: z.string(),
    requiredActions: z.array(z.any()),
    optionalActions: z.array(z.any()).optional(),
    forbiddenActions: z.array(z.any()).optional(),
    timeTarget: z.number()
  })),
  evaluation: z.array(z.object({
    criterion: z.string(),
    weight: z.number(),
    measure: z.any()
  })),
  hints: z.array(z.object({
    triggerTime: z.number(),
    message: z.string(),
    penalty: z.number()
  })).optional()
});

export type TrainingScenario = z.infer<typeof TrainingScenarioSchema>;

// User Progress Types
export const UserProgressSchema = z.object({
  userId: z.string(),
  moduleId: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'certified']),
  progress: z.number().min(0).max(100),
  score: z.number().optional(),
  completedAt: z.date().optional(),
  certificateId: z.string().optional(),
  timeSpent: z.number(), // minutes
  attempts: z.number().default(0),
  lastAccessed: z.date().optional()
});

export type UserProgress = z.infer<typeof UserProgressSchema>;

// Assessment Types
export const AssessmentQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['multiple_choice', 'scenario_based', 'video_response', 'practical']),
  question: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]),
  explanation: z.string(),
  competencyArea: z.string(),
  points: z.number().default(1)
});

export type AssessmentQuestion = z.infer<typeof AssessmentQuestionSchema>;

export const AssessmentResultSchema = z.object({
  userId: z.string(),
  moduleId: z.string(),
  assessmentId: z.string(),
  score: z.number(),
  maxScore: z.number(),
  passed: z.boolean(),
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.union([z.string(), z.array(z.string())]),
    correct: z.boolean(),
    points: z.number()
  })),
  timeSpent: z.number(), // seconds
  completedAt: z.date(),
  feedback: z.string().optional()
});

export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;

// Certificate Types
export const CertificateSchema = z.object({
  id: z.string(),
  userId: z.string(),
  moduleId: z.string(),
  certificateName: z.string(),
  issuedAt: z.date(),
  expiresAt: z.date().optional(),
  validityDays: z.number().default(365),
  verificationCode: z.string(),
  status: z.enum(['active', 'expired', 'revoked'])
});

export type Certificate = z.infer<typeof CertificateSchema>;

// Feedback Types
export const FeedbackSchema = z.object({
  id: z.string(),
  category: z.enum(['bug', 'suggestion', 'training_gap', 'praise']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  context: z.object({
    moduleId: z.string().optional(),
    scenarioId: z.string().optional(),
    timestamp: z.date().optional(),
    screenshot: z.string().optional(),
    affectedFeature: z.string().optional()
  }).optional(),
  submitter: z.object({
    staffId: z.string(),
    role: z.string(),
    experience: z.enum(['new', 'experienced', 'expert'])
  }),
  status: z.enum(['new', 'triaged', 'in_progress', 'resolved', 'closed']),
  assignee: z.string().optional(),
  resolution: z.string().optional(),
  responseTime: z.number().optional(), // hours
  createdAt: z.date(),
  updatedAt: z.date().optional()
});

export type Feedback = z.infer<typeof FeedbackSchema>;

// Quick Reference Types
export const QuickReferenceCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(['escalation', 'troubleshooting', 'features', 'compliance']),
  content: z.object({
    summary: z.string(),
    steps: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
    tips: z.array(z.string()).optional()
  }),
  printable: z.boolean().default(true),
  lastUpdated: z.date(),
  version: z.string()
});

export type QuickReferenceCard = z.infer<typeof QuickReferenceCardSchema>;

// Staff User Types
export const StaffUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['receptionist', 'nurse', 'technician', 'manager', 'admin']),
  department: z.string(),
  hireDate: z.date(),
  experience: z.enum(['new', 'experienced', 'expert']),
  requiredCertifications: z.array(z.string()),
  currentCertifications: z.array(z.string()),
  isActive: z.boolean().default(true),
  lastLogin: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date().optional()
});

export type StaffUser = z.infer<typeof StaffUserSchema>;

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Training Analytics Types
export interface TrainingAnalytics {
  completionRates: {
    overall: number;
    byModule: Record<string, number>;
    byRole: Record<string, number>;
  };
  averageScores: {
    overall: number;
    byModule: Record<string, number>;
    byRole: Record<string, number>;
  };
  timeToCompletion: {
    average: number;
    byModule: Record<string, number>;
  };
  certificationsIssued: {
    total: number;
    thisMonth: number;
    expiringSoon: number;
  };
  commonIssues: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
}

// Database Models (for Prisma-like ORM)
export interface LearningModuleRecord {
  id: string;
  title: string;
  description: string;
  duration: number;
  difficulty: string;
  prerequisites: string[];
  objectives: string[];
  content: any;
  assessment: any;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProgressRecord {
  id: string;
  userId: string;
  moduleId: string;
  status: string;
  progress: number;
  score?: number;
  completedAt?: Date;
  certificateId?: string;
  timeSpent: number;
  attempts: number;
  lastAccessed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CertificateRecord {
  id: string;
  userId: string;
  moduleId: string;
  certificateName: string;
  issuedAt: Date;
  expiresAt?: Date;
  validityDays: number;
  verificationCode: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}