import { LearningModuleService } from '../services/learningModuleService';

describe('LearningModuleService', () => {
  let service: LearningModuleService;

  beforeEach(() => {
    service = new LearningModuleService();
  });

  describe('getAllModules', () => {
    it('should return all learning modules', async () => {
      const result = await service.getAllModules();

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data!.length).toBeGreaterThan(0);

      // Check that default modules are loaded
      const moduleIds = result.data!.map(m => m.id);
      expect(moduleIds).toContain('ai-fundamentals');
      expect(moduleIds).toContain('dashboard-navigation');
      expect(moduleIds).toContain('escalation-handling');
    });
  });

  describe('getModuleById', () => {
    it('should return specific module when found', async () => {
      const result = await service.getModuleById('ai-fundamentals');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe('ai-fundamentals');
      expect(result.data!.title).toBe('AI System Fundamentals');
    });

    it('should return error when module not found', async () => {
      const result = await service.getModuleById('non-existent-module');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('MODULE_NOT_FOUND');
    });
  });

  describe('getModulesByDifficulty', () => {
    it('should return modules filtered by difficulty', async () => {
      const result = await service.getModulesByDifficulty('beginner');

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);

      // All returned modules should be beginner level
      result.data!.forEach(module => {
        expect(module.difficulty).toBe('beginner');
      });
    });

    it('should return empty array for difficulty with no modules', async () => {
      const result = await service.getModulesByDifficulty('advanced');

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
    });
  });

  describe('createModule', () => {
    it('should create new module with valid data', async () => {
      const moduleData = {
        title: 'Test Module',
        description: 'Test description',
        duration: 60,
        difficulty: 'beginner' as const,
        objectives: ['Test objective'],
        content: {
          sections: [{
            title: 'Test Section',
            type: 'text' as const,
            content: 'Test content'
          }]
        }
      };

      const result = await service.createModule(moduleData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.title).toBe('Test Module');
      expect(result.data!.id).toBeDefined();
      expect(result.data!.createdAt).toBeDefined();
    });

    it('should return error with invalid data', async () => {
      const invalidData = {
        title: '', // Invalid: empty title
        duration: -1, // Invalid: negative duration
      };

      const result = await service.createModule(invalidData as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Invalid module data');
    });
  });

  describe('updateModule', () => {
    it('should update existing module', async () => {
      const updates = {
        title: 'Updated Title',
        description: 'Updated description'
      };

      const result = await service.updateModule('ai-fundamentals', updates);

      expect(result.success).toBe(true);
      expect(result.data!.title).toBe('Updated Title');
      expect(result.data!.description).toBe('Updated description');
      expect(result.data!.updatedAt).toBeDefined();
    });

    it('should return error for non-existent module', async () => {
      const result = await service.updateModule('non-existent', { title: 'New Title' });

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('MODULE_NOT_FOUND');
    });
  });

  describe('deleteModule', () => {
    it('should delete existing module', async () => {
      // First create a module to delete
      const createResult = await service.createModule({
        title: 'Module to Delete',
        description: 'Will be deleted',
        duration: 30,
        difficulty: 'beginner',
        objectives: ['Test'],
        content: { sections: [] }
      });

      expect(createResult.success).toBe(true);
      const moduleId = createResult.data!.id;

      // Now delete it
      const deleteResult = await service.deleteModule(moduleId);
      expect(deleteResult.success).toBe(true);

      // Verify it's gone
      const getResult = await service.getModuleById(moduleId);
      expect(getResult.success).toBe(false);
    });

    it('should return error for non-existent module', async () => {
      const result = await service.deleteModule('non-existent');

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('MODULE_NOT_FOUND');
    });
  });
});