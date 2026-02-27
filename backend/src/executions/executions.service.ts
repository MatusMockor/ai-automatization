import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { access } from 'fs/promises';
import { join } from 'path';
import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EntityManager, In, Repository } from 'typeorm';
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
import { ExecutionStreamHub } from './execution-stream.hub';
import { ExecutionRuntimeManager } from './execution-runtime.manager';
import type { ExecutionAction } from './interfaces/execution.types';

@Injectable()
export class ExecutionsService {
  private readonly defaultTimeoutMs: number;
  private readonly minTimeoutMs = 60000;
  private readonly maxTimeoutMs = 7200000;
  private readonly maxConcurrentPerUser: number;
  private readonly defaultListLimit = 50;
  private readonly maxListLimit = 200;

  constructor(
    @InjectRepository(Execution)
    private readonly executionsRepository: Repository<Execution>,
    private readonly repositoriesService: RepositoriesService,
    private readonly settingsService: SettingsService,
    private readonly runtimeManager: ExecutionRuntimeManager,
    private readonly streamHub: ExecutionStreamHub,
    configService: ConfigService,
  ) {
    this.defaultTimeoutMs = parsePositiveInteger(
      configService.get<string>('EXECUTION_DEFAULT_TIMEOUT_MS', '1800000'),
      1800000,
    );
    this.maxConcurrentPerUser = parsePositiveInteger(
      configService.get<string>('EXECUTION_MAX_CONCURRENT_PER_USER', '2'),
      2,
    );
  }

  async createForUser(
    userId: string,
    dto: CreateExecutionDto,
  ): Promise<ExecutionSummaryResponseDto> {
    const repository = await this.getOwnedRepository(userId, dto.repositoryId);
    await this.assertRepositoryRunnable(repository);

    const claudeApiKey =
      await this.settingsService.getClaudeApiKeyForUserOrNull(userId);
    if (!claudeApiKey) {
      throw new BadRequestException(
        'Claude API key is not configured in user settings',
      );
    }

    await this.ensureRunnerAvailable();

    const timeoutMs = await this.resolveExecutionTimeoutMs(userId);
    const prompt = this.buildPrompt(dto.action, dto);

    const savedExecution = await this.executionsRepository.manager.transaction(
      async (manager) => {
        await this.assertConcurrentExecutionLimitWithinTransaction(
          manager,
          userId,
        );

        const executionRepository = manager.getRepository(Execution);
        const execution = executionRepository.create({
          userId,
          repositoryId: repository.id,
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

        return executionRepository.save(execution);
      },
    );

    try {
      await this.runtimeManager.startExecution({
        executionId: savedExecution.id,
        action: savedExecution.action,
        prompt: savedExecution.prompt,
        cwd: repository.localPath,
        anthropicApiKey: claudeApiKey,
        timeoutMs,
      });
    } catch (error) {
      await this.executionsRepository.update(
        { id: savedExecution.id },
        {
          status: 'failed',
          automationStatus: 'failed',
          automationErrorMessage: 'Execution runtime startup failed',
          automationCompletedAt: new Date(),
          finishedAt: new Date(),
          errorMessage: 'Failed to start execution process',
        },
      );
      throw new InternalServerErrorException('Failed to start execution');
    }

    const createdExecution = await this.getOwnedExecution(
      savedExecution.id,
      userId,
    );
    return this.toSummaryResponse(createdExecution);
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
  ): Promise<Observable<MessageEvent>> {
    const execution = await this.getOwnedExecution(executionId, userId);
    const isTerminalStatus =
      execution.status === 'completed' ||
      execution.status === 'failed' ||
      execution.status === 'cancelled';
    const completeImmediately =
      isTerminalStatus && !this.runtimeManager.isExecutionActive(execution.id);

    const snapshotEvent: ExecutionStreamEventDto = {
      type: 'snapshot',
      payload: {
        type: 'snapshot',
        executionId: execution.id,
        status: execution.status,
        automationStatus: execution.automationStatus,
        output: execution.output,
        outputTruncated: execution.outputTruncated,
      },
    };

    return this.streamHub.createStream(
      execution.id,
      snapshotEvent,
      completeImmediately,
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
    if (!cancelled && execution.status !== 'pending') {
      throw new ConflictException('Execution is not active');
    }

    if (!cancelled && execution.status === 'pending') {
      await this.executionsRepository.update(
        { id: execution.id },
        {
          status: 'cancelled',
          automationStatus: 'not_applicable',
          automationCompletedAt: new Date(),
          automationErrorMessage: 'Execution cancelled',
          finishedAt: new Date(),
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

  private async ensureRunnerAvailable(): Promise<void> {
    try {
      await this.runtimeManager.ensureRunnerAvailable();
    } catch {
      throw new BadRequestException(
        'Claude CLI is not available on the backend runtime',
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
}
