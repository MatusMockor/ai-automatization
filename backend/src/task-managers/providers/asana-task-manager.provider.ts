import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Asana from 'asana';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderConfigurationError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from '../errors/task-manager-provider.errors';
import {
  AsanaTaskManagerConnectionConfig,
  ProviderProject,
  ProviderTask,
  TaskItemStatus,
  TaskManagerConnectionConfig,
  TaskManagerProvider,
} from '../interfaces/task-manager-provider.interface';

type AsanaApiEnvelope<TData> = {
  data?: TData;
};

type AsanaTaskResponse = {
  gid?: string;
  name?: string;
  notes?: string;
  permalink_url?: string;
  completed?: boolean;
  assignee?: {
    name?: string;
  };
  modified_at?: string;
};

@Injectable()
export class AsanaTaskManagerProvider implements TaskManagerProvider {
  readonly provider = 'asana' as const;

  private static readonly BASE_URL = 'https://app.asana.com/api/1.0';
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.parsePositiveInteger(
      this.configService.get<string>('TASK_MANAGER_HTTP_TIMEOUT_MS', '15000'),
      15000,
    );
  }

  async validateConnection(config: TaskManagerConnectionConfig): Promise<void> {
    const asanaConfig = this.assertAsanaConfig(config);
    const client = this.createClient(asanaConfig.personalAccessToken);

    try {
      await client.users.me();
    } catch (error) {
      this.throwMappedAsanaError(error, 'Unable to validate Asana connection');
    }

    if (asanaConfig.workspaceId) {
      await this.getResource(
        `/workspaces/${encodeURIComponent(asanaConfig.workspaceId)}`,
        asanaConfig.personalAccessToken,
        'Asana workspace not found',
      );
    }

    if (asanaConfig.projectId) {
      await this.getResource(
        `/projects/${encodeURIComponent(asanaConfig.projectId)}`,
        asanaConfig.personalAccessToken,
        'Asana project not found',
      );
    }
  }

  async fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]> {
    const asanaConfig = this.assertAsanaConfig(config);

    const query = new URLSearchParams({
      limit: String(limit),
      opt_fields:
        'gid,name,notes,permalink_url,completed,assignee.name,modified_at',
    });

    const path = asanaConfig.projectId
      ? `/projects/${encodeURIComponent(asanaConfig.projectId)}/tasks`
      : asanaConfig.workspaceId
        ? `/workspaces/${encodeURIComponent(asanaConfig.workspaceId)}/tasks/search`
        : '/tasks';

    if (!asanaConfig.projectId && !asanaConfig.workspaceId) {
      query.set('assignee', 'me');
      query.set('sort_by', 'modified_at');
    }

    const response = await this.requestAsana(
      `${path}?${query.toString()}`,
      asanaConfig.personalAccessToken,
      'Unable to fetch Asana tasks',
    );

    const body = (await response.json()) as AsanaApiEnvelope<
      AsanaTaskResponse[]
    >;
    const tasks = Array.isArray(body.data) ? body.data : [];

    return tasks
      .filter((task): task is AsanaTaskResponse =>
        Boolean(task.gid && task.name),
      )
      .map((task) => ({
        externalId: task.gid ?? '',
        title: task.name ?? '',
        description: task.notes ?? '',
        url: task.permalink_url ?? '',
        status: this.mapStatus(task),
        assignee: task.assignee?.name ?? null,
        updatedAt: this.normalizeTimestamp(task.modified_at),
      }));
  }

  async fetchProjects(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderProject[]> {
    const asanaConfig = this.assertAsanaConfig(config);

    if (!asanaConfig.workspaceId) {
      return [];
    }

    const response = await this.requestAsana(
      `/workspaces/${encodeURIComponent(asanaConfig.workspaceId)}/projects?limit=100&opt_fields=gid,name`,
      asanaConfig.personalAccessToken,
      'Unable to fetch Asana projects',
    );

    const body = (await response.json()) as AsanaApiEnvelope<
      Array<{ gid?: string; name?: string }>
    >;
    const projects = Array.isArray(body.data) ? body.data : [];

    return projects
      .filter((project): project is { gid: string; name: string } =>
        Boolean(project.gid && project.name),
      )
      .map((project) => ({
        id: project.gid,
        name: project.name,
      }));
  }

  private createClient(accessToken: string): any {
    return (Asana as any).Client.create().useAccessToken(accessToken);
  }

  private assertAsanaConfig(
    config: TaskManagerConnectionConfig,
  ): AsanaTaskManagerConnectionConfig {
    if (config.provider !== 'asana') {
      throw new TaskManagerProviderConfigurationError(
        'Asana provider received unsupported connection config',
      );
    }

    return config;
  }

  private async getResource(
    path: string,
    accessToken: string,
    notFoundMessage: string,
  ): Promise<void> {
    await this.requestAsana(
      path,
      accessToken,
      'Unable to fetch Asana resource',
      {
        notFoundMessage,
      },
    );
  }

  private async requestAsana(
    path: string,
    accessToken: string,
    failureMessage: string,
    options: { notFoundMessage?: string } = {},
  ): Promise<Response> {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      response = await fetch(`${AsanaTaskManagerProvider.BASE_URL}${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TaskManagerProviderRequestError(
          'Asana request timed out before completion',
        );
      }
      throw new TaskManagerProviderRequestError(failureMessage);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 || response.status === 403) {
      throw new TaskManagerProviderAuthError(
        'Asana credentials are invalid or do not have required access',
      );
    }

    if (response.status === 404) {
      throw new TaskManagerProviderNotFoundError(
        options.notFoundMessage ?? 'Asana resource not found',
      );
    }

    if (!response.ok) {
      throw new TaskManagerProviderRequestError(
        failureMessage,
        response.status,
      );
    }

    return response;
  }

  private throwMappedAsanaError(error: unknown, message: string): never {
    const statusCode = this.extractStatusCode(error);

    if (statusCode === 401 || statusCode === 403) {
      throw new TaskManagerProviderAuthError(
        'Asana credentials are invalid or do not have required access',
      );
    }

    throw new TaskManagerProviderRequestError(message, statusCode);
  }

  private extractStatusCode(error: unknown): number | undefined {
    const candidate = error as {
      status?: number;
      statusCode?: number;
      response?: { status?: number };
      value?: { status?: number };
    };

    return (
      candidate?.statusCode ??
      candidate?.status ??
      candidate?.response?.status ??
      candidate?.value?.status
    );
  }

  private mapStatus(task: AsanaTaskResponse): TaskItemStatus {
    if (task.completed === true) {
      return 'done';
    }

    return 'open';
  }

  private normalizeTimestamp(value: string | undefined): string {
    if (!value) {
      return new Date(0).toISOString();
    }

    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      return new Date(0).toISOString();
    }

    return timestamp.toISOString();
  }

  private parsePositiveInteger(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }
}
