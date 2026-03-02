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

@Injectable()
export class ExecutionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionWorkerService.name);
  private readonly workerEnabled: boolean;
  private readonly recoveryTimeoutMs: number;
  private stopped = false;
  private consumePromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly executionQueueService: ExecutionQueueService,
    private readonly executionOrchestratorService: ExecutionOrchestratorService,
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
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
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
}
