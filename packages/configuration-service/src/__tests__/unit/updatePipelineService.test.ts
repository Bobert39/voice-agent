import { UpdatePipelineService } from '../../services/updatePipelineService';
import AWS from 'aws-sdk';
import axios from 'axios';

jest.mock('aws-sdk', () => {
  const mockCodePipeline = {
    createPipeline: jest.fn(),
    updatePipeline: jest.fn(),
    startPipelineExecution: jest.fn(),
    getPipelineExecution: jest.fn(),
    listPipelineExecutions: jest.fn(),
    stopPipelineExecution: jest.fn(),
  };

  const mockCodeDeploy = {
    createDeploymentGroup: jest.fn(),
    createDeployment: jest.fn(),
    getDeployment: jest.fn(),
    stopDeployment: jest.fn(),
    listDeployments: jest.fn(),
  };

  const mockECS = {
    updateService: jest.fn(),
    describeServices: jest.fn(),
    listTasks: jest.fn(),
    describeTasks: jest.fn(),
  };

  const mockCloudWatch = {
    putMetricData: jest.fn(),
    getMetricStatistics: jest.fn(),
  };

  return {
    CodePipeline: jest.fn(() => mockCodePipeline),
    CodeDeploy: jest.fn(() => mockCodeDeploy),
    ECS: jest.fn(() => mockECS),
    CloudWatch: jest.fn(() => mockCloudWatch),
  };
});

jest.mock('axios');

