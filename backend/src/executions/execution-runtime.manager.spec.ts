import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RedactionService } from '../common/security/redaction.service';
import { MetricsService } from '../observability/metrics.service';
import { Execution } from './entities/execution.entity';
import {
  CompletedPublicationResult,
  ExecutionPublicationService,
} from './execution-publication.service';
import { ExecutionReviewGateService } from './execution-review-gate.service';
import { ManualTaskAutomationStateService } from './manual-task-automation-state.service';
import { ExecutionRuntimeManager } from './execution-runtime.manager';
import { ExecutionStreamHub } from './execution-stream.hub';
import type { ClaudeCliRunner } from './interfaces/claude-cli-runner.interface';

describe('ExecutionRuntimeManager', () => {
  const createManager = (publicationResult: CompletedPublicationResult) => {
    const defaultExecution = {
      id: 'execution-1',
      executionRole: 'implementation',
      status: 'completed',
      reviewGateStatus: 'not_applicable',
      parentExecutionId: null,
    } as Partial<Execution>;

    const executionRepository = {
      update: jest.fn().mockResolvedValue(undefined),
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(defaultExecution)
        .mockResolvedValue(defaultExecution),
      findOne: jest.fn().mockResolvedValue({
        automationErrorMessage: 'Publication failed',
      }),
    } as unknown as jest.Mocked<Repository<Execution>>;

    const claudeCliRunner = {
      ensureAvailable: jest.fn().mockResolvedValue(undefined),
      start: jest.fn(),
    } as unknown as jest.Mocked<ClaudeCliRunner>;

    const streamHub = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<ExecutionStreamHub>;

    const publicationService = {
      handleCompletedExecution: jest.fn().mockResolvedValue(publicationResult),
    } as unknown as jest.Mocked<ExecutionPublicationService>;

    const executionReviewGateService = {
      handleImplementationCompletion: jest
        .fn()
        .mockResolvedValue({ action: 'continue_publication' }),
      handleReviewCompletion: jest.fn().mockResolvedValue({ action: 'none' }),
      handleRemediationCompletion: jest
        .fn()
        .mockResolvedValue({ action: 'none' }),
    } as unknown as jest.Mocked<ExecutionReviewGateService>;

    const metricsService = {
      incrementExecutionsStarted: jest.fn(),
      observeExecutionDuration: jest.fn(),
      incrementExecutionsTimeout: jest.fn(),
      incrementExecutionsCompleted: jest.fn(),
      incrementExecutionsFailed: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;

    const manualTaskAutomationStateService = {
      reconcileFromExecution: jest.fn(),
    } as unknown as jest.Mocked<ManualTaskAutomationStateService>;

    const configService = {
      get: jest.fn((_: string, defaultValue?: string) => defaultValue),
    } as unknown as jest.Mocked<ConfigService>;

    const manager = new ExecutionRuntimeManager(
      executionRepository,
      claudeCliRunner,
      streamHub,
      publicationService,
      executionReviewGateService,
      manualTaskAutomationStateService,
      new RedactionService(),
      metricsService,
      configService,
    );

    return {
      manager,
      executionRepository,
      streamHub,
      metricsService,
    };
  };

  // Tests seed `activeExecutions` directly via a cast to keep ExecutionRuntimeManager
  // production visibility unchanged; this pattern is unit-test-only helper usage.
  const seedActiveExecution = (manager: ExecutionRuntimeManager): void => {
    (
      manager as unknown as { activeExecutions: Map<string, unknown> }
    ).activeExecutions.set('execution-1', {
      process: { kill: jest.fn() },
      cancelRequested: false,
      timedOut: false,
      fatalErrorMessage: null,
      killTimeoutId: null,
      timeoutId: null,
      cancelSyncIntervalId: null,
      output: '',
      outputTruncated: false,
      writeQueue: Promise.resolve(),
      startedAtMs: Date.now() - 100,
    });
  };

  it('does not emit terminal event when publication requests requeue', async () => {
    const { manager, executionRepository, streamHub, metricsService } =
      createManager({ outcome: 'requeued' });
    seedActiveExecution(manager);

    await (
      manager as unknown as {
        handleExit: (
          executionId: string,
          exitCode: number | null,
        ) => Promise<void>;
      }
    ).handleExit('execution-1', 0);

    expect(metricsService.incrementExecutionsCompleted).not.toHaveBeenCalled();
    expect(metricsService.incrementExecutionsFailed).not.toHaveBeenCalled();
    expect(executionRepository.update).toHaveBeenCalledWith(
      { id: 'execution-1' },
      expect.objectContaining({
        status: 'completed',
        orchestrationState: 'finalizing',
      }),
    );
    expect(streamHub.publish).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        type: 'status',
        payload: expect.objectContaining({ status: 'pending' }),
      }),
      false,
    );
    expect(streamHub.publish).not.toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({ type: 'completed' }),
      true,
    );
  });

  it('emits terminal error and marks failed for failed_no_changes publication outcome', async () => {
    const { manager, executionRepository, streamHub, metricsService } =
      createManager({ outcome: 'failed_no_changes' });
    seedActiveExecution(manager);

    await (
      manager as unknown as {
        handleExit: (
          executionId: string,
          exitCode: number | null,
        ) => Promise<void>;
      }
    ).handleExit('execution-1', 0);

    expect(metricsService.incrementExecutionsFailed).toHaveBeenCalled();
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
        type: 'error',
        payload: expect.objectContaining({ status: 'failed' }),
      }),
      true,
    );
  });
});
