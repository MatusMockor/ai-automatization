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
  ProviderScopeTaskPage,
  ProviderSyncScope,
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

type JiraSearchResponse = {
  issues?: JiraIssue[];
  nextPageToken?: string | null;
};

type JiraErrorPayload = {
  errorMessages?: string[];
  errors?: Record<string, string>;
  message?: string;
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

    try {
      const response = await this.searchIssues(
        client,
        jiraConfig.projectKey
          ? this.buildProjectJql(jiraConfig.projectKey)
          : 'ORDER BY updated DESC',
        limit,
      );

      return this.mapIssuesToTasks(jiraConfig.baseUrl, response.issues);
    } catch (error) {
      this.throwMappedJiraError(error, 'Unable to fetch Jira tasks');
    }
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
            id: project.key ?? project.id ?? '',
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
        .filter(
          (project): project is { id?: string; key?: string; name: string } =>
            Boolean((project.key ?? project.id) && project.name),
        )
        .map((project) => ({
          id: project.key ?? project.id ?? '',
          name: project.name,
        }));
    } catch (error) {
      this.throwMappedJiraError(error, 'Unable to fetch Jira projects');
    }
  }

  async listSyncScopes(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderSyncScope[]> {
    const jiraConfig = this.assertJiraConfig(config);
    const client = this.createClient(jiraConfig);

    if (jiraConfig.projectKey) {
      try {
        const project = (await this.withTimeout(
          client.projects.getProject({
            projectIdOrKey: jiraConfig.projectKey,
          }),
          'Jira project listing request timed out before completion',
        )) as { id?: string; key?: string; name?: string };

        const projectKey = project.key ?? jiraConfig.projectKey;
        const projectName = project.name ?? projectKey;

        return [
          {
            type: 'jira_project',
            id: projectKey,
            name: projectName,
          },
        ];
      } catch (error) {
        this.throwMappedJiraError(
          error,
          `Unable to load Jira project ${jiraConfig.projectKey}`,
        );
      }
    }

    try {
      const response = (await this.withTimeout(
        client.projects.searchProjects({
          maxResults: 100,
        }),
        'Jira projects listing request timed out before completion',
      )) as {
        values?: Array<{ id?: string; key?: string; name?: string }>;
      };

      const values = Array.isArray(response.values) ? response.values : [];
      const scopes = values
        .filter(
          (project): project is { key?: string; id?: string; name: string } =>
            Boolean((project.key ?? project.id) && project.name),
        )
        .map((project) => ({
          type: 'jira_project' as const,
          id: project.key ?? project.id ?? '',
          name: project.name,
        }));

      if (scopes.length > 0) {
        return scopes;
      }

      return [];
    } catch (error) {
      this.throwMappedJiraError(error, 'Unable to list Jira projects');
    }
  }

  async fetchTasksForScope(
    config: TaskManagerConnectionConfig,
    scope: ProviderSyncScope,
    limit: number,
    cursor?: string,
  ): Promise<ProviderScopeTaskPage> {
    const jiraConfig = this.assertJiraConfig(config);
    if (scope.type !== 'jira_project') {
      throw new TaskManagerProviderConfigurationError(
        'Jira provider received unsupported sync scope type',
      );
    }

    try {
      const response = await this.searchIssues(
        this.createClient(jiraConfig),
        this.buildProjectJql(scope.id),
        limit,
        cursor,
      );

      return {
        tasks: this.mapIssuesToTasks(jiraConfig.baseUrl, response.issues),
        nextCursor: response.nextPageToken ?? null,
      };
    } catch (error) {
      this.throwMappedJiraError(
        error,
        `Unable to fetch Jira tasks for project ${scope.id}`,
      );
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
    if (
      error instanceof TaskManagerProviderAuthError ||
      error instanceof TaskManagerProviderNotFoundError ||
      error instanceof TaskManagerProviderRequestError
    ) {
      throw error;
    }

    const statusCode = this.extractStatusCode(error);
    const detail = this.extractErrorDetail(error);
    const formattedMessage = detail ? `${message}: ${detail}` : message;

    if (statusCode === 401 || statusCode === 403) {
      throw new TaskManagerProviderAuthError(
        detail
          ? `Jira credentials are invalid or do not have required access: ${detail}`
          : 'Jira credentials are invalid or do not have required access',
      );
    }

    if (statusCode === 404) {
      throw new TaskManagerProviderNotFoundError(
        detail
          ? `Jira resource not found: ${detail}`
          : 'Jira resource not found',
      );
    }

    throw new TaskManagerProviderRequestError(formattedMessage, statusCode);
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

  private extractErrorDetail(error: unknown): string | null {
    const candidate = error as {
      message?: string;
      response?: JiraErrorPayload & {
        data?: JiraErrorPayload;
      };
      cause?: {
        message?: string;
        response?: {
          data?: JiraErrorPayload;
        };
      };
    };

    const details = new Set<string>();
    const responsePayloads = [
      candidate?.response,
      candidate?.response?.data,
      candidate?.cause?.response?.data,
    ].filter((payload): payload is JiraErrorPayload => Boolean(payload));

    for (const payload of responsePayloads) {
      for (const message of payload.errorMessages ?? []) {
        if (message.trim()) {
          details.add(message.trim());
        }
      }

      for (const message of Object.values(payload.errors ?? {})) {
        if (message.trim()) {
          details.add(message.trim());
        }
      }

      if (payload.message?.trim()) {
        details.add(payload.message.trim());
      }
    }

    if (details.size === 0 && candidate?.message?.trim()) {
      details.add(candidate.message.trim());
    }

    if (details.size === 0 && candidate?.cause?.message?.trim()) {
      details.add(candidate.cause.message.trim());
    }

    if (details.size === 0) {
      return null;
    }

    return this.sanitizeErrorDetail([...details].join('; ')).slice(0, 1000);
  }

  private sanitizeErrorDetail(detail: string): string {
    return detail
      .replace(
        /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?=[\s,;:"')\]}]|$)/gi,
        '[redacted-email]',
      )
      .replace(
        /\bBearer\s+[A-Za-z0-9._-]+(?=[\s,;:"')\]}]|$)/gi,
        'Bearer [redacted]',
      )
      .replace(
        /\bBasic\s+[A-Za-z0-9+/=]+(?=[\s,;:"')\]}]|$)/gi,
        'Basic [redacted]',
      );
  }

  private buildProjectJql(projectKey: string): string {
    return `project = "${this.escapeJqlValue(projectKey)}" ORDER BY updated DESC`;
  }

  private async searchIssues(
    client: Version3Client,
    jql: string,
    maxResults: number,
    nextPageToken?: string,
  ): Promise<JiraSearchResponse> {
    return (await this.withTimeout(
      client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
        jql,
        nextPageToken,
        maxResults,
        fields: ['summary', 'description', 'status', 'assignee', 'updated'],
      }),
      'Jira task fetch request timed out before completion',
    )) as JiraSearchResponse;
  }

  private mapIssuesToTasks(
    baseUrl: string,
    issues: JiraIssue[] | undefined,
  ): ProviderTask[] {
    const normalizedIssues = Array.isArray(issues) ? issues : [];

    return normalizedIssues
      .filter((issue): issue is JiraIssue => Boolean(issue.key && issue.fields))
      .map((issue) => ({
        externalId: issue.key ?? issue.id ?? '',
        title: issue.fields?.summary ?? '',
        description: this.stringifyDescription(issue.fields?.description),
        url: this.buildIssueUrl(baseUrl, issue.key),
        status: this.mapStatus(issue.fields?.status?.name),
        assignee: issue.fields?.assignee?.displayName ?? null,
        updatedAt: this.normalizeTimestamp(issue.fields?.updated),
      }));
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
