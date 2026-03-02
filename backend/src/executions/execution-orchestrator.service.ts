import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { access } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { MetricsService } from '../observability/metrics.service';
import { SettingsService } from '../settings/settings.service';
import { Execution } from './entities/execution.entity';
import { ExecutionRuntimeManager } from './execution-runtime.manager';

@Injectable()
export class ExecutionOrchestratorService {
  private readonly logger = new Logger(ExecutionOrchestratorService.name);
  private readonly defaultTimeoutMs: number;
  private readonly minTimeoutMs = 60000;
  private readonly maxTimeoutMs = 7200000;

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly settingsService: SettingsService,
    private readonly runtimeManager: ExecutionRuntimeManager,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTimeoutMs = parsePositiveInteger(
      this.configService.get<string>('EXECUTION_DEFAULT_TIMEOUT_MS', '1800000'),
      1800000,
    );
  }

  async processExecution(executionId: string): Promise<void> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: {
        repository: true,
      },
    });

    if (!execution || execution.status !== 'pending' || !execution.repository) {
      return;
    }

    this.metricsService.observeQueueWait(
      (Date.now() - execution.createdAt.getTime()) / 1000,
    );

    try {
      await access(join(execution.repository.localPath, '.git'));
    } catch {
      await this.fail(execution.id, 'Repository is not in a runnable state');
      return;
    }

    const claudeOauthToken =
      await this.settingsService.getClaudeOauthTokenForUserOrNull(
        execution.userId,
      );
    if (!claudeOauthToken) {
      await this.fail(
        execution.id,
        'Claude OAuth token is not configured in user settings',
      );
      return;
    }

    try {
      await this.runtimeManager.ensureRunnerAvailable();
    } catch {
      await this.fail(execution.id, 'Claude CLI is not available');
      return;
    }

    try {
      await this.runtimeManager.startExecution({
        executionId: execution.id,
        action: execution.action,
        prompt: execution.prompt,
        cwd: execution.repository.localPath,
        anthropicAuthToken: claudeOauthToken,
        timeoutMs: await this.resolveExecutionTimeoutMs(execution.userId),
      });
    } catch (error) {
      this.logger.error(
        `Failed to start queued execution ${execution.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.fail(execution.id, 'Failed to start execution process');
    }
  }

  async failDueToRecoveryTimeout(executionId: string): Promise<void> {
    await this.executionRepository.update(
      { id: executionId },
      {
        status: 'failed',
        orchestrationState: 'failed',
        automationStatus: 'failed',
        automationCompletedAt: new Date(),
        automationErrorMessage: 'worker restart recovery timeout',
        finishedAt: new Date(),
        errorMessage: 'worker restart recovery timeout',
      },
    );
  }

  async resetToQueued(executionId: string): Promise<void> {
    await this.executionRepository.update(
      { id: executionId },
      {
        status: 'pending',
        orchestrationState: 'queued',
        pid: null,
        startedAt: null,
        finishedAt: null,
        exitCode: null,
        errorMessage: null,
      },
    );
  }

  private async fail(executionId: string, message: string): Promise<void> {
    await this.executionRepository.update(
      { id: executionId },
      {
        status: 'failed',
        orchestrationState: 'failed',
        automationStatus: 'failed',
        automationCompletedAt: new Date(),
        automationErrorMessage: message,
        finishedAt: new Date(),
        errorMessage: message,
      },
    );
  }

  private async resolveExecutionTimeoutMs(userId: string): Promise<number> {
    const userDefinedTimeoutMs =
      await this.settingsService.getExecutionTimeoutMsForUserOrNull(userId);
    if (userDefinedTimeoutMs === null) {
      return this.defaultTimeoutMs;
    }

    if (!Number.isFinite(userDefinedTimeoutMs)) {
      return this.defaultTimeoutMs;
    }

    return Math.min(
      this.maxTimeoutMs,
      Math.max(this.minTimeoutMs, userDefinedTimeoutMs),
    );
  }
}
