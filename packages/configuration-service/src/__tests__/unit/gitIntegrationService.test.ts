import { GitIntegrationService } from '../../services/gitIntegrationService';
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';

jest.mock('simple-git');
jest.mock('fs/promises');

describe('GitIntegrationService', () => {
  let service: GitIntegrationService;
  let mockGit: any;
  const mockRepoPath = '/mock/repo/path';

  beforeEach(() => {
    mockGit = {
      checkIsRepo: jest.fn(),
      init: jest.fn(),
      add: jest.fn(),
      commit: jest.fn(),
      checkout: jest.fn(),
      checkoutBranch: jest.fn(),
      branch: jest.fn(),
      log: jest.fn(),
      diff: jest.fn(),
      status: jest.fn(),
      revparse: jest.fn(),
      show: jest.fn(),
      tag: jest.fn(),
      push: jest.fn(),
      pull: jest.fn(),
      merge: jest.fn(),
      reset: jest.fn(),
    };

    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    service = new GitIntegrationService(mockRepoPath);
    jest.clearAllMocks();
  });

  describe('initializeRepository', () => {
    it('should initialize git repository successfully', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false);
      mockGit.init.mockResolvedValue(undefined);

      await service.initializeRepository();

      expect(mockGit.checkIsRepo).toHaveBeenCalled();
      expect(mockGit.init).toHaveBeenCalled();
    });

    it('should skip initialization if repository already exists', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);

      await service.initializeRepository();

      expect(mockGit.checkIsRepo).toHaveBeenCalled();
      expect(mockGit.init).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockGit.checkIsRepo.mockRejectedValue(new Error('Failed to check repo'));

      await expect(service.initializeRepository()).rejects.toThrow('Failed to check repo');
    });
  });

  describe('saveConfigurationVersion', () => {
    const mockConfig = {
      type: 'practice_settings',
      data: {
        name: 'Test Practice',
        hours: '9-5'
      }
    };
    const mockMessage = 'Update practice settings';

    beforeEach(() => {
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    });

    it('should save configuration version successfully', async () => {
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue({
        commit: 'abc123',
        summary: { changes: 1, insertions: 10, deletions: 0 }
      });

      const result = await service.saveConfigurationVersion(
        mockConfig.type,
        mockConfig.data,
        mockMessage
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`${mockConfig.type}.json`),
        JSON.stringify(mockConfig.data, null, 2),
        'utf-8'
      );

      expect(mockGit.add).toHaveBeenCalled();
      expect(mockGit.commit).toHaveBeenCalledWith(mockMessage);

      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('message', mockMessage);
    });

    it('should handle commit failures', async () => {
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockRejectedValue(new Error('Commit failed'));

      await expect(
        service.saveConfigurationVersion(mockConfig.type, mockConfig.data, mockMessage)
      ).rejects.toThrow('Failed to save configuration version');
    });

    it('should validate configuration before committing', async () => {
      await expect(
        service.saveConfigurationVersion('', null as any, mockMessage)
      ).rejects.toThrow('Invalid configuration type or data');
    });
  });

  describe('getConfigurationHistory', () => {
    it('should retrieve configuration history', async () => {
      const mockLogs = {
        all: [
          {
            hash: 'abc123',
            date: '2024-01-15',
            message: 'Update practice settings',
            author_name: 'Test User',
            author_email: 'test@example.com'
          },
          {
            hash: 'def456',
            date: '2024-01-14',
            message: 'Initial configuration',
            author_name: 'Admin',
            author_email: 'admin@example.com'
          }
        ],
        latest: {
          hash: 'abc123',
          date: '2024-01-15',
          message: 'Update practice settings'
        }
      };

      mockGit.log.mockResolvedValue(mockLogs);

      const history = await service.getConfigurationHistory('practice_settings', 10);

      expect(mockGit.log).toHaveBeenCalledWith([
        '--follow',
        '--',
        expect.stringContaining('practice_settings.json')
      ]);

      expect(history).toHaveLength(2);
      expect(history[0]).toHaveProperty('hash', 'abc123');
      expect(history[0]).toHaveProperty('message', 'Update practice settings');
    });

    it('should handle empty history', async () => {
      mockGit.log.mockResolvedValue({ all: [], latest: null });

      const history = await service.getConfigurationHistory('practice_settings', 10);
      expect(history).toHaveLength(0);
    });

    it('should handle history retrieval errors', async () => {
      mockGit.log.mockRejectedValue(new Error('Failed to get history'));

      await expect(
        service.getConfigurationHistory('practice_settings', 10)
      ).rejects.toThrow('Failed to get configuration history');
    });
  });

  describe('getConfigurationAtVersion', () => {
    const mockCommitHash = 'abc123';
    const mockConfigType = 'practice_settings';

    it('should retrieve configuration at specific version', async () => {
      const mockContent = JSON.stringify({
        name: 'Test Practice',
        hours: '9-5'
      }, null, 2);

      mockGit.show.mockResolvedValue(mockContent);

      const result = await service.getConfigurationAtVersion(mockConfigType, mockCommitHash);

      expect(mockGit.show).toHaveBeenCalledWith([
        `${mockCommitHash}:configurations/${mockConfigType}.json`
      ]);

      expect(result).toHaveProperty('name', 'Test Practice');
      expect(result).toHaveProperty('hours', '9-5');
    });

    it('should handle retrieval errors', async () => {
      mockGit.show.mockRejectedValue(new Error('File not found'));

      await expect(
        service.getConfigurationAtVersion(mockConfigType, mockCommitHash)
      ).rejects.toThrow('Failed to get configuration at version');
    });
  });

  describe('compareConfigurationVersions', () => {
    it('should compare two configuration versions', async () => {
      const mockDiff = `
--- a/configurations/practice_settings.json
+++ b/configurations/practice_settings.json
@@ -1,5 +1,5 @@
 {
   "name": "Test Practice",
-  "hours": "9-5"
+  "hours": "8-6"
 }`;

      mockGit.diff.mockResolvedValue(mockDiff);

      const result = await service.compareConfigurationVersions(
        'practice_settings',
        'abc123',
        'def456'
      );

      expect(mockGit.diff).toHaveBeenCalledWith([
        'abc123',
        'def456',
        '--',
        expect.stringContaining('practice_settings.json')
      ]);

      expect(result).toHaveProperty('changes');
      expect(result.changes).toContain('hours');
    });

    it('should handle diff errors', async () => {
      mockGit.diff.mockRejectedValue(new Error('Failed to diff'));

      await expect(
        service.compareConfigurationVersions('practice_settings', 'abc123', 'def456')
      ).rejects.toThrow('Failed to compare configuration versions');
    });
  });

  describe('createConfigurationBranch', () => {
    it('should create a new configuration branch', async () => {
      mockGit.checkoutBranch.mockResolvedValue(undefined);

      await service.createConfigurationBranch('feature-update', 'main');

      expect(mockGit.checkoutBranch).toHaveBeenCalledWith(
        'feature-update',
        'main'
      );
    });

    it('should handle branch creation errors', async () => {
      mockGit.checkoutBranch.mockRejectedValue(new Error('Branch already exists'));

      await expect(
        service.createConfigurationBranch('existing-branch', 'main')
      ).rejects.toThrow('Failed to create configuration branch');
    });
  });

  describe('mergeConfigurationBranch', () => {
    it('should merge configuration branch successfully', async () => {
      mockGit.checkout.mockResolvedValue(undefined);
      mockGit.merge.mockResolvedValue({
        result: 'success',
        conflicts: []
      });

      const result = await service.mergeConfigurationBranch('feature-update', 'main');

      expect(mockGit.checkout).toHaveBeenCalledWith('main');
      expect(mockGit.merge).toHaveBeenCalledWith(['feature-update']);
      expect(result).toHaveProperty('success', true);
    });

    it('should handle merge conflicts', async () => {
      mockGit.checkout.mockResolvedValue(undefined);
      mockGit.merge.mockResolvedValue({
        result: 'conflict',
        conflicts: ['configurations/practice_settings.json']
      });

      const result = await service.mergeConfigurationBranch('feature-update', 'main');

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('conflicts');
    });

    it('should handle merge errors', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Failed to checkout'));

      await expect(
        service.mergeConfigurationBranch('feature-update', 'main')
      ).rejects.toThrow('Failed to merge configuration branch');
    });
  });

  describe('rollbackConfiguration', () => {
    it('should rollback configuration to previous commit', async () => {
      const mockPreviousContent = JSON.stringify({
        name: 'Old Practice',
        hours: '10-4'
      }, null, 2);

      mockGit.show.mockResolvedValue(mockPreviousContent);
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue({
        commit: 'rollback123',
        summary: { changes: 1, insertions: 5, deletions: 5 }
      });

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await service.rollbackConfiguration('practice_settings', 'abc123');

      expect(mockGit.show).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringContaining('Rollback')
      );

      expect(result).toHaveProperty('hash', 'rollback123');
    });

    it('should handle rollback errors', async () => {
      mockGit.show.mockRejectedValue(new Error('Commit not found'));

      await expect(
        service.rollbackConfiguration('practice_settings', 'invalid-hash')
      ).rejects.toThrow('Failed to rollback configuration');
    });
  });

  describe('getRepositoryStatus', () => {
    it('should get repository status', async () => {
      const mockStatus = {
        current: 'main',
        tracking: 'origin/main',
        modified: ['configurations/practice_settings.json'],
        not_added: [],
        deleted: [],
        created: [],
        conflicted: [],
        ahead: 2,
        behind: 0
      };

      mockGit.status.mockResolvedValue(mockStatus);

      const status = await service.getRepositoryStatus();

      expect(mockGit.status).toHaveBeenCalled();
      expect(status).toHaveProperty('current', 'main');
      expect(status).toHaveProperty('modified');
      expect(status.modified).toContain('configurations/practice_settings.json');
    });

    it('should handle status errors', async () => {
      mockGit.status.mockRejectedValue(new Error('Failed to get status'));

      await expect(service.getRepositoryStatus()).rejects.toThrow('Failed to get status');
    });
  });

  describe('exportConfigurationHistory', () => {
    it('should export configuration history to file', async () => {
      const mockLogs = {
        all: [
          {
            hash: 'abc123',
            date: '2024-01-15',
            message: 'Update practice settings',
            author_name: 'Test User'
          }
        ]
      };

      mockGit.log.mockResolvedValue(mockLogs);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const exportPath = '/export/history.json';
      await service.exportConfigurationHistory('practice_settings', exportPath);

      expect(mockGit.log).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        exportPath,
        expect.stringContaining('abc123'),
        'utf-8'
      );
    });

    it('should handle export errors', async () => {
      mockGit.log.mockResolvedValue({ all: [] });
      (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Cannot write file'));

      await expect(
        service.exportConfigurationHistory('practice_settings', '/invalid/path.json')
      ).rejects.toThrow('Failed to export configuration history');
    });
  });
});