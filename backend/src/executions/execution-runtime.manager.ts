import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedactionService } from '../common/security/redaction.service';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { MetricsService } from '../observability/metrics.service';
import { CLAUDE_CLI_RUNNER } from './constants/executions.tokens';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';
import { Execution } from './entities/execution.entity';
import {
  CompletedPublicationResult,
  ExecutionPublicationService,
} from './execution-publication.service';
import { ExecutionReviewGateService } from './execution-review-gate.service';
import type {
  ClaudeCliProcess,
  ClaudeCliRunner,
} from './interfaces/claude-cli-runner.interface';
import type { ExecutionStatus } from './interfaces/execution.types';
import { ExecutionStreamHub } from './execution-stream.hub';

type StartExecutionInput = {
  executionId: string;
  action: 'fix' | 'feature' | 'plan';
  prompt: string;
  cwd: string;
  anthropicAuthToken: string;
  timeoutMs: number;
};

type ActiveExecution = {
  process: ClaudeCliProcess;
  cancelRequested: boolean;
  timedOut: boolean;
  fatalErrorMessage: string | null;
  killTimeoutId: NodeJS.Timeout | null;
  timeoutId: NodeJS.Timeout | null;
  cancelSyncIntervalId: NodeJS.Timeout | null;
  output: string;
  outputTruncated: boolean;
  writeQueue: Promise<void>;
  startedAtMs: number;
};

@Injectable()
export class ExecutionRuntimeManager implements OnModuleDestroy {
  private readonly logger = new Logger(ExecutionRuntimeManager.name);
  private readonly outputMaxBytes: number;
  private readonly gracefulStopMs: number;
  private readonly activeExecutions = new Map<string, ActiveExecution>();

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    @Inject(CLAUDE_CLI_RUNNER)
    private readonly claudeCliRunner: ClaudeCliRunner,
    private readonly streamHub: ExecutionStreamHub,
    private readonly publicationService: ExecutionPublicationService,
    private readonly executionReviewGateService: ExecutionReviewGateService,
    private readonly redactionService: RedactionService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {
    this.outputMaxBytes = parsePositiveInteger(
      this.configService.get<string>('EXECUTION_OUTPUT_MAX_BYTES', '204800'),
      204800,
    );
    this.gracefulStopMs = parsePositiveInteger(
      this.configService.get<string>('EXECUTION_GRACEFUL_STOP_MS', '5000'),
      5000,
    );
  }

  async ensureRunnerAvailable(): Promise<void> {
    await this.claudeCliRunner.ensureAvailable();
  }

