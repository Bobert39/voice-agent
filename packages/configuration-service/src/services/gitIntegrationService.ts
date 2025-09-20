import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export interface GitCommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
  files: string[];
}

export interface GitDiffResult {
  file: string;
  changes: string;
  insertions: number;
  deletions: number;
}

export class GitIntegrationService {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  /**
   * Initialize Git repository for configuration versioning
   */
  public async initializeRepository(): Promise<void> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        await this.git.init();
        logger.info('Git repository initialized for configuration versioning');
      }

      // Create configuration directory if it doesn't exist
      const configDir = path.join(this.repoPath, 'config-versions');
      try {
        await fs.access(configDir);
      } catch {
        await fs.mkdir(configDir, { recursive: true });
        logger.info('Configuration versions directory created');
      }

      // Create initial .gitignore if it doesn't exist
      const gitignorePath = path.join(this.repoPath, '.gitignore');
      try {
        await fs.access(gitignorePath);
      } catch {
        const gitignoreContent = `
# Configuration service files
node_modules/
dist/
.env
*.log
.DS_Store

# Keep configuration versions
!config-versions/
config-versions/temp/
`;
        await fs.writeFile(gitignorePath, gitignoreContent.trim());
        logger.info('.gitignore file created');
      }
    } catch (error) {
      logger.error('Error initializing Git repository:', error);
      throw error;
    }
  }

  /**
   * Save configuration to version control
   */
  public async saveConfigurationVersion(
    configType: string,
    configId: number,
    configData: any,
    practiceId: string,
    userId: string,
    changeReason?: string
  ): Promise<string> {
    try {
      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${configType}-${configId}-${timestamp}.json`;
      const filePath = path.join('config-versions', practiceId, filename);
      const fullPath = path.join(this.repoPath, filePath);

      // Ensure directory exists
      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });

      // Create configuration snapshot
      const configSnapshot = {
        metadata: {
          configType,
          configId,
          practiceId,
          userId,
          timestamp: new Date().toISOString(),
          changeReason: changeReason || 'Configuration update',
        },
        configuration: configData,
      };

      // Write configuration file
      await fs.writeFile(fullPath, JSON.stringify(configSnapshot, null, 2));

      // Add to git and commit
      await this.git.add(filePath);
      const commitMessage = `${configType} configuration update (ID: ${configId})

Practice: ${practiceId}
User: ${userId}
${changeReason ? `Reason: ${changeReason}` : ''}`;

      const commitResult = await this.git.commit(commitMessage);

      logger.info('Configuration version saved to Git:', {
        configType,
        configId,
        practiceId,
        commitHash: commitResult.commit,
      });

      return commitResult.commit;
    } catch (error) {
      logger.error('Error saving configuration version to Git:', error);
      throw error;
    }
  }

  /**
   * Get configuration version history
   */
  public async getConfigurationHistory(
    configType: string,
    configId?: number,
    practiceId?: string,
    limit: number = 50
  ): Promise<GitCommitInfo[]> {
    try {
      let pathPattern = 'config-versions/';

      if (practiceId) {
        pathPattern += `${practiceId}/`;
      }

      if (configType) {
        pathPattern += `${configType}`;
        if (configId) {
          pathPattern += `-${configId}`;
        }
        pathPattern += '*';
      }

      const log = await this.git.log({
        file: pathPattern,
        maxCount: limit,
      });

      return log.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
        files: commit.diff?.files?.map(f => f.file) || [],
      }));
    } catch (error) {
      logger.error('Error getting configuration history:', error);
      throw error;
    }
  }

  /**
   * Get configuration at specific version
   */
  public async getConfigurationAtVersion(
    commitHash: string,
    configType: string,
    configId: number,
    practiceId: string
  ): Promise<any | null> {
    try {
      // Find the configuration file in the commit
      const files = await this.git.show([`${commitHash}:config-versions/${practiceId}/`]);
      const pattern = new RegExp(`${configType}-${configId}-.*\\.json`);

      // This is a simplified approach - in production, you'd need to list files in the commit
      // and find the matching configuration file
      const configFile = `${configType}-${configId}`;

      try {
        const fileContent = await this.git.show([`${commitHash}:config-versions/${practiceId}/${configFile}`]);
        const configSnapshot = JSON.parse(fileContent);
        return configSnapshot.configuration;
      } catch (showError) {
        logger.warn('Configuration file not found at specified version:', {
          commitHash,
          configType,
          configId,
          practiceId,
        });
        return null;
      }
    } catch (error) {
      logger.error('Error getting configuration at version:', error);
      throw error;
    }
  }

  /**
   * Compare configurations between versions
   */
  public async compareConfigurationVersions(
    fromCommit: string,
    toCommit: string,
    configType: string,
    configId: number,
    practiceId: string
  ): Promise<GitDiffResult[]> {
    try {
      const pathPattern = `config-versions/${practiceId}/${configType}-${configId}*`;

      const diff = await this.git.diff([`${fromCommit}..${toCommit}`, '--', pathPattern]);

      // Parse diff output (simplified - in production, use a proper diff parser)
      const diffResults: GitDiffResult[] = [];

      if (diff) {
        const lines = diff.split('\n');
        let currentFile = '';
        let changes = '';
        let insertions = 0;
        let deletions = 0;

        for (const line of lines) {
          if (line.startsWith('diff --git')) {
            if (currentFile) {
              diffResults.push({
                file: currentFile,
                changes,
                insertions,
                deletions,
              });
            }
            currentFile = line.split(' ').pop() || '';
            changes = '';
            insertions = 0;
            deletions = 0;
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            insertions++;
            changes += line + '\n';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
            changes += line + '\n';
          } else {
            changes += line + '\n';
          }
        }

        if (currentFile) {
          diffResults.push({
            file: currentFile,
            changes,
            insertions,
            deletions,
          });
        }
      }

      return diffResults;
    } catch (error) {
      logger.error('Error comparing configuration versions:', error);
      throw error;
    }
  }

  /**
   * Create configuration branch for testing
   */
  public async createConfigurationBranch(
    branchName: string,
    baseBranch: string = 'main'
  ): Promise<void> {
    try {
      await this.git.checkoutBranch(branchName, baseBranch);
      logger.info('Configuration testing branch created:', { branchName, baseBranch });
    } catch (error) {
      logger.error('Error creating configuration branch:', error);
      throw error;
    }
  }

  /**
   * Merge configuration changes
   */
  public async mergeConfigurationBranch(
    branchName: string,
    targetBranch: string = 'main'
  ): Promise<void> {
    try {
      await this.git.checkout(targetBranch);
      await this.git.merge([branchName]);
      await this.git.deleteLocalBranch(branchName);

      logger.info('Configuration branch merged successfully:', {
        branchName,
        targetBranch,
      });
    } catch (error) {
      logger.error('Error merging configuration branch:', error);
      throw error;
    }
  }

  /**
   * Rollback configuration to previous version
   */
  public async rollbackConfiguration(
    commitHash: string,
    configType: string,
    configId: number,
    practiceId: string,
    userId: string,
    reason: string
  ): Promise<string> {
    try {
      // Get configuration at the specified version
      const configData = await this.getConfigurationAtVersion(
        commitHash,
        configType,
        configId,
        practiceId
      );

      if (!configData) {
        throw new Error('Configuration not found at specified version');
      }

      // Save as new version (rollback)
      const newCommitHash = await this.saveConfigurationVersion(
        configType,
        configId,
        configData,
        practiceId,
        userId,
        `Rollback to ${commitHash.substring(0, 8)}: ${reason}`
      );

      logger.info('Configuration rolled back successfully:', {
        configType,
        configId,
        practiceId,
        fromCommit: commitHash,
        newCommit: newCommitHash,
      });

      return newCommitHash;
    } catch (error) {
      logger.error('Error rolling back configuration:', error);
      throw error;
    }
  }

  /**
   * Export configuration history as backup
   */
  public async exportConfigurationHistory(
    practiceId: string,
    outputPath?: string
  ): Promise<string> {
    try {
      const exportPath = outputPath || path.join(this.repoPath, `config-backup-${practiceId}-${Date.now()}.json`);

      // Get all configuration history for the practice
      const history = await this.getConfigurationHistory('', undefined, practiceId, 1000);

      // Get current configurations
      const configFiles = await fs.readdir(
        path.join(this.repoPath, 'config-versions', practiceId),
        { withFileTypes: true }
      );

      const configurations: any = {};

      for (const file of configFiles) {
        if (file.isFile() && file.name.endsWith('.json')) {
          const filePath = path.join(this.repoPath, 'config-versions', practiceId, file.name);
          const content = await fs.readFile(filePath, 'utf-8');
          configurations[file.name] = JSON.parse(content);
        }
      }

      const exportData = {
        practiceId,
        exportedAt: new Date().toISOString(),
        history,
        configurations,
      };

      await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));

      logger.info('Configuration history exported:', {
        practiceId,
        exportPath,
        historyCount: history.length,
        configurationsCount: Object.keys(configurations).length,
      });

      return exportPath;
    } catch (error) {
      logger.error('Error exporting configuration history:', error);
      throw error;
    }
  }

  /**
   * Get repository status
   */
  public async getRepositoryStatus(): Promise<any> {
    try {
      const status = await this.git.status();
      const log = await this.git.log(['--oneline', '-10']);

      return {
        currentBranch: status.current,
        modified: status.modified,
        staged: status.staged,
        notAdded: status.not_added,
        conflicted: status.conflicted,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        recentCommits: log.all.map(commit => ({
          hash: commit.hash.substring(0, 8),
          message: commit.message,
          date: commit.date,
        })),
      };
    } catch (error) {
      logger.error('Error getting repository status:', error);
      throw error;
    }
  }
}

export default GitIntegrationService;