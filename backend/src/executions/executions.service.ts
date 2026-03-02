import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { access } from 'fs/promises';
import { join } from 'path';
import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { ManagedRepository } from '../repositories/entities/repository.entity';
import { RepositoriesService } from '../repositories/repositories.service';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/entities/user.entity';
import { CreateExecutionDto } from './dto/create-execution.dto';
import {
  ExecutionDetailResponseDto,
  ExecutionSummaryResponseDto,
} from './dto/execution-response.dto';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';
import { GetExecutionsQueryDto } from './dto/get-executions-query.dto';
import { Execution } from './entities/execution.entity';
import { ExecutionDispatchService } from './execution-dispatch.service';
import { ExecutionEventStoreService } from './execution-event-store.service';
import { ExecutionStreamHub } from './execution-stream.hub';
import { ExecutionRuntimeManager } from './execution-runtime.manager';
import type { ExecutionAction } from './interfaces/execution.types';

@Injectable()
export class ExecutionsService {
  private static readonly IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
  private readonly maxConcurrentPerUser: number;
  private readonly defaultListLimit = 50;
  private readonly maxListLimit = 200;

  constructor(
    @InjectRepository(Execution)
    private readonly executionsRepository: Repository<Execution>,
    private readonly repositoriesService: RepositoriesService,
    private readonly settingsService: SettingsService,
    private readonly executionDispatchService: ExecutionDispatchService,
    private readonly executionEventStoreService: ExecutionEventStoreService,
    private readonly runtimeManager: ExecutionRuntimeManager,
    private readonly streamHub: ExecutionStreamHub,
    configService: ConfigService,
  ) {
    this.maxConcurrentPerUser = parsePositiveInteger(
      configService.get<string>('EXECUTION_MAX_CONCURRENT_PER_USER', '2'),
      2,
    );
  }

  async createForUser(
    userId: string,
    dto: CreateExecutionDto,
    idempotencyKeyHeader?: string,
  ): Promise<{ execution: ExecutionSummaryResponseDto; reused: boolean }> {
    const idempotencyKey = this.normalizeIdempotencyKey(idempotencyKeyHeader);
    const requestHash = idempotencyKey ? this.computeRequestHash(dto) : null;
    const idempotencyCutoff = new Date(
      Date.now() - ExecutionsService.IDEMPOTENCY_TTL_MS,
    );
    if (idempotencyKey && requestHash) {
      const existingExecution = await this.tryReuseIdempotentExecution(
        this.executionsRepository,
        userId,
        idempotencyKey,
        requestHash,
        idempotencyCutoff,
      );
      if (existingExecution) {
        const reusedExecution = await this.getOwnedExecution(
          existingExecution.id,
          userId,
        );
        return {
          execution: this.toSummaryResponse(reusedExecution),
          reused: true,
        };
      }
    }

    const repository = await this.getOwnedRepository(userId, dto.repositoryId);
    await this.assertRepositoryRunnable(repository);

    const claudeOauthToken =
      await this.settingsService.getClaudeOauthTokenForUserOrNull(userId);
    if (!claudeOauthToken) {
      throw new BadRequestException(
        'Claude OAuth token is not configured in user settings',
      );
    }

    const prompt = this.buildPrompt(dto.action, dto);

    let transactionResult: { execution: Execution; reused: boolean };
    try {
      transactionResult = await this.executionsRepository.manager.transaction(
        async (manager): Promise<{ execution: Execution; reused: boolean }> => {
          const executionRepository = manager.getRepository(Execution);
          if (idempotencyKey && requestHash) {
            const existingExecution = await this.tryReuseIdempotentExecution(
              executionRepository,
              userId,
              idempotencyKey,
              requestHash,
              idempotencyCutoff,
            );
            if (existingExecution) {
              return { execution: existingExecution, reused: true };
            }
          }

          await this.assertConcurrentExecutionLimitWithinTransaction(
            manager,
            userId,
          );

          const execution = executionRepository.create({
            userId,
            repositoryId: repository.id,
            idempotencyKey,
            requestHash,
            orchestrationState: 'queued',
            publishPullRequest: dto.publishPullRequest ?? true,
            taskId: dto.taskId,
            taskExternalId: dto.taskExternalId,
            taskTitle: dto.taskTitle,
            taskDescription: dto.taskDescription ?? null,
            taskSource: dto.taskSource,
            action: dto.action,
            prompt,
            status: 'pending',
            automationStatus: 'pending',
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
          });

          const savedExecution = await executionRepository.save(execution);
          return { execution: savedExecution, reused: false };
        },
      );
    } catch (error) {
      if (
        idempotencyKey &&
        requestHash &&
        this.isIdempotencyUniqueViolation(error)
      ) {
        const existingExecution = await this.tryReuseIdempotentExecution(
          this.executionsRepository,
          userId,
          idempotencyKey,
          requestHash,
          idempotencyCutoff,
        );
        if (existingExecution) {
          const reusedExecution = await this.getOwnedExecution(
            existingExecution.id,
            userId,
          );
          return {
            execution: this.toSummaryResponse(reusedExecution),
            reused: true,
          };
        }
      }
      throw error;
    }

    if (transactionResult.reused) {
      const reusedExecution = await this.getOwnedExecution(
        transactionResult.execution.id,
        userId,
      );
      return {
        execution: this.toSummaryResponse(reusedExecution),
        reused: true,
      };
    }

    const savedExecution = transactionResult.execution;
    try {
      await this.executionDispatchService.dispatch(savedExecution.id);
    } catch (error) {
      await this.executionsRepository.update(
        { id: savedExecution.id },
        {
          status: 'failed',
          orchestrationState: 'failed',
          automationStatus: 'failed',
          automationErrorMessage: 'Execution runtime startup failed',
          automationCompletedAt: new Date(),
          finishedAt: new Date(),
          errorMessage: 'Failed to enqueue execution',
        },
      );
      throw new InternalServerErrorException('Failed to enqueue execution');
    }

    const createdExecution = await this.getOwnedExecution(
      savedExecution.id,
      userId,
    );
    return {
      execution: this.toSummaryResponse(createdExecution),
      reused: false,
    };
  }

