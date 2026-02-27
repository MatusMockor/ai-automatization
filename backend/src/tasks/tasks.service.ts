import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { RepositoriesService } from '../repositories/repositories.service';
import { TaskManagerConnectionResponseDto } from '../task-managers/dto/task-manager-connection-response.dto';
import { TaskManagersService } from '../task-managers/task-managers.service';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import {
  TaskFeedConnectionErrorDto,
  TaskFeedErrorCode,
  TaskFeedItemDto,
  TaskFeedResponseDto,
} from './dto/task-feed-response.dto';

type TasksErrorMapping = {
  code: TaskFeedErrorCode;
  message: string;
};

type SettledConnectionTasks = {
  connection: TaskManagerConnectionResponseDto;
  result: PromiseSettledResult<TaskFeedItemDto[]>;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly defaultLimit: number;
  private readonly maxLimit: number;

  constructor(
    private readonly taskManagersService: TaskManagersService,
    private readonly repositoriesService: RepositoriesService,
    private readonly configService: ConfigService,
  ) {
    this.defaultLimit = parsePositiveInteger(
      this.configService.get<string>('TASKS_DEFAULT_LIMIT', '100'),
      100,
    );
    this.maxLimit = parsePositiveInteger(
      this.configService.get<string>('TASKS_MAX_LIMIT', '200'),
      200,
    );
  }

  async getTasksForUser(
    userId: string,
    query: GetTasksQueryDto,
  ): Promise<TaskFeedResponseDto> {
    if (query.repoId) {
      await this.repositoriesService.assertOwnedRepository(
        userId,
        query.repoId,
      );
    }

    const connections =
      await this.taskManagersService.listConnectionsForUser(userId);
    const limit = this.resolveLimit(query.limit);
    if (connections.length === 0) {
      return {
        repositoryId: query.repoId ?? null,
        appliedPrefixes: query.prefixes ?? [],
        total: 0,
        items: [],
        errors: [],
      };
    }

    const perConnectionLimit =
      (query.prefixes?.length ?? 0) > 0 ? this.maxLimit : limit;
    const settledConnectionTasks = await this.fetchSettledConnectionTasks(
      userId,
      connections,
      perConnectionLimit,
    );
    const mappedResult = this.mapSettledTasks(settledConnectionTasks);

    let filteredItems = mappedResult.items;
    if ((query.prefixes?.length ?? 0) > 0) {
      filteredItems = this.filterByAdditionalPrefixes(
        filteredItems,
        query.prefixes ?? [],
      );
    }

    const sortedItems = filteredItems.sort((a, b) => this.compareItems(a, b));
    const items = sortedItems.slice(0, limit);

    return {
      repositoryId: query.repoId ?? null,
      appliedPrefixes: query.prefixes ?? [],
      total: items.length,
      items,
      errors: mappedResult.errors,
    };
  }

  private async fetchSettledConnectionTasks(
    userId: string,
    connections: TaskManagerConnectionResponseDto[],
    perConnectionLimit: number,
  ): Promise<SettledConnectionTasks[]> {
    const taskPromises = connections.map(async (connection) => ({
      connection,
      result: await this.getConnectionTasks(
        userId,
        connection.id,
        perConnectionLimit,
      ),
    }));

    return Promise.all(taskPromises);
  }

  private async getConnectionTasks(
    userId: string,
    connectionId: string,
    limit: number,
  ): Promise<PromiseSettledResult<TaskFeedItemDto[]>> {
    try {
      const response = await this.taskManagersService.fetchTasksForConnection(
        userId,
        connectionId,
        limit,
      );

      return {
        status: 'fulfilled',
        value: response.items.map((item) => ({
          id: `${connectionId}:${item.source}:${item.externalId}`,
          connectionId,
          externalId: item.externalId,
          title: item.title,
          description: item.description,
          url: item.url,
          status: item.status,
          assignee: item.assignee,
          source: item.source,
          matchedPrefix: item.matchedPrefix,
          updatedAt: item.updatedAt,
        })),
      };
    } catch (error) {
      return {
        status: 'rejected',
        reason: error,
      };
    }
  }

  private mapSettledTasks(settled: SettledConnectionTasks[]): {
    items: TaskFeedItemDto[];
    errors: TaskFeedConnectionErrorDto[];
  } {
    const items: TaskFeedItemDto[] = [];
    const errors: TaskFeedConnectionErrorDto[] = [];

    for (const entry of settled) {
      if (entry.result.status === 'fulfilled') {
        items.push(...entry.result.value);
        continue;
      }

      errors.push(
        this.mapConnectionError(entry.connection, entry.result.reason),
      );
    }

    return { items, errors };
  }

  private mapConnectionError(
    connection: TaskManagerConnectionResponseDto,
    error: unknown,
  ): TaskFeedConnectionErrorDto {
    if (error instanceof HttpException) {
      const statusCode = error.getStatus();
      const mapping = this.getErrorMapping(statusCode);

      return {
        connectionId: connection.id,
        provider: connection.provider,
        statusCode,
        code: mapping.code,
        message: mapping.message,
      };
    }

    this.logger.error(
      `Unexpected tasks aggregation error for connection ${connection.id}`,
      error instanceof Error ? error.stack : undefined,
    );

    return {
      connectionId: connection.id,
      provider: connection.provider,
      statusCode: 500,
      code: 'unknown',
      message: 'Unable to fetch tasks for this connection',
    };
  }

  private getErrorMapping(statusCode: number): TasksErrorMapping {
    if (statusCode === 400) {
      return {
        code: 'bad_request',
        message: 'Task manager request is invalid for this connection',
      };
    }

    if (statusCode === 404) {
      return {
        code: 'not_found',
        message: 'Task manager resource was not found for this connection',
      };
    }

    if (statusCode === 502) {
      return {
        code: 'bad_gateway',
        message: 'Task manager provider request failed for this connection',
      };
    }

    return {
      code: 'unknown',
      message: 'Unable to fetch tasks for this connection',
    };
  }

  private filterByAdditionalPrefixes(
    items: TaskFeedItemDto[],
    prefixes: string[],
  ): TaskFeedItemDto[] {
    return items.filter((item) => {
      const normalizedTitle = item.title.trimStart().toLowerCase();
      return prefixes.some((prefix) => normalizedTitle.startsWith(prefix));
    });
  }

  private compareItems(a: TaskFeedItemDto, b: TaskFeedItemDto): number {
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }

    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }

    if (a.externalId !== b.externalId) {
      return a.externalId.localeCompare(b.externalId);
    }

    return a.connectionId.localeCompare(b.connectionId);
  }

  private resolveLimit(limit: number | undefined): number {
    const fallbackLimit = Math.min(this.defaultLimit, this.maxLimit);
    if (limit === undefined) {
      return fallbackLimit;
    }

    if (!Number.isFinite(limit)) {
      return fallbackLimit;
    }

    const normalizedLimit = Math.trunc(limit);
    if (normalizedLimit <= 0) {
      return fallbackLimit;
    }

    return Math.min(normalizedLimit, this.maxLimit);
  }
}