describe('UpdatePipelineService', () => {
  let service: UpdatePipelineService;
  let mockCodePipeline: any;
  let mockCodeDeploy: any;
  let mockECS: any;
  let mockCloudWatch: any;

  beforeEach(() => {
    mockCodePipeline = new AWS.CodePipeline();
    mockCodeDeploy = new AWS.CodeDeploy();
    mockECS = new AWS.ECS();
    mockCloudWatch = new AWS.CloudWatch();

    service = new UpdatePipelineService();
    jest.clearAllMocks();
  });

  describe('initializePipeline', () => {
    it('should initialize update pipeline successfully', async () => {
      mockCodePipeline.createPipeline.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipeline: {
            name: 'configuration-update-pipeline',
            version: 1
          }
        })
      });

      mockCodeDeploy.createDeploymentGroup.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          deploymentGroupId: 'dg-123'
        })
      });

      const result = await service.initializePipeline();

      expect(mockCodePipeline.createPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          pipeline: expect.objectContaining({
            name: 'configuration-update-pipeline',
            stages: expect.arrayContaining([
              expect.objectContaining({ name: 'Source' }),
              expect.objectContaining({ name: 'Build' }),
              expect.objectContaining({ name: 'Test' }),
              expect.objectContaining({ name: 'Stage' }),
              expect.objectContaining({ name: 'Production' })
            ])
          })
        })
      );

      expect(result).toHaveProperty('pipelineName', 'configuration-update-pipeline');
      expect(result).toHaveProperty('deploymentGroupId');
    });

    it('should handle pipeline initialization errors', async () => {
      mockCodePipeline.createPipeline.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Pipeline already exists'))
      });

      await expect(service.initializePipeline()).rejects.toThrow('Pipeline already exists');
    });
  });

  describe('deployUpdate', () => {
    const mockUpdate = {
      version: '1.2.3',
      components: ['configuration-service', 'admin-dashboard'],
      strategy: 'rolling' as const,
      rollbackOnFailure: true
    };

    it('should deploy update with rolling strategy', async () => {
      mockCodePipeline.startPipelineExecution.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecutionId: 'exec-123'
        })
      });

      mockCodePipeline.getPipelineExecution.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecution: {
            pipelineExecutionId: 'exec-123',
            status: 'Succeeded'
          }
        })
      });

      const result = await service.deployUpdate(mockUpdate);

      expect(mockCodePipeline.startPipelineExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          pipelineName: 'configuration-update-pipeline'
        })
      );

      expect(result).toHaveProperty('executionId', 'exec-123');
      expect(result).toHaveProperty('status', 'Succeeded');
      expect(result).toHaveProperty('strategy', 'rolling');
    });

    it('should deploy update with blue-green strategy', async () => {
      const blueGreenUpdate = {
        ...mockUpdate,
        strategy: 'blue-green' as const
      };

      mockECS.updateService.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          service: {
            serviceName: 'configuration-service',
            deployments: [
              { status: 'PRIMARY', desiredCount: 2, runningCount: 2 }
            ]
          }
        })
      });

      mockECS.describeServices.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          services: [{
            serviceName: 'configuration-service',
            desiredCount: 2,
            runningCount: 2,
            deployments: [
              { status: 'PRIMARY', desiredCount: 2, runningCount: 2 }
            ]
          }]
        })
      });

      const result = await service.deployUpdate(blueGreenUpdate);

      expect(mockECS.updateService).toHaveBeenCalled();
      expect(result).toHaveProperty('strategy', 'blue-green');
    });

    it('should handle deployment failures and rollback', async () => {
      mockCodePipeline.startPipelineExecution.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecutionId: 'exec-124'
        })
      });

      mockCodePipeline.getPipelineExecution.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecution: {
            pipelineExecutionId: 'exec-124',
            status: 'Failed'
          }
        })
      });

      // Mock rollback
      mockCodeDeploy.createDeployment.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          deploymentId: 'rollback-123'
        })
      });

      const result = await service.deployUpdate(mockUpdate);

      expect(result).toHaveProperty('status', 'Failed');
      expect(result).toHaveProperty('rollbackDeploymentId');
      expect(mockCodeDeploy.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentConfigName: 'CodeDeployDefault.AllAtOnceBlueGreen'
        })
      );
    });

    it('should skip rollback when disabled', async () => {
      const noRollbackUpdate = {
        ...mockUpdate,
        rollbackOnFailure: false
      };

      mockCodePipeline.startPipelineExecution.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecutionId: 'exec-125'
        })
      });

      mockCodePipeline.getPipelineExecution.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecution: {
            pipelineExecutionId: 'exec-125',
            status: 'Failed'
          }
        })
      });

      const result = await service.deployUpdate(noRollbackUpdate);

      expect(result).toHaveProperty('status', 'Failed');
      expect(result).not.toHaveProperty('rollbackDeploymentId');
      expect(mockCodeDeploy.createDeployment).not.toHaveBeenCalled();
    });
  });

  describe('performHealthCheck', () => {
    it('should perform successful health check', async () => {
      const mockHealthEndpoints = [
        'https://api.example.com/health',
        'https://admin.example.com/health'
      ];

      (axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: { status: 'healthy', version: '1.2.3' }
      });

      mockECS.describeTasks.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          tasks: [
            {
              taskArn: 'task-1',
              lastStatus: 'RUNNING',
              healthStatus: 'HEALTHY'
            },
            {
              taskArn: 'task-2',
              lastStatus: 'RUNNING',
              healthStatus: 'HEALTHY'
            }
          ]
        })
      });

      const result = await service.performHealthCheck(mockHealthEndpoints);

      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('healthy', true);
      expect(result.endpoints).toHaveLength(2);
      expect(result.endpoints[0]).toHaveProperty('status', 200);
    });

    it('should detect unhealthy services', async () => {
      const mockHealthEndpoints = ['https://api.example.com/health'];

      (axios.get as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await service.performHealthCheck(mockHealthEndpoints);

      expect(result).toHaveProperty('healthy', false);
      expect(result.endpoints[0]).toHaveProperty('status', 'error');
      expect(result.endpoints[0]).toHaveProperty('error', 'Connection refused');
    });

    it('should check ECS task health', async () => {
      mockECS.listTasks.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          taskArns: ['task-1', 'task-2']
        })
      });

      mockECS.describeTasks.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          tasks: [
            {
              taskArn: 'task-1',
              lastStatus: 'RUNNING',
              healthStatus: 'HEALTHY'
            },
            {
              taskArn: 'task-2',
              lastStatus: 'RUNNING',
              healthStatus: 'UNHEALTHY'
            }
          ]
        })
      });

      const result = await service.checkECSHealth('configuration-cluster', 'configuration-service');

      expect(mockECS.listTasks).toHaveBeenCalledWith({
        cluster: 'configuration-cluster',
        serviceName: 'configuration-service'
      });

      expect(result).toHaveProperty('healthy', false);
      expect(result).toHaveProperty('unhealthyTasks', 1);
    });
  });

  describe('rollbackDeployment', () => {
    it('should rollback deployment successfully', async () => {
      mockCodeDeploy.createDeployment.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          deploymentId: 'rollback-456'
        })
      });

      mockCodeDeploy.getDeployment.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          deploymentInfo: {
            deploymentId: 'rollback-456',
            status: 'Succeeded'
          }
        })
      });

      const result = await service.rollbackDeployment('exec-123', 'deploy-123');

      expect(mockCodeDeploy.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationName: 'configuration-app',
          deploymentGroupName: 'production'
        })
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('rollbackDeploymentId', 'rollback-456');
    });

    it('should handle rollback failures', async () => {
      mockCodeDeploy.createDeployment.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Rollback failed'))
      });

      await expect(
        service.rollbackDeployment('exec-123', 'deploy-123')
      ).rejects.toThrow('Rollback failed');
    });
  });

  describe('monitorDeployment', () => {
    it('should monitor deployment progress', async () => {
      mockCodePipeline.getPipelineExecution
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            pipelineExecution: {
              pipelineExecutionId: 'exec-123',
              status: 'InProgress'
            }
          })
        })
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            pipelineExecution: {
              pipelineExecutionId: 'exec-123',
              status: 'Succeeded'
            }
          })
        });

      const progress = [];
      await service.monitorDeployment('exec-123', (status) => {
        progress.push(status);
      });

      expect(progress).toContain('InProgress');
      expect(progress).toContain('Succeeded');
    });

    it('should timeout on long deployments', async () => {
      mockCodePipeline.getPipelineExecution.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecution: {
            pipelineExecutionId: 'exec-123',
            status: 'InProgress'
          }
        })
      });

      await expect(
        service.monitorDeployment('exec-123', () => {}, 100) // 100ms timeout
      ).rejects.toThrow('Deployment timeout');
    });
  });

  describe('getDeploymentHistory', () => {
    it('should retrieve deployment history', async () => {
      mockCodePipeline.listPipelineExecutions.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          pipelineExecutionSummaries: [
            {
              pipelineExecutionId: 'exec-123',
              status: 'Succeeded',
              startTime: new Date('2024-01-15T10:00:00Z'),
              lastUpdateTime: new Date('2024-01-15T10:15:00Z')
            },
            {
              pipelineExecutionId: 'exec-122',
              status: 'Failed',
              startTime: new Date('2024-01-14T10:00:00Z'),
              lastUpdateTime: new Date('2024-01-14T10:10:00Z')
            }
          ]
        })
      });

      const history = await service.getDeploymentHistory(10);

      expect(mockCodePipeline.listPipelineExecutions).toHaveBeenCalledWith({
        pipelineName: 'configuration-update-pipeline',
        maxResults: 10
      });

      expect(history).toHaveLength(2);
      expect(history[0]).toHaveProperty('executionId', 'exec-123');
      expect(history[0]).toHaveProperty('status', 'Succeeded');
      expect(history[0]).toHaveProperty('duration', 900000); // 15 minutes in ms
    });
  });

  describe('recordDeploymentMetrics', () => {
    it('should record deployment metrics', async () => {
      mockCloudWatch.putMetricData.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      });

      await service.recordDeploymentMetrics({
        executionId: 'exec-123',
        status: 'Succeeded',
        duration: 900000,
        componentsUpdated: 2
      });

      expect(mockCloudWatch.putMetricData).toHaveBeenCalledWith(
        expect.objectContaining({
          Namespace: 'ConfigurationUpdates',
          MetricData: expect.arrayContaining([
            expect.objectContaining({
              MetricName: 'DeploymentSuccess',
              Value: 1
            }),
            expect.objectContaining({
              MetricName: 'DeploymentDuration',
              Value: 900
            }),
            expect.objectContaining({
              MetricName: 'ComponentsUpdated',
              Value: 2
            })
          ])
        })
      );
    });
  });

  describe('validateDeployment', () => {
    it('should validate successful deployment', async () => {
      // Mock health checks
      (axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: { status: 'healthy', version: '1.2.3' }
      });

      // Mock metric checks
      mockCloudWatch.getMetricStatistics.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Datapoints: [
            { Average: 0.5 }, // Low error rate
            { Average: 200 }  // Good response time
          ]
        })
      });

      const result = await service.validateDeployment('1.2.3');

      expect(result).toHaveProperty('valid', true);
      expect(result).toHaveProperty('version', '1.2.3');
      expect(result.checks).toContain('health');
      expect(result.checks).toContain('metrics');
    });

    it('should detect invalid deployment', async () => {
      // Mock failing health check
      (axios.get as jest.Mock).mockRejectedValue(new Error('Service unavailable'));

      const result = await service.validateDeployment('1.2.3');

      expect(result).toHaveProperty('valid', false);
      expect(result.errors).toContain('Health check failed');
    });
  });
});