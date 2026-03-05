import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { Execution } from './entities/execution.entity';
import { ExecutionOrchestratorService } from './execution-orchestrator.service';
import { ExecutionQueueService } from './execution-queue.service';
import { ExecutionReviewGateService } from './execution-review-gate.service';
import { ExecutionRuntimeManager } from './execution-runtime.manager';

@Injectable()
export class ExecutionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionWorkerService.name);
  private readonly workerEnabled: boolean;
  private readonly recoveryTimeoutMs: number;
  private readonly reviewTimeoutSweepMs: number;
  private stopped = false;
  private consumePromise: Promise<void> | null = null;
  private reviewTimeoutInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly executionQueueService: ExecutionQueueService,
    private readonly executionOrchestratorService: ExecutionOrchestratorService,
    private readonly executionReviewGateService: ExecutionReviewGateService,
    private readonly executionRuntimeManager: ExecutionRuntimeManager,
    configService: ConfigService,
  ) {
    const workerFlag = (
      configService.get<string>('EXECUTION_WORKER_ENABLED', 'false') ?? 'false'
    )
      .trim()
      .toLowerCase();
    this.workerEnabled = ['1', 'true', 'yes', 'on'].includes(workerFlag);
    this.recoveryTimeoutMs = parsePositiveInteger(
      configService.get<string>(
        'EXECUTION_WORKER_RECOVERY_TIMEOUT_MS',
        '900000',
      ),
      900000,
    );
    this.reviewTimeoutSweepMs = parsePositiveInteger(
      configService.get<string>('EXECUTION_REVIEW_TIMEOUT_SWEEP_MS', '60000'),
      60000,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.workerEnabled) {
      return;
    }

    await this.recoverOrphans();
    if (this.executionQueueService.isInlineDriver()) {
      return;
    }

    this.consumePromise = this.executionQueueService.consume(
      (executionId) =>
        this.executionOrchestratorService.processExecution(executionId),
      () => this.stopped,
    );

    this.reviewTimeoutInterval = setInterval(() => {
      this.processReviewTimeouts().catch((error: unknown) => {
        this.logger.error(
          'Review timeout sweep failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, this.reviewTimeoutSweepMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reviewTimeoutInterval) {
      clearInterval(this.reviewTimeoutInterval);
      this.reviewTimeoutInterval = null;
    }
    if (this.consumePromise) {
      await this.consumePromise.catch(() => undefined);
    }
  }

  private async recoverOrphans(): Promise<void> {
    const candidates = await this.executionRepository.find({
      where: [
        { orchestrationState: 'queued', status: 'pending' },
        { orchestrationState: 'running', status: 'running' },
        { orchestrationState: 'finalizing', status: 'running' },
      ],
      order: { createdAt: 'ASC' },
    });

    const nowMs = Date.now();
    for (const execution of candidates) {
      const ageBase = execution.startedAt ?? execution.createdAt;
      const ageMs = nowMs - ageBase.getTime();
      if (ageMs > this.recoveryTimeoutMs) {
        await this.executionOrchestratorService.failDueToRecoveryTimeout(
          execution.id,
        );
        continue;
      }

      await this.executionOrchestratorService.resetToQueued(execution.id);
      if (this.executionQueueService.isInlineDriver()) {
        await this.executionOrchestratorService.processExecution(execution.id);
        continue;
      }

      await this.executionQueueService.enqueue(execution.id);
    }
  }

  private async processReviewTimeouts(): Promise<void> {
    const timedOutExecutionIds =
      await this.executionReviewGateService.markTimedOutAwaitingDecision(25);
    for (const executionId of timedOutExecutionIds) {
      await this.executionRuntimeManager.finalizeCompletedExecution(
        executionId,
        0,
      );
    }
  }
}
