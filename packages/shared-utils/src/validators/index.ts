import { z } from 'zod';

// Common validation schemas
export const healthCheckSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string(),
  service: z.string(),
  version: z.string(),
  uptime: z.number()
});

export const portSchema = z.number().int().min(1).max(65535);

export const environmentSchema = z.enum(['development', 'test', 'staging', 'production']);

// Utility function to validate environment variables
export const validateEnv = <T>(schema: z.ZodSchema<T>, env: Record<string, string | undefined>): T => {
  const result = schema.safeParse(env);
  
  if (!result.success) {
    throw new Error(`Environment validation failed: ${result.error.message}`);
  }
  
  return result.data;
};