  async startExecution(input: StartExecutionInput): Promise<void> {
    const execution = await this.executionRepository.findOneBy({
      id: input.executionId,
    });
    if (!execution) {
      this.logger.warn(
        `Cannot start execution: record not found for id=${input.executionId}`,
      );
      return;
    }

    const startedAt = new Date();
    const claimed = await this.executionRepository.update(
      {
        id: input.executionId,
        status: 'pending',
        orchestrationState: 'running',
      },
      {
        status: 'running',
        startedAt,
      },
    );
    if ((claimed.affected ?? 0) !== 1) {
      return;
    }

    const process = await this.claudeCliRunner.start({
      prompt: input.prompt,
      action: input.action,
      cwd: input.cwd,
      anthropicAuthToken: input.anthropicAuthToken,
    });

    const activeExecution: ActiveExecution = {
      process,
      cancelRequested: false,
      timedOut: false,
      fatalErrorMessage: null,
      killTimeoutId: null,
      timeoutId: null,
      cancelSyncIntervalId: null,
      output: execution.output ?? '',
      outputTruncated: execution.outputTruncated ?? false,
      writeQueue: Promise.resolve(),
      startedAtMs: Date.now(),
    };
    this.activeExecutions.set(input.executionId, activeExecution);

    await this.executionRepository.update(
      { id: input.executionId },
      {
        pid: process.pid,
      },
    );
    this.logger.log(
      `Execution started: id=${input.executionId}, action=${input.action}, pid=${process.pid ?? 'n/a'}`,
    );
    this.metricsService.incrementExecutionsStarted();
    this.publish({
      type: 'status',
      payload: {
        type: 'status',
        executionId: input.executionId,
        status: 'running',
      },
    });
    activeExecution.cancelSyncIntervalId = setInterval(() => {
      this.syncCancellationRequest(input.executionId).catch(
        (error: unknown) => {
          this.logger.error(
            `Failed to sync cancellation for execution ${input.executionId}`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      );
    }, 1000);

    process.onStdout((chunk) => {
      const redactedChunk = this.redactionService.redactText(chunk);
      this.appendOutput(input.executionId, redactedChunk).catch(
        (error: unknown) => {
          this.logger.error(
            `Failed to append stdout for execution ${input.executionId}`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      );
      this.publish({
        type: 'stdout',
        payload: {
          type: 'stdout',
          executionId: input.executionId,
          chunk: redactedChunk,
        },
      });
    });

    process.onStderr((chunk) => {
      const redactedChunk = this.redactionService.redactText(chunk);
      this.appendOutput(input.executionId, redactedChunk).catch(
        (error: unknown) => {
          this.logger.error(
            `Failed to append stderr for execution ${input.executionId}`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      );
      this.publish({
        type: 'stderr',
        payload: {
          type: 'stderr',
          executionId: input.executionId,
          chunk: redactedChunk,
        },
      });
      this.detectFatalError(input.executionId, redactedChunk);
    });

    process.onExit((exitInfo) => {
      this.handleExit(input.executionId, exitInfo.code).catch(
        (error: unknown) => {
          this.logger.error(
            `Failed to finalize execution ${input.executionId}`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      );
    });

    process.onError((error) => {
      const redactedErrorMessage = this.redactionService.redactText(
        error.message,
      );
      this.logger.error(
        `Execution process error for ${input.executionId}: ${redactedErrorMessage}`,
      );
      this.detectFatalError(input.executionId, redactedErrorMessage);
    });

    const timeoutMs = Math.max(1, input.timeoutMs);
    activeExecution.timeoutId = setTimeout(() => {
      this.handleTimeout(input.executionId).catch((error: unknown) => {
        this.logger.error(
          `Failed to handle timeout for execution ${input.executionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, timeoutMs);
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    const activeExecution = this.activeExecutions.get(executionId);
    if (!activeExecution) {
      return false;
    }

    activeExecution.cancelRequested = true;
    this.terminateProcess(executionId, activeExecution);
    return true;
  }

  isExecutionActive(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }

  async onModuleDestroy(): Promise<void> {
    for (const [executionId, activeExecution] of this.activeExecutions) {
      activeExecution.cancelRequested = true;
      this.terminateProcess(executionId, activeExecution);
    }

    if (this.activeExecutions.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.gracefulStopMs));
    }

    for (const [, activeExecution] of this.activeExecutions) {
      try {
        activeExecution.process.kill('SIGKILL');
      } catch {
        // Best effort force kill during shutdown.
      }
    }
  }

  private async appendOutput(
    executionId: string,
    chunk: string,
  ): Promise<void> {
    const activeExecution = this.activeExecutions.get(executionId);
    if (!activeExecution || activeExecution.outputTruncated) {
      return;
    }

    activeExecution.writeQueue = activeExecution.writeQueue
      .then(async () => {
        if (activeExecution.outputTruncated) {
          return;
        }

        const currentBytes = Buffer.byteLength(activeExecution.output, 'utf8');
        if (currentBytes >= this.outputMaxBytes) {
          activeExecution.outputTruncated = true;
          await this.executionRepository.update(
            { id: executionId },
            {
              output: activeExecution.output,
              outputTruncated: true,
            },
          );
          return;
        }

        const chunkBuffer = Buffer.from(chunk, 'utf8');
        const remainingBytes = this.outputMaxBytes - currentBytes;
        const safeLength = this.findSafeUtf8TruncationPoint(
          chunkBuffer,
          remainingBytes,
        );
        const nextBuffer = chunkBuffer.subarray(0, safeLength);

        activeExecution.output += nextBuffer.toString('utf8');
        if (chunkBuffer.length > remainingBytes) {
          activeExecution.outputTruncated = true;
        }

        await this.executionRepository.update(
          { id: executionId },
          {
            output: activeExecution.output,
            outputTruncated: activeExecution.outputTruncated,
          },
        );
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to persist output for execution ${executionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    await activeExecution.writeQueue;
  }

  private findSafeUtf8TruncationPoint(
    buffer: Buffer,
    maxBytes: number,
  ): number {
    const limit = Math.min(maxBytes, buffer.length);
    if (limit >= buffer.length) {
      return buffer.length;
    }

    let safeBoundary = limit;
    while (
      safeBoundary > 0 &&
      (buffer[safeBoundary] & 0b11000000) === 0b10000000
    ) {
      safeBoundary -= 1;
    }

    if (safeBoundary === 0) {
      return 0;
    }

    const leadingByte = buffer[safeBoundary];
    const expectedLength = this.resolveUtf8CodePointLength(leadingByte);

    if (safeBoundary + expectedLength <= limit) {
      return limit;
    }

    return safeBoundary;
  }

  private resolveUtf8CodePointLength(byte: number): number {
    if ((byte & 0b10000000) === 0) {
      return 1;
    }

    if ((byte & 0b11100000) === 0b11000000) {
      return 2;
    }

    if ((byte & 0b11110000) === 0b11100000) {
      return 3;
    }

    if ((byte & 0b11111000) === 0b11110000) {
      return 4;
    }

    return 1;
  }

  private static readonly FATAL_ERROR_PATTERNS = [
    'authentication_error',
    'invalid_api_key',
    'invalid x-api-key',
    'invalid bearer token',
  ];

  private detectFatalError(executionId: string, chunk: string): void {
    const activeExecution = this.activeExecutions.get(executionId);
    if (
      !activeExecution ||
      activeExecution.cancelRequested ||
      activeExecution.fatalErrorMessage
    ) {
      return;
    }

    const lower = chunk.toLowerCase();
    const matched = ExecutionRuntimeManager.FATAL_ERROR_PATTERNS.some(
      (pattern) => lower.includes(pattern),
    );

    if (matched) {
      this.logger.warn(
        `Fatal error detected in execution ${executionId}, terminating process`,
      );
      activeExecution.fatalErrorMessage =
        'Authentication failed: invalid OAuth token';
      this.terminateProcess(executionId, activeExecution);
    }
  }

  private async handleTimeout(executionId: string): Promise<void> {
    const activeExecution = this.activeExecutions.get(executionId);
    if (!activeExecution) {
      return;
    }

    this.logger.warn(`Execution timeout reached: id=${executionId}`);
    this.metricsService.incrementExecutionsTimeout();
    activeExecution.timedOut = true;
    activeExecution.cancelRequested = true;
    this.publish({
      type: 'status',
      payload: {
        type: 'status',
        executionId,
        status: 'failed',
        errorMessage: 'Execution timed out',
      },
    });
    this.terminateProcess(executionId, activeExecution);
  }

  private terminateProcess(
    executionId: string,
    activeExecution: ActiveExecution,
  ): void {
    try {
      activeExecution.process.kill('SIGTERM');
    } catch {
      // Process may already be gone.
    }

    if (activeExecution.killTimeoutId) {
      return;
    }

    activeExecution.killTimeoutId = setTimeout(() => {
      const runningExecution = this.activeExecutions.get(executionId);
      if (!runningExecution) {
        return;
      }

      try {
        runningExecution.process.kill('SIGKILL');
      } catch {
        // Best effort force kill.
      }
    }, this.gracefulStopMs);
  }

  private async handleExit(
    executionId: string,
    exitCode: number | null,
  ): Promise<void> {
    const activeExecution = this.activeExecutions.get(executionId);
    if (!activeExecution) {
      return;
    }
    const activeExecutionRef = activeExecution;

    if (activeExecution.timeoutId) {
      clearTimeout(activeExecution.timeoutId);
    }

    if (activeExecution.killTimeoutId) {
      clearTimeout(activeExecution.killTimeoutId);
    }

    if (activeExecution.cancelSyncIntervalId) {
      clearInterval(activeExecution.cancelSyncIntervalId);
    }

    await activeExecution.writeQueue;

    const latestExecution = await this.executionRepository.findOneBy({
      id: executionId,
    });
    if (latestExecution?.status === 'cancelled') {
      activeExecution.cancelRequested = true;
    }
    this.metricsService.observeExecutionDuration(
      (Date.now() - activeExecution.startedAtMs) / 1000,
    );

    const finishedAt = new Date();
    let status: ExecutionStatus;
    let orchestrationState: Execution['orchestrationState'] = 'failed';
    let errorMessage: string | null = null;
    let automationPatch: Partial<Execution> = {};

    if (activeExecution.timedOut) {
      status = 'failed';
      errorMessage = 'Execution timed out';
      orchestrationState = 'failed';
    } else if (activeExecution.fatalErrorMessage) {
      status = 'failed';
      errorMessage = activeExecution.fatalErrorMessage;
      orchestrationState = 'failed';
      automationPatch = {
        automationStatus: 'failed',
        automationCompletedAt: finishedAt,
        automationErrorMessage: errorMessage,
      };
    } else if (activeExecution.cancelRequested) {
      status = 'cancelled';
      errorMessage = 'Execution cancelled';
      orchestrationState = 'done';
      automationPatch = {
        automationStatus: 'not_applicable',
        automationCompletedAt: finishedAt,
        automationErrorMessage: errorMessage,
      };
    } else if (exitCode === 0) {
      status = 'completed';
      orchestrationState = 'finalizing';
    } else {
      status = 'failed';
      errorMessage = 'Execution process failed';
      orchestrationState = 'failed';
      automationPatch = {
        automationStatus: 'failed',
        automationCompletedAt: finishedAt,
        automationErrorMessage: errorMessage,
      };
    }

    await this.executionRepository.update(
      { id: executionId },
      {
        status,
        orchestrationState,
        finishedAt,
        exitCode,
        errorMessage,
        ...automationPatch,
      },
    );
    this.logger.log(
      `Execution finished: id=${executionId}, status=${status}, exitCode=${exitCode ?? 'null'}, timedOut=${activeExecution.timedOut}, cancelRequested=${activeExecution.cancelRequested}`,
    );

    const updatedExecution = await this.executionRepository.findOneBy({
      id: executionId,
    });
    if (!updatedExecution) {
      if (this.activeExecutions.get(executionId) === activeExecutionRef) {
        this.activeExecutions.delete(executionId);
      }
      return;
    }

    if (updatedExecution.executionRole === 'implementation') {
      if (status === 'completed') {
        const gateOutcome =
          await this.executionReviewGateService.handleImplementationCompletion(
            executionId,
          );

        if (gateOutcome.action === 'review_started') {
          this.publish({
            type: 'review',
            payload: {
              type: 'review',
              executionId,
              reviewGateStatus: 'review_running',
              cycle: gateOutcome.cycle,
              message: 'Secondary AI review started',
              reviewExecutionId: gateOutcome.reviewExecutionId,
            },
          });
          if (this.activeExecutions.get(executionId) === activeExecutionRef) {
            this.activeExecutions.delete(executionId);
          }
          return;
        }

        await this.finalizeCompletedExecution(executionId, exitCode);
      } else {
        await this.finalizeNonCompletedExecution(
          executionId,
          status,
          exitCode,
          errorMessage ?? 'Execution failed',
        );
      }
    } else if (updatedExecution.executionRole === 'review') {
      await this.finalizeChildExecution(
        executionId,
        status,
        exitCode,
        errorMessage,
      );
      const outcome =
        await this.executionReviewGateService.handleReviewCompletion(
          executionId,
        );
      await this.handleChildOutcome(outcome, exitCode);
    } else {
      await this.finalizeChildExecution(
        executionId,
        status,
        exitCode,
        errorMessage,
      );
      const outcome =
        await this.executionReviewGateService.handleRemediationCompletion(
          executionId,
        );
      await this.handleChildOutcome(outcome, exitCode);
    }

    if (this.activeExecutions.get(executionId) === activeExecutionRef) {
      this.activeExecutions.delete(executionId);
    }
  }

  async finalizeCompletedExecution(
    executionId: string,
    exitCode: number | null,
  ): Promise<void> {
    let publicationResult: CompletedPublicationResult = { outcome: 'failed' };
    try {
      publicationResult =
        await this.publicationService.handleCompletedExecution(executionId);
    } catch (error) {
      this.logger.error(
        `Execution publication hook failed for ${executionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      publicationResult = { outcome: 'failed' };
    }

    if (publicationResult.outcome === 'requeued') {
      this.publish({
        type: 'status',
        payload: {
          type: 'status',
          executionId,
          status: 'pending',
        },
      });
      return;
    }

    if (
      publicationResult.outcome === 'published' ||
      publicationResult.outcome === 'not_applicable'
    ) {
      await this.executionRepository.update(
        { id: executionId },
        {
          status: 'completed',
          orchestrationState: 'done',
        },
      );
      this.metricsService.incrementExecutionsCompleted();
      this.publish(
        {
          type: 'completed',
          payload: {
            type: 'completed',
            executionId,
            status: 'completed',
            exitCode,
          },
        },
        true,
      );
      return;
    }

    const latestAfterPublication = await this.executionRepository.findOne({
      select: {
        automationErrorMessage: true,
      },
      where: {
        id: executionId,
      },
    });
    const publicationFailureMessage =
      latestAfterPublication?.automationErrorMessage ??
      'Execution publication failed';
    await this.executionRepository.update(
      { id: executionId },
      {
        status: 'failed',
        orchestrationState: 'failed',
        errorMessage: publicationFailureMessage,
        automationStatus:
          publicationResult.outcome === 'failed_no_changes'
            ? 'no_changes'
            : 'failed',
        automationCompletedAt: new Date(),
        automationErrorMessage: publicationFailureMessage,
      },
    );
    this.metricsService.incrementExecutionsFailed();
    this.publish(
      {
        type: 'error',
        payload: {
          type: 'error',
          executionId,
          status: 'failed',
          exitCode,
          errorMessage: publicationFailureMessage,
        },
      },
      true,
    );
  }

  private async finalizeNonCompletedExecution(
    executionId: string,
    status: ExecutionStatus,
    exitCode: number | null,
    errorMessage: string,
  ): Promise<void> {
    if (status === 'failed') {
      this.metricsService.incrementExecutionsFailed();
    }
    if (status === 'cancelled') {
      this.metricsService.incrementExecutionsCompleted();
      await this.executionRepository.update(
        { id: executionId },
        {
          orchestrationState: 'done',
        },
      );
    }
    this.publish(
      {
        type: 'error',
        payload: {
          type: 'error',
          executionId,
          status,
          exitCode,
          errorMessage,
        },
      },
      true,
    );
  }

  private async finalizeChildExecution(
    executionId: string,
    status: ExecutionStatus,
    exitCode: number | null,
    errorMessage: string | null,
  ): Promise<void> {
    if (status === 'completed') {
      await this.executionRepository.update(
        { id: executionId },
        {
          orchestrationState: 'done',
          automationStatus: 'not_applicable',
          automationCompletedAt: new Date(),
        },
      );
      this.metricsService.incrementExecutionsCompleted();
      this.publish(
        {
          type: 'completed',
          payload: {
            type: 'completed',
            executionId,
            status: 'completed',
            exitCode,
          },
        },
        true,
      );
      return;
    }

    await this.finalizeNonCompletedExecution(
      executionId,
      status,
      exitCode,
      errorMessage ?? 'Execution failed',
    );
  }

  private async handleChildOutcome(
    outcome:
      | { action: 'none' }
      | {
          action: 'continue_publication';
          parentExecutionId: string;
          cycle: number;
        }
      | {
          action: 'awaiting_decision';
          parentExecutionId: string;
          cycle: number;
          pendingDecisionUntil: Date;
          reviewExecutionId: string;
        }
      | {
          action: 'review_started';
          parentExecutionId: string;
          cycle: number;
          reviewExecutionId: string;
        }
      | {
          action: 'parent_failed';
          parentExecutionId: string;
          message: string;
        },
    exitCode: number | null,
  ): Promise<void> {
    if (outcome.action === 'none') {
      return;
    }

    if (outcome.action === 'continue_publication') {
      await this.finalizeCompletedExecution(
        outcome.parentExecutionId,
        exitCode,
      );
      return;
    }

    if (outcome.action === 'awaiting_decision') {
      this.publish({
        type: 'review',
        payload: {
          type: 'review',
          executionId: outcome.parentExecutionId,
          reviewGateStatus: 'awaiting_decision',
          cycle: outcome.cycle,
          message: 'Review findings require decision',
          pendingDecisionUntil: outcome.pendingDecisionUntil.toISOString(),
          reviewExecutionId: outcome.reviewExecutionId,
        },
      });
      return;
    }

    if (outcome.action === 'review_started') {
      this.publish({
        type: 'review',
        payload: {
          type: 'review',
          executionId: outcome.parentExecutionId,
          reviewGateStatus: 'review_running',
          cycle: outcome.cycle,
          message: 'Remediation completed, review restarted',
          reviewExecutionId: outcome.reviewExecutionId,
        },
      });
      return;
    }

    this.publish(
      {
        type: 'error',
        payload: {
          type: 'error',
          executionId: outcome.parentExecutionId,
          status: 'failed',
          exitCode: null,
          errorMessage: outcome.message,
        },
      },
      true,
    );
  }

  private publish(event: ExecutionStreamEventDto, terminal = false): void {
    this.streamHub.publish(event.payload.executionId, event, terminal);
  }

  private async syncCancellationRequest(executionId: string): Promise<void> {
    const activeExecution = this.activeExecutions.get(executionId);
    if (!activeExecution || activeExecution.cancelRequested) {
      return;
    }

    const execution = await this.executionRepository.findOne({
      select: {
        id: true,
        status: true,
      },
      where: {
        id: executionId,
      },
    });
    if (!execution || execution.status !== 'cancelled') {
      return;
    }

    activeExecution.cancelRequested = true;
    this.terminateProcess(executionId, activeExecution);
  }
}
