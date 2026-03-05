import { MetricsService } from '../../observability/metrics.service';
import type { Execution } from '../entities/execution.entity';
import type {
  GitCheckCommandResult,
  GitPublicationClient,
} from '../interfaces/git-publication-client.interface';
import { CheckPresetRegistryService } from './check-preset-registry.service';
import { ExecutionPreCommitChecksService } from './execution-pre-commit-checks.service';
import { PreCommitCheckProfileResolver } from './pre-commit-check-profile.resolver';
import type { ResolvedPreCommitProfile } from './pre-commit-check-profile.types';
import { ComposeServiceCheckRunner } from './runners/compose-service-check.runner';

describe('ExecutionPreCommitChecksService', () => {
  const buildExecution = (): Execution =>
    ({
      id: 'execution-1',
      userId: 'user-1',
      repositoryId: 'repo-1',
      publishPullRequest: true,
      requireCodeChanges: true,
      implementationAttempts: 1,
      idempotencyKey: null,
      requestHash: null,
      orchestrationState: 'finalizing',
      taskId: 'task-1',
      taskExternalId: 'TASK-1',
      taskTitle: 'Implement feature',
      taskDescription: null,
      taskSource: 'manual',
      action: 'feature',
      prompt: 'prompt',
      status: 'completed',
      automationStatus: 'publishing',
      automationAttempts: 0,
      branchName: null,
      commitSha: null,
      pullRequestNumber: null,
      pullRequestUrl: null,
      pullRequestTitle: null,
      automationErrorMessage: null,
      automationCompletedAt: null,
      output: '',
      outputTruncated: false,
      pid: null,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      repository: {
        id: 'repo-1',
        userId: 'user-1',
        fullName: 'owner/repo',
        cloneUrl: 'https://github.com/owner/repo.git',
        defaultBranch: 'main',
        localPath: '/tmp/repo',
        isCloned: true,
        preCommitChecksOverride: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }) as Execution;

  const createService = (resolvedProfile: ResolvedPreCommitProfile) => {
    const profileResolver = {
      resolve: jest.fn().mockResolvedValue(resolvedProfile),
    } as unknown as jest.Mocked<PreCommitCheckProfileResolver>;

    const presetRegistry = {
      resolveLanguage: jest.fn().mockResolvedValue('php'),
      getCommand: jest.fn((_, preset: string) => `command-${preset}`),
    } as unknown as jest.Mocked<CheckPresetRegistryService>;

    const composeServiceCheckRunner = {
      run: jest.fn(),
    } as unknown as jest.Mocked<ComposeServiceCheckRunner>;

    const metricsService = {
      incrementExecutionPreCommitChecks: jest.fn(),
      observeExecutionPreCommitChecksDuration: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;

    const gitPublicationClient = {
      runCheckCommand: jest.fn(),
    } as unknown as jest.Mocked<GitPublicationClient>;

    const service = new ExecutionPreCommitChecksService(
      profileResolver,
      presetRegistry,
      composeServiceCheckRunner,
      metricsService,
      gitPublicationClient,
    );

    return {
      service,
      composeServiceCheckRunner,
      metricsService,
      gitPublicationClient,
    };
  };

  it('returns skipped when no profile applies', async () => {
    const { service, metricsService } = createService({
      source: 'none',
      profile: null,
      legacyCommand: null,
    });

    const result = await service.runForExecution(buildExecution());

    expect(result.status).toBe('skipped');
    expect(
      metricsService.incrementExecutionPreCommitChecks,
    ).toHaveBeenCalledWith('skipped');
  });

  it('runs legacy command in block mode', async () => {
    const { service, gitPublicationClient } = createService({
      source: 'legacy_env',
      profile: null,
      legacyCommand: 'npm run format:check',
    });
    (gitPublicationClient.runCheckCommand as jest.Mock).mockResolvedValue({
      success: false,
      stdout: '',
      stderr: 'failed',
    } satisfies GitCheckCommandResult);

    const result = await service.runForExecution(buildExecution());

    expect(result.status).toBe('failed');
    expect(result.mode).toBe('block');
    expect(result.failureReason).toContain('failed');
  });

  it('returns failed in warn mode when profile step fails', async () => {
    const { service, composeServiceCheckRunner } = createService({
      source: 'repository',
      profile: {
        enabled: true,
        mode: 'warn',
        runner: {
          type: 'compose_service',
          service: 'app',
        },
        steps: [
          { preset: 'format', enabled: true },
          { preset: 'test', enabled: true },
        ],
      },
      legacyCommand: null,
    });
    (composeServiceCheckRunner.run as jest.Mock).mockResolvedValueOnce({
      success: false,
      stdout: '',
      stderr: 'format failed',
    } satisfies GitCheckCommandResult);

    const result = await service.runForExecution(buildExecution());

    expect(result.status).toBe('failed');
    expect(result.mode).toBe('warn');
    expect(result.stepResults).toHaveLength(1);
  });

  it('returns passed when enabled profile steps pass', async () => {
    const { service, composeServiceCheckRunner } = createService({
      source: 'repository',
      profile: {
        enabled: true,
        mode: 'warn',
        runner: {
          type: 'compose_service',
          service: 'app',
        },
        steps: [{ preset: 'test', enabled: true }],
      },
      legacyCommand: null,
    });
    (composeServiceCheckRunner.run as jest.Mock).mockResolvedValue({
      success: true,
      stdout: 'ok',
      stderr: '',
    } satisfies GitCheckCommandResult);

    const result = await service.runForExecution(buildExecution());

    expect(result.status).toBe('passed');
    expect(result.mode).toBe('warn');
    expect(result.stepResults).toHaveLength(1);
  });
});
