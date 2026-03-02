import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { CLAUDE_CLI_RUNNER } from './constants/executions.tokens';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';
import { Execution } from './entities/execution.entity';
import { ExecutionPublicationService } from './execution-publication.service';
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
  output: string;
  outputTruncated: boolean;
  writeQueue: Promise<void>;
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
      output: execution.output ?? '',
      outputTruncated: execution.outputTruncated ?? false,
      writeQueue: Promise.resolve(),
    };
    this.activeExecutions.set(input.executionId, activeExecution);

    const startedAt = new Date();
    await this.executionRepository.update(
      { id: input.executionId },
      {
        status: 'running',
        pid: process.pid,
        startedAt,
      },
    );
    this.logger.log(
      `Execution started: id=${input.executionId}, action=${input.action}, pid=${process.pid ?? 'n/a'}`,
    );
    this.publish({
      type: 'status',
      payload: {
        type: 'status',
        executionId: input.executionId,
        status: 'running',
      },
    });

    process.onStdout((chunk) => {
      this.appendOutput(input.executionId, chunk).catch((error: unknown) => {
        this.logger.error(
          `Failed to append stdout for execution ${input.executionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
      this.publish({
        type: 'stdout',
        payload: {
          type: 'stdout',
          executionId: input.executionId,
          chunk,
        },
      });
    });

    process.onStderr((chunk) => {
      this.appendOutput(input.executionId, chunk).catch((error: unknown) => {
        this.logger.error(
          `Failed to append stderr for execution ${input.executionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
      this.publish({
        type: 'stderr',
        payload: {
          type: 'stderr',
          executionId: input.executionId,
          chunk,
        },
      });
      this.detectFatalError(input.executionId, chunk);
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
      this.logger.error(
        `Execution process error for ${input.executionId}: ${error.message}`,
      );
      this.detectFatalError(input.executionId, error.message);
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

    if (activeExecution.timeoutId) {
      clearTimeout(activeExecution.timeoutId);
    }

    if (activeExecution.killTimeoutId) {
      clearTimeout(activeExecution.killTimeoutId);
    }

    await activeExecution.writeQueue;

    const finishedAt = new Date();
    let status: ExecutionStatus;
    let errorMessage: string | null = null;
    let automationPatch: Partial<Execution> = {};

    if (activeExecution.timedOut) {
      status = 'failed';
      errorMessage = 'Execution timed out';
    } else if (activeExecution.fatalErrorMessage) {
      status = 'failed';
      errorMessage = activeExecution.fatalErrorMessage;
      automationPatch = {
        automationStatus: 'failed',
        automationCompletedAt: finishedAt,
        automationErrorMessage: errorMessage,
      };
    } else if (activeExecution.cancelRequested) {
      status = 'cancelled';
      errorMessage = 'Execution cancelled';
      automationPatch = {
        automationStatus: 'not_applicable',
        automationCompletedAt: finishedAt,
        automationErrorMessage: errorMessage,
      };
    } else if (exitCode === 0) {
      status = 'completed';
    } else {
      status = 'failed';
      errorMessage = 'Execution process failed';
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
        finishedAt,
        exitCode,
        errorMessage,
        ...automationPatch,
      },
    );
    this.logger.log(
      `Execution finished: id=${executionId}, status=${status}, exitCode=${exitCode ?? 'null'}, timedOut=${activeExecution.timedOut}, cancelRequested=${activeExecution.cancelRequested}`,
    );

    if (status === 'completed') {
      try {
        await this.publicationService.handleCompletedExecution(executionId);
      } catch (error) {
        this.logger.error(
          `Execution publication hook failed for ${executionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      this.publish(
        {
          type: 'completed',
          payload: {
            type: 'completed',
            executionId,
            status,
            exitCode,
          },
        },
        true,
      );
    } else {
      this.publish(
        {
          type: 'error',
          payload: {
            type: 'error',
            executionId,
            status,
            exitCode,
            errorMessage: errorMessage ?? 'Execution failed',
          },
        },
        true,
      );
    }

    this.activeExecutions.delete(executionId);
  }

  private publish(event: ExecutionStreamEventDto, terminal = false): void {
    this.streamHub.publish(event.payload.executionId, event, terminal);
  }
}
