import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Repository } from 'typeorm';
import { RedactionService } from '../common/security/redaction.service';
import { MetricsService } from '../observability/metrics.service';
import { SettingsService } from '../settings/settings.service';
import { Execution } from './entities/execution.entity';
import { ExecutionDispatchService } from './execution-dispatch.service';
import { ExecutionPublicationService } from './execution-publication.service';
import { ExecutionStreamHub } from './execution-stream.hub';
import type { GitPublicationClient } from './interfaces/git-publication-client.interface';
import type { GithubPullRequestsGateway } from './interfaces/github-pull-requests-gateway.interface';
import { BranchNameBuilder } from './publication/branch-name.builder';
import { ExecutionReportArtifactService } from './publication/execution-report-artifact.service';
import { PublicationContentResolver } from './publication/publication-content.resolver';
import { PullRequestTemplateResolver } from './publication/pull-request-template.resolver';
import { ExecutionPreCommitChecksService } from './pre-commit/execution-pre-commit-checks.service';

describe('ExecutionPublicationService', () => {
  const createExecution = (overrides: Partial<Execution> = {}): Execution =>
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
      taskDescription: 'Ship real changes',
      taskSource: 'manual',
      action: 'feature',
      executionRole: 'implementation',
      parentExecutionId: null,
      rootExecutionId: 'execution-1',
      reviewGateStatus: 'not_applicable',
      reviewPendingDecisionUntil: null,
      prompt: 'Original prompt',
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
      output: 'stdout',
      outputTruncated: false,
      pid: null,
      startedAt: new Date('2026-03-03T12:00:00.000Z'),
      finishedAt: new Date('2026-03-03T12:01:00.000Z'),
      exitCode: 0,
      errorMessage: null,
      createdAt: new Date('2026-03-03T12:00:00.000Z'),
      updatedAt: new Date('2026-03-03T12:01:00.000Z'),
      repository: {
        id: 'repo-1',
        userId: 'user-1',
        fullName: 'owner/repo',
        cloneUrl: 'https://github.com/owner/repo.git',
        defaultBranch: 'main',
        localPath: '/tmp/repo',
        isCloned: true,
        preCommitChecksOverride: null,
        createdAt: new Date('2026-03-03T12:00:00.000Z'),
        updatedAt: new Date('2026-03-03T12:00:00.000Z'),
      } as Execution['repository'],
      ...overrides,
    }) as Execution;

  const createService = () => {
    const executionRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Repository<Execution>>;

    const settingsService = {
      getGithubTokenForUserOrNull: jest.fn().mockResolvedValue('gh-token'),
    } as unknown as jest.Mocked<SettingsService>;

    const gitPublicationClient = {
      branchExistsRemote: jest.fn().mockResolvedValue(false),
      checkoutNewBranch: jest.fn().mockResolvedValue(undefined),
      hasChanges: jest.fn().mockResolvedValue(false),
      addAll: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      getHeadSha: jest.fn().mockResolvedValue('sha-1'),
      push: jest.fn().mockResolvedValue(undefined),
      runCheckCommand: jest
        .fn()
        .mockResolvedValue({ success: true, stdout: '', stderr: '' }),
      checkoutDefaultAndClean: jest.fn().mockResolvedValue(undefined),
      deleteLocalBranch: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<GitPublicationClient>;

    const githubPullRequestsGateway = {
      createPullRequest: jest.fn().mockResolvedValue({
        number: 1,
        url: 'https://github.com/owner/repo/pull/1',
        title: 'PR title',
      }),
    } as unknown as jest.Mocked<GithubPullRequestsGateway>;

    const streamHub = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<ExecutionStreamHub>;

    const branchNameBuilder = new BranchNameBuilder();

    const executionReportArtifactService = {
      writeReport: jest.fn().mockResolvedValue('.ai/executions/execution-1.md'),
    } as unknown as jest.Mocked<ExecutionReportArtifactService>;

    const pullRequestTemplateResolver = {
      resolve: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PullRequestTemplateResolver>;

    const publicationContentResolver = {
      resolve: jest.fn().mockReturnValue({
        commitMessage: 'commit message',
        pullRequestTitle: 'PR title',
        pullRequestBody: 'PR body',
      }),
    } as unknown as jest.Mocked<PublicationContentResolver>;

    const executionPreCommitChecksService = {
      runForExecution: jest.fn().mockResolvedValue({
        source: 'none',
        mode: 'warn',
        status: 'skipped',
        failureReason: null,
        stepResults: [],
        durationMs: 0,
      }),
    } as unknown as jest.Mocked<ExecutionPreCommitChecksService>;

    const redactionService = new RedactionService();

    const metricsService = {
      incrementExecutionPublicationFailed: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;

    const configService = {
      get: jest.fn((_: string, defaultValue?: string) => defaultValue),
    } as unknown as jest.Mocked<ConfigService>;

    const executionDispatchService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ExecutionDispatchService>;

    const moduleRef = {
      get: jest.fn().mockReturnValue(executionDispatchService),
    } as unknown as jest.Mocked<ModuleRef>;

    const service = new ExecutionPublicationService(
      executionRepository,
      settingsService,
      gitPublicationClient,
      githubPullRequestsGateway,
      streamHub,
      branchNameBuilder,
      executionReportArtifactService,
      pullRequestTemplateResolver,
      publicationContentResolver,
      executionPreCommitChecksService,
      redactionService,
      metricsService,
      configService,
      moduleRef,
    );

    return {
      service,
      executionRepository,
      gitPublicationClient,
      streamHub,
      metricsService,
      executionDispatchService,
    };
  };

  it('requeues strict no-diff execution when retry budget remains', async () => {
    const {
      service,
      executionRepository,
      gitPublicationClient,
      streamHub,
      executionDispatchService,
    } = createService();
    executionRepository.findOne = jest
      .fn()
      .mockResolvedValue(createExecution({ implementationAttempts: 1 }));

    const result = await service.handleCompletedExecution('execution-1');

    expect(result).toEqual({ outcome: 'requeued' });
    expect(executionDispatchService.dispatch).toHaveBeenCalledWith(
      'execution-1',
    );
    expect(executionRepository.update).toHaveBeenCalledWith(
      { id: 'execution-1' },
      expect.objectContaining({
        implementationAttempts: 2,
        status: 'pending',
        orchestrationState: 'queued',
      }),
    );
    expect(streamHub.publish).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        payload: expect.objectContaining({
          message: 'No code diff detected, retrying implementation attempt 2/3',
        }),
      }),
      false,
    );
    expect(gitPublicationClient.commit).not.toHaveBeenCalled();
  });

  it('fails strict no-diff execution with no_changes after max attempts', async () => {
    const {
      service,
      executionRepository,
      streamHub,
      metricsService,
      executionDispatchService,
    } = createService();
    executionRepository.findOne = jest
      .fn()
      .mockResolvedValue(createExecution({ implementationAttempts: 3 }));

    const result = await service.handleCompletedExecution('execution-1');

    expect(result).toEqual({ outcome: 'failed_no_changes' });
    expect(executionDispatchService.dispatch).not.toHaveBeenCalled();
    expect(
      metricsService.incrementExecutionPublicationFailed,
    ).toHaveBeenCalled();
    expect(executionRepository.update).toHaveBeenCalledWith(
      { id: 'execution-1' },
      expect.objectContaining({
        status: 'failed',
        orchestrationState: 'failed',
        automationStatus: 'no_changes',
      }),
    );
    expect(streamHub.publish).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        payload: expect.objectContaining({
          automationStatus: 'no_changes',
          message: 'No code diff detected after 3 attempts; execution failed',
        }),
      }),
      false,
    );
  });
});
