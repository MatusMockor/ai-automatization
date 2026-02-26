import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Version3Client } from 'jira.js';
import { parsePositiveInteger } from '../../common/utils/parse.utils';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderConfigurationError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from '../errors/task-manager-provider.errors';
import {
  JiraBasicTaskManagerConnectionConfig,
  JiraBearerTaskManagerConnectionConfig,
  ProviderProject,
  ProviderTask,
  TaskItemStatus,
  TaskManagerConnectionConfig,
  TaskManagerProvider,
} from '../interfaces/task-manager-provider.interface';

type JiraIssue = {
  id?: string;
  key?: string;
  self?: string;
  fields?: {
    summary?: string;
    description?: unknown;
    status?: {
      name?: string;
    };
    assignee?: {
      displayName?: string;
    };
    updated?: string;
  };
};

@Injectable()
export class JiraTaskManagerProvider implements TaskManagerProvider {
  readonly provider = 'jira' as const;

  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = parsePositiveInteger(
      this.configService.get<string>('TASK_MANAGER_HTTP_TIMEOUT_MS', '15000'),
      15000,
    );
  }

  async validateConnection(config: TaskManagerConnectionConfig): Promise<void> {
    const jiraConfig = this.assertJiraConfig(config);
    const client = this.createClient(jiraConfig);

    try {
      await this.withTimeout(
        client.myself.getCurrentUser(),
        'Jira validation request timed out before completion',
      );
    } catch (error) {
      this.throwMappedJiraError(error, 'Unable to validate Jira connection');
    }

    if (jiraConfig.projectKey) {
      try {
        await this.withTimeout(
          client.projects.getProject({
            projectIdOrKey: jiraConfig.projectKey,
          }),
          'Jira project validation request timed out before completion',
        );
      } catch (error) {
        const statusCode = this.extractStatusCode(error);
        if (statusCode === 404) {
          throw new TaskManagerProviderNotFoundError('Jira project not found');
        }

        this.throwMappedJiraError(
          error,
          'Unable to validate Jira project scope',
        );
      }
    }
  }

  async fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]> {
    const jiraConfig = this.assertJiraConfig(config);
    const client = this.createClient(jiraConfig);

    const jql = jiraConfig.projectKey
      ? `project = "${this.escapeJqlValue(jiraConfig.projectKey)}" ORDER BY updated DESC`
      : 'ORDER BY updated DESC';

    let response: { issues?: JiraIssue[] };

    try {
      response = (await this.withTimeout(
        client.issueSearch.searchForIssuesUsingJqlPost({
          jql,
          maxResults: limit,
          fields: ['summary', 'description', 'status', 'assignee', 'updated'],
        }),
        'Jira task fetch request timed out before completion',
      )) as { issues?: JiraIssue[] };
    } catch (error) {
      this.throwMappedJiraError(error, 'Unable to fetch Jira tasks');
    }

    const issues = Array.isArray(response.issues) ? response.issues : [];

    return issues
      .filter((issue): issue is JiraIssue => Boolean(issue.key && issue.fields))
      .map((issue) => ({
        externalId: issue.key ?? issue.id ?? '',
        title: issue.fields?.summary ?? '',
        description: this.stringifyDescription(issue.fields?.description),
        url: this.buildIssueUrl(jiraConfig.baseUrl, issue.key),
        status: this.mapStatus(issue.fields?.status?.name),
        assignee: issue.fields?.assignee?.displayName ?? null,
        updatedAt: this.normalizeTimestamp(issue.fields?.updated),
      }));
  }

  async fetchProjects(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderProject[]> {
    const jiraConfig = this.assertJiraConfig(config);
    const client = this.createClient(jiraConfig);

    if (jiraConfig.projectKey) {
      try {
        const project = (await this.withTimeout(
          client.projects.getProject({
            projectIdOrKey: jiraConfig.projectKey,
          }),
          'Jira project fetch request timed out before completion',
        )) as { id?: string; key?: string; name?: string };

        if (!project?.key || !project?.name) {
          return [];
        }

        return [
          {
            id: project.id ?? project.key,
            name: project.name,
          },
        ];
      } catch (error) {
        this.throwMappedJiraError(error, 'Unable to fetch Jira project');
      }
    }

    try {
      const response = (await this.withTimeout(
        client.projects.searchProjects({
          maxResults: 100,
        }),
        'Jira projects fetch request timed out before completion',
      )) as {
        values?: Array<{ id?: string; key?: string; name?: string }>;
      };

      const values = Array.isArray(response.values) ? response.values : [];
      return values
        .filter((project): project is { id: string; name: string } =>
          Boolean(project.id && project.name),
        )
        .map((project) => ({
          id: project.id,
          name: project.name,
        }));
    } catch (error) {
      this.throwMappedJiraError(error, 'Unable to fetch Jira projects');
    }
  }

  private createClient(
    config:
      | JiraBasicTaskManagerConnectionConfig
      | JiraBearerTaskManagerConnectionConfig,
  ): Version3Client {
    if (config.authMode === 'basic') {
      return new Version3Client({
        host: config.baseUrl,
        authentication: {
          basic: {
            email: config.email,
            apiToken: config.apiToken,
          },
        },
      });
    }

    return new Version3Client({
      host: config.baseUrl,
      authentication: {
        oauth2: {
          accessToken: config.accessToken,
        },
      },
    });
  }

  private assertJiraConfig(
    config: TaskManagerConnectionConfig,
  ):
    | JiraBasicTaskManagerConnectionConfig
    | JiraBearerTaskManagerConnectionConfig {
    if (config.provider !== 'jira') {
      throw new TaskManagerProviderConfigurationError(
        'Jira provider received unsupported connection config',
      );
    }

    return config;
  }

  private throwMappedJiraError(error: unknown, message: string): never {
    const statusCode = this.extractStatusCode(error);

    if (statusCode === 401 || statusCode === 403) {
      throw new TaskManagerProviderAuthError(
        'Jira credentials are invalid or do not have required access',
      );
    }

    if (statusCode === 404) {
      throw new TaskManagerProviderNotFoundError('Jira resource not found');
    }

    throw new TaskManagerProviderRequestError(message, statusCode);
  }

  private extractStatusCode(error: unknown): number | undefined {
    const candidate = error as {
      status?: number;
      statusCode?: number;
      response?: { status?: number };
      cause?: { status?: number };
    };

    return (
      candidate?.statusCode ??
      candidate?.status ??
      candidate?.response?.status ??
      candidate?.cause?.status
    );
  }

  private mapStatus(statusName: string | undefined): TaskItemStatus {
    const normalized = (statusName ?? '').trim().toLowerCase();

    if (normalized.length === 0) {
      return 'unknown';
    }

    if (
      normalized.includes('done') ||
      normalized.includes('closed') ||
      normalized.includes('resolved')
    ) {
      return normalized.includes('closed') ? 'closed' : 'done';
    }

    if (
      normalized.includes('progress') ||
      normalized.includes('review') ||
      normalized.includes('develop')
    ) {
      return 'in_progress';
    }

    if (
      normalized.includes('open') ||
      normalized.includes('to do') ||
      normalized.includes('todo') ||
      normalized.includes('backlog')
    ) {
      return 'open';
    }

    return 'unknown';
  }

  private stringifyDescription(description: unknown): string {
    if (!description) {
      return '';
    }

    if (typeof description === 'string') {
      return description;
    }

    try {
      return JSON.stringify(description);
    } catch {
      return '';
    }
  }

  private buildIssueUrl(baseUrl: string, issueKey: string | undefined): string {
    if (!issueKey) {
      return '';
    }

    return `${baseUrl}/browse/${issueKey}`;
  }

  private escapeJqlValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMessage: string,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new TaskManagerProviderRequestError(timeoutMessage));
          }, this.timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