  async listForUser(
    userId: string,
    query: GetExecutionsQueryDto,
  ): Promise<ExecutionSummaryResponseDto[]> {
    const limit = this.resolveListLimit(query.limit);
    const executions = await this.executionsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return executions.map((execution) => this.toSummaryResponse(execution));
  }

  async getDetailForUser(
    userId: string,
    executionId: string,
  ): Promise<ExecutionDetailResponseDto> {
    const execution = await this.getOwnedExecution(executionId, userId);
    return this.toDetailResponse(execution);
  }

  async streamForUser(
    userId: string,
    executionId: string,
    afterSequence = 0,
  ): Promise<Observable<MessageEvent>> {
    const execution = await this.getOwnedExecution(executionId, userId);
    const isTerminalStatus =
      execution.status === 'completed' ||
      execution.status === 'failed' ||
      execution.status === 'cancelled';
    const completeImmediately =
      isTerminalStatus && !this.runtimeManager.isExecutionActive(execution.id);

    const normalizedAfterSequence = Number.isFinite(afterSequence)
      ? Math.max(0, Math.trunc(afterSequence))
      : 0;
    const replayEvents =
      normalizedAfterSequence > 0
        ? await this.executionEventStoreService.listAfterSequence(
            execution.id,
            normalizedAfterSequence,
          )
        : [];
    const lastSequence = await this.executionEventStoreService.getLastSequence(
      execution.id,
    );
    const snapshotEvent: ExecutionStreamEventDto = {
      type: 'snapshot',
      payload: {
        type: 'snapshot',
        executionId: execution.id,
        status: execution.status,
        automationStatus: execution.automationStatus,
        output: execution.output,
        outputTruncated: execution.outputTruncated,
        sequence: 0,
        sentAt: new Date().toISOString(),
        lastSequence,
      },
    };

    return this.streamHub.createStream(
      execution.id,
      snapshotEvent,
      completeImmediately,
      replayEvents,
    );
  }

  async cancelForUser(
    userId: string,
    executionId: string,
  ): Promise<ExecutionSummaryResponseDto> {
    const execution = await this.getOwnedExecution(executionId, userId);
    if (!['pending', 'running'].includes(execution.status)) {
      throw new ConflictException('Execution is not active');
    }

    const cancelled = await this.runtimeManager.cancelExecution(execution.id);
    if (!cancelled) {
      await this.executionsRepository.update(
        { id: execution.id },
        {
          status: 'cancelled',
          orchestrationState: 'done',
          automationStatus: 'not_applicable',
          automationCompletedAt: new Date(),
          automationErrorMessage: 'Execution cancelled',
          errorMessage: 'Execution cancelled',
        },
      );
    }

    const updatedExecution = await this.getOwnedExecution(execution.id, userId);
    return this.toSummaryResponse(updatedExecution);
  }

  private async getOwnedExecution(
    executionId: string,
    userId: string,
  ): Promise<Execution> {
    const execution = await this.executionsRepository.findOneBy({
      id: executionId,
      userId,
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    return execution;
  }

  private async getOwnedRepository(
    userId: string,
    repositoryId: string,
  ): Promise<ManagedRepository> {
    return this.repositoriesService.getOwnedRepositoryForUser(
      userId,
      repositoryId,
    );
  }

  private async assertRepositoryRunnable(
    repository: ManagedRepository,
  ): Promise<void> {
    try {
      await access(join(repository.localPath, '.git'));
    } catch {
      throw new ConflictException(
        'Repository is not in a runnable state for execution',
      );
    }
  }

  private async assertConcurrentExecutionLimitWithinTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    if (
      this.executionsRepository.metadata.connection.options.type === 'postgres'
    ) {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .getOne();

      if (!user) {
        throw new NotFoundException('User not found');
      }
    }

    const activeCount = await manager.getRepository(Execution).count({
      where: {
        userId,
        status: In(['pending', 'running']),
      },
    });

    if (activeCount >= this.maxConcurrentPerUser) {
      throw new ConflictException(
        `Maximum ${this.maxConcurrentPerUser} concurrent executions reached`,
      );
    }
  }

  private resolveListLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return this.defaultListLimit;
    }

    if (!Number.isFinite(limit)) {
      return this.defaultListLimit;
    }

    const normalizedLimit = Math.trunc(limit);
    if (normalizedLimit <= 0) {
      return this.defaultListLimit;
    }

    return Math.min(normalizedLimit, this.maxListLimit);
  }

  private buildPrompt(
    action: ExecutionAction,
    dto: CreateExecutionDto,
  ): string {
    const actionInstruction = this.resolveActionInstruction(action);
    const descriptionBlock = dto.taskDescription
      ? `Task description:\n${dto.taskDescription}\n`
      : '';

    return [
      `${actionInstruction}`,
      `Task source: ${dto.taskSource}`,
      `Task external ID: ${dto.taskExternalId}`,
      `Task title: ${dto.taskTitle}`,
      `${descriptionBlock}`.trimEnd(),
      '',
      'Please implement the changes directly in the repository and provide a concise summary of what was done.',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private resolveActionInstruction(action: ExecutionAction): string {
    if (action === 'fix') {
      return 'Resolve the reported issue with a minimal safe fix.';
    }

    if (action === 'feature') {
      return 'Implement the requested feature using maintainable backend architecture and tests.';
    }

    return 'Analyze the request and produce an implementation plan.';
  }

  private toSummaryResponse(execution: Execution): ExecutionSummaryResponseDto {
    return {
      id: execution.id,
      repositoryId: execution.repositoryId,
      publishPullRequest: execution.publishPullRequest,
      orchestrationState: execution.orchestrationState,
      idempotencyKey: this.maskIdempotencyKey(execution.idempotencyKey),
      taskId: execution.taskId,
      taskExternalId: execution.taskExternalId,
      taskTitle: execution.taskTitle,
      taskSource: execution.taskSource,
      action: execution.action,
      status: execution.status,
      automationStatus: execution.automationStatus,
      automationAttempts: execution.automationAttempts,
      branchName: execution.branchName,
      commitSha: execution.commitSha,
      pullRequestNumber: execution.pullRequestNumber,
      pullRequestUrl: execution.pullRequestUrl,
      pullRequestTitle: execution.pullRequestTitle,
      automationErrorMessage: execution.automationErrorMessage,
      automationCompletedAt: execution.automationCompletedAt,
      outputTruncated: execution.outputTruncated,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
    };
  }

  private toDetailResponse(execution: Execution): ExecutionDetailResponseDto {
    return {
      ...this.toSummaryResponse(execution),
      output: execution.output,
      exitCode: execution.exitCode,
      errorMessage: execution.errorMessage,
    };
  }

  private normalizeIdempotencyKey(value?: string): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      return null;
    }

    if (normalized.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key must be at most 255 characters long',
      );
    }

    return normalized;
  }

  private computeRequestHash(dto: CreateExecutionDto): string {
    const canonicalPayload = JSON.stringify({
      repositoryId: dto.repositoryId,
      action: dto.action,
      taskId: dto.taskId,
      taskExternalId: dto.taskExternalId,
      taskTitle: dto.taskTitle,
      taskDescription: dto.taskDescription ?? null,
      taskSource: dto.taskSource,
      publishPullRequest: dto.publishPullRequest ?? true,
    });

    return createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  }

  private maskIdempotencyKey(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const digest = createHash('sha256').update(value, 'utf8').digest('hex');
    return `sha256:${digest.slice(0, 16)}`;
  }

  private async tryReuseIdempotentExecution(
    executionRepository: Repository<Execution>,
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    idempotencyCutoff: Date,
  ): Promise<Execution | null> {
    await executionRepository
      .createQueryBuilder()
      .update(Execution)
      .set({
        idempotencyKey: null,
        requestHash: null,
      })
      .where('user_id = :userId', { userId })
      .andWhere('idempotency_key = :idempotencyKey', { idempotencyKey })
      .andWhere('created_at < :cutoff', { cutoff: idempotencyCutoff })
      .execute();

    const existingExecution = await executionRepository
      .createQueryBuilder('execution')
      .where('execution.user_id = :userId', { userId })
      .andWhere('execution.idempotency_key = :idempotencyKey', {
        idempotencyKey,
      })
      .andWhere('execution.created_at >= :cutoff', {
        cutoff: idempotencyCutoff,
      })
      .orderBy('execution.created_at', 'DESC')
      .getOne();

    if (!existingExecution) {
      return null;
    }

    if (existingExecution.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key reuse with different payload',
      );
    }

    return existingExecution;
  }

  private isIdempotencyUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const queryError = error as QueryFailedError & {
      code?: string;
      constraint?: string;
      message: string;
    };
    const constraint = queryError.constraint?.toLowerCase();
    if (constraint === 'uq_executions_user_idempotency_key') {
      return true;
    }

    const message = queryError.message.toLowerCase();
    return (
      (queryError.code === '23505' &&
        message.includes('idempotency_key') &&
        message.includes('user_id')) ||
      message.includes('uq_executions_user_idempotency_key') ||
      (message.includes('executions.user_id') &&
        message.includes('executions.idempotency_key'))
    );
  }
}
