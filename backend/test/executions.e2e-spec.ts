import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { execFile } from 'child_process';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { promisify } from 'util';
import { DataSource } from 'typeorm';
import {
  CLAUDE_CLI_RUNNER,
  GITHUB_PULL_REQUESTS_GATEWAY,
  GIT_PUBLICATION_CLIENT,
} from '../src/executions/constants/executions.tokens';
import { Execution } from '../src/executions/entities/execution.entity';
import type {
  ClaudeCliProcess,
  ClaudeCliRunner,
  ClaudeCliStartOptions,
} from '../src/executions/interfaces/claude-cli-runner.interface';
import type {
  ExecutionAction,
  TaskSource,
} from '../src/executions/interfaces/execution.types';
import type {
  GitCheckCommandResult,
  GitPublicationClient,
  GitPushOptions,
} from '../src/executions/interfaces/git-publication-client.interface';
import type {
  CreatePullRequestInput,
  CreatedPullRequest,
  GithubPullRequestsGateway,
} from '../src/executions/interfaces/github-pull-requests-gateway.interface';
import { ManagedRepository } from '../src/repositories/entities/repository.entity';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { ExecutionFactory } from './factories/execution.factory';
import { RepositoryFactory } from './factories/repository.factory';
import { UserFactory } from './factories/user.factory';
import { UserSettingsFactory } from './factories/user-settings.factory';
import { createTestApp } from './helpers/test-app.factory';

const execFileAsync = promisify(execFile);
const TEST_REPOSITORIES_BASE_PATH = `/tmp/ai-automation-repositories-test-executions-${process.env.JEST_WORKER_ID ?? '0'}-${process.pid}`;

type LoginSession = {
  accessToken: string;
  userId: string;
};

type RunnerBehavior =
  | {
      kind: 'success';
      stdout?: string[];
      stderr?: string[];
      delayMs?: number;
    }
  | {
      kind: 'failure';
      stdout?: string[];
      stderr?: string[];
      delayMs?: number;
      exitCode?: number;
    }
  | {
      kind: 'hang';
      stdout?: string[];
      stderr?: string[];
      delayMs?: number;
    };

class FakeClaudeCliProcess implements ClaudeCliProcess {
  readonly pid = faker.number.int({ min: 2000, max: 9999 });

  private readonly stdoutListeners = new Set<(chunk: string) => void>();
  private readonly stderrListeners = new Set<(chunk: string) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly exitListeners = new Set<
    (info: { code: number | null; signal: NodeJS.Signals | null }) => void
  >();
  private exited = false;
  private timerIds: NodeJS.Timeout[] = [];

  constructor(private readonly behavior: RunnerBehavior) {
    this.scheduleBehavior();
  }

  onStdout(listener: (chunk: string) => void): void {
    this.stdoutListeners.add(listener);
  }

  onStderr(listener: (chunk: string) => void): void {
    this.stderrListeners.add(listener);
  }

  onError(listener: (error: Error) => void): void {
    this.errorListeners.add(listener);
  }

  onExit(
    listener: (info: {
      code: number | null;
      signal: NodeJS.Signals | null;
    }) => void,
  ): void {
    this.exitListeners.add(listener);
  }

  kill(signal: NodeJS.Signals): void {
    if (this.exited) {
      return;
    }

    this.emitExit({ code: null, signal });
  }

  private scheduleBehavior(): void {
    const delayMs = this.behavior.delayMs ?? 10;

    if (this.behavior.stdout?.length) {
      for (const [index, chunk] of this.behavior.stdout.entries()) {
        this.timerIds.push(
          setTimeout(
            () => {
              for (const listener of this.stdoutListeners) {
                listener(chunk);
              }
            },
            delayMs + index * 5,
          ),
        );
      }
    }

    if (this.behavior.stderr?.length) {
      for (const [index, chunk] of this.behavior.stderr.entries()) {
        this.timerIds.push(
          setTimeout(
            () => {
              for (const listener of this.stderrListeners) {
                listener(chunk);
              }
            },
            delayMs + index * 5,
          ),
        );
      }
    }

    if (this.behavior.kind === 'hang') {
      return;
    }

    this.timerIds.push(
      setTimeout(() => {
        if (this.behavior.kind === 'success') {
          this.emitExit({ code: 0, signal: null });
          return;
        }

        this.emitExit({
          code: this.behavior.exitCode ?? 1,
          signal: null,
        });
      }, delayMs + 20),
    );
  }

  private emitExit(info: {
    code: number | null;
    signal: NodeJS.Signals | null;
  }): void {
    if (this.exited) {
      return;
    }

    this.exited = true;
    for (const timerId of this.timerIds) {
      clearTimeout(timerId);
    }

    for (const listener of this.exitListeners) {
      listener(info);
    }
  }
}

class FakeClaudeCliRunner implements ClaudeCliRunner {
  private available = true;
  private readonly behaviorQueue: RunnerBehavior[] = [];

  setAvailable(available: boolean): void {
    this.available = available;
  }

  enqueueBehavior(behavior: RunnerBehavior): void {
    this.behaviorQueue.push(behavior);
  }

  reset(): void {
    this.available = true;
    this.behaviorQueue.length = 0;
  }

  async ensureAvailable(): Promise<void> {
    if (!this.available) {
      throw new Error('Claude CLI is not available');
    }
  }

  async start(_options: ClaudeCliStartOptions): Promise<ClaudeCliProcess> {
    const behavior: RunnerBehavior = this.behaviorQueue.shift() ?? {
      kind: 'success',
      stdout: ['Execution completed'],
      delayMs: 10,
    };

    return new FakeClaudeCliProcess(behavior);
  }
}

class FakeGitPublicationClient implements GitPublicationClient {
  private remoteBranches = new Set<string>();
  private hasChangesResult = true;
  private pushFailuresRemaining = 0;
  private checkCommandResult: GitCheckCommandResult = {
    success: true,
    stdout: '',
    stderr: '',
  };
  private headSha = 'abc123def456';
  public lastCommitMessage: string | null = null;
  public lastPushedBranch: string | null = null;

  reset(): void {
    this.remoteBranches = new Set<string>();
    this.hasChangesResult = true;
    this.pushFailuresRemaining = 0;
    this.checkCommandResult = {
      success: true,
      stdout: '',
      stderr: '',
    };
    this.headSha = 'abc123def456';
    this.lastCommitMessage = null;
    this.lastPushedBranch = null;
  }

  seedRemoteBranch(branchName: string): void {
    this.remoteBranches.add(branchName);
  }

  setHasChangesResult(hasChanges: boolean): void {
    this.hasChangesResult = hasChanges;
  }

  setPushFailuresRemaining(value: number): void {
    this.pushFailuresRemaining = value;
  }

  setCheckCommandResult(result: GitCheckCommandResult): void {
    this.checkCommandResult = result;
  }

  setHeadSha(sha: string): void {
    this.headSha = sha;
  }

  async branchExistsRemote(
    _localPath: string,
    branchName: string,
    _cloneUrl: string,
    _accessToken: string,
  ): Promise<boolean> {
    return this.remoteBranches.has(branchName);
  }

  async checkoutNewBranch(
    _localPath: string,
    _branchName: string,
  ): Promise<void> {}

  async hasChanges(_localPath: string): Promise<boolean> {
    return this.hasChangesResult;
  }

  async addAll(_localPath: string): Promise<void> {}

  async commit(
    _localPath: string,
    message: string,
    _authorName: string,
    _authorEmail: string,
  ): Promise<void> {
    this.lastCommitMessage = message;
  }

  async getHeadSha(_localPath: string): Promise<string> {
    return this.headSha;
  }

  async push(options: GitPushOptions): Promise<void> {
    if (this.pushFailuresRemaining > 0) {
      this.pushFailuresRemaining -= 1;
      throw new Error('Simulated push failure');
    }

    this.remoteBranches.add(options.branchName);
    this.lastPushedBranch = options.branchName;
  }

  async runCheckCommand(
    _localPath: string,
    _command: string,
  ): Promise<GitCheckCommandResult> {
    return this.checkCommandResult;
  }

  async checkoutDefaultAndClean(
    _localPath: string,
    _defaultBranch: string,
    _cloneUrl: string,
    _accessToken: string,
  ): Promise<void> {}

  async deleteLocalBranch(
    _localPath: string,
    _branchName: string,
  ): Promise<void> {}
}

class FakeGithubPullRequestsGateway implements GithubPullRequestsGateway {
  private failuresRemaining = 0;
  public lastInput: CreatePullRequestInput | null = null;
  public createdPullRequests: CreatedPullRequest[] = [];

  reset(): void {
    this.failuresRemaining = 0;
    this.lastInput = null;
    this.createdPullRequests = [];
  }

  setFailuresRemaining(value: number): void {
    this.failuresRemaining = value;
  }

  async createPullRequest(
    input: CreatePullRequestInput,
  ): Promise<CreatedPullRequest> {
    this.lastInput = input;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('Simulated PR creation failure');
    }

    const pullRequest: CreatedPullRequest = {
      number: 101 + this.createdPullRequests.length,
      url: `https://github.com/${input.fullName}/pull/${101 + this.createdPullRequests.length}`,
      title: input.title,
    };
    this.createdPullRequests.push(pullRequest);
    return pullRequest;
  }
}

describe('Executions (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let userSettingsFactory: UserSettingsFactory;
  let repositoryFactory: RepositoryFactory;
  let executionFactory: ExecutionFactory;
  let fakeRunner: FakeClaudeCliRunner;
  let fakeGitPublicationClient: FakeGitPublicationClient;
  let fakeGithubPullRequestsGateway: FakeGithubPullRequestsGateway;

  beforeAll(async () => {
    fakeRunner = new FakeClaudeCliRunner();
    fakeGitPublicationClient = new FakeGitPublicationClient();
    fakeGithubPullRequestsGateway = new FakeGithubPullRequestsGateway();
    const context = await createTestApp({
      env: {
        REPOSITORIES_BASE_PATH: TEST_REPOSITORIES_BASE_PATH,
        EXECUTION_DEFAULT_TIMEOUT_MS: '40',
        EXECUTION_MAX_CONCURRENT_PER_USER: '2',
        EXECUTION_OUTPUT_MAX_BYTES: '400',
        EXECUTION_GRACEFUL_STOP_MS: '20',
        EXECUTION_AUTOPR_RETRY_COUNT: '3',
        EXECUTION_AUTOPR_RETRY_BACKOFF_MS: '1',
        EXECUTION_AUTOPR_BRANCH_PREFIX: 'feature/ai',
        EXECUTION_GIT_AUTHOR_NAME: 'Automation Bot',
        EXECUTION_GIT_AUTHOR_EMAIL: 'automation@local',
        EXECUTION_PRE_PR_CHECK_COMMAND: '',
      },
      providerOverrides: [
        {
          token: CLAUDE_CLI_RUNNER,
          value: fakeRunner,
        },
        {
          token: GIT_PUBLICATION_CLIENT,
          value: fakeGitPublicationClient,
        },
        {
          token: GITHUB_PULL_REQUESTS_GATEWAY,
          value: fakeGithubPullRequestsGateway,
        },
      ],
    });

    app = context.app;
    dataSource = context.dataSource;
    userFactory = new UserFactory(dataSource);
    userSettingsFactory = new UserSettingsFactory(
      dataSource,
      app.get(EncryptionService),
    );
    repositoryFactory = new RepositoryFactory(
      dataSource,
      TEST_REPOSITORIES_BASE_PATH,
    );
    executionFactory = new ExecutionFactory(dataSource);
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    await repositoryFactory.resetWorkspace();
    fakeRunner.reset();
    fakeGitPublicationClient.reset();
    fakeGithubPullRequestsGateway.reset();
    process.env.EXECUTION_PRE_PR_CHECK_COMMAND = '';
  });

  afterAll(async () => {
    await rm(TEST_REPOSITORIES_BASE_PATH, { recursive: true, force: true });
    await app.close();
  });

  it('POST /api/executions should return 401 without JWT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      payload: buildCreateExecutionPayload(faker.string.uuid()),
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /api/executions should create execution and publish branch/commit/PR metadata for fix action', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['line 1\n', 'line 2\n'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });

    expect(response.statusCode).toBe(201);
    const created = response.json<{
      id: string;
      status: string;
      publishPullRequest: boolean;
      requireCodeChanges: boolean;
      implementationAttempts: number;
    }>();
    expect(['running', 'pending', 'completed']).toContain(created.status);
    expect(created.publishPullRequest).toBe(true);
    expect(created.requireCodeChanges).toBe(true);
    expect(created.implementationAttempts).toBe(1);

    const execution = await waitForExecution(
      created.id,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );
    expect(execution.publishPullRequest).toBe(true);
    expect(execution.requireCodeChanges).toBe(true);
    expect(execution.implementationAttempts).toBe(1);
    expect(execution.branchName).toBe('feature/ai/task-0001');
    expect(execution.commitSha).toBe('abc123def456');
    expect(execution.pullRequestUrl).toContain('/pull/');
    expect(execution.automationAttempts).toBe(1);
    expect(fakeGitPublicationClient.lastCommitMessage).not.toMatch(
      /\b(ai|anthropic|claude|codex)\b/i,
    );
    expect(fakeGithubPullRequestsGateway.lastInput?.title).not.toMatch(
      /\b(ai|anthropic|claude|codex)\b/i,
    );
  });

  it('POST /api/executions should accept manual taskSource', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['manual task processed'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'fix', {
        taskId: 'manual-task-1',
        taskExternalId: 'manual-task-1',
        taskTitle: 'Manual task execution',
        taskSource: 'manual',
      }),
    });

    expect(response.statusCode).toBe(201);
    const created = response.json<{ id: string }>();

    const execution = await waitForExecution(
      created.id,
      (current) => current.status === 'completed',
    );

    expect(execution.taskSource).toBe('manual');
  });

  it('POST /api/executions should return 400 when claudeOauthToken is missing', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId, {
      claudeOauthToken: null,
    });
    const repository = await createRunnableRepository(session.userId);

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /api/executions should deduplicate same Idempotency-Key and payload within 24h', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);
    const payload = buildCreateExecutionPayload(repository.id);
    const idempotencyKey = faker.string.uuid();

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['idempotent run'],
      delayMs: 10,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstExecution = first.json<{
      id: string;
      idempotencyKey: string | null;
      orchestrationState: string;
    }>();
    expect(firstExecution.idempotencyKey).toMatch(/^sha256:/);
    expect(['queued', 'running', 'done']).toContain(
      firstExecution.orchestrationState,
    );

    const second = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    expect(second.statusCode).toBe(200);
    const secondExecution = second.json<{ id: string }>();
    expect(secondExecution.id).toBe(firstExecution.id);
  });

  it('POST /api/executions should return 409 when Idempotency-Key is reused with different payload', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);
    const idempotencyKey = faker.string.uuid();

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['idempotent conflict run'],
      delayMs: 10,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload: buildCreateExecutionPayload(repository.id, 'feature'),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json<{ message: string }>().message).toContain(
      'Idempotency key reuse with different payload',
    );
  });

  it('POST /api/executions should allow Idempotency-Key reuse after 24h window', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);
    const idempotencyKey = faker.string.uuid();
    const payload = buildCreateExecutionPayload(repository.id);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['initial idempotent execution'],
      delayMs: 10,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstExecutionId = first.json<{ id: string }>().id;
    await waitForExecution(
      firstExecutionId,
      (current) =>
        current.status === 'completed' || current.status === 'failed',
    );

    const staleTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await dataSource.getRepository(Execution).update(
      { id: firstExecutionId },
      {
        createdAt: staleTimestamp,
        updatedAt: staleTimestamp,
      },
    );

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['second idempotent execution'],
      delayMs: 10,
    });

    const second = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json<{ id: string }>().id).not.toBe(firstExecutionId);
  });

  it('POST /api/executions should mark automation failed when GitHub token is missing', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId, {
      githubToken: null,
    });
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['done'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'failed' && current.automationStatus === 'failed',
    );

    expect(execution.automationErrorMessage).toContain('GitHub token missing');
  });

  it('POST /api/executions should publish plan action using execution report artifact', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['plan output'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'plan'),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );

    expect(execution.branchName).toBe('feature/ai/task-0001');
    expect(execution.pullRequestUrl).toContain('/pull/');
    expect(execution.automationErrorMessage).toBeNull();
    const reportContents = await waitForFileContents(
      `${repository.localPath}/.ai/executions/${execution.id}.md`,
    );
    expect(reportContents).toContain('# Execution Report');
    expect(reportContents).toContain('Action: plan');
  });

  it('POST /api/executions should complete silent plan execution without hanging', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'plan'),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );

    expect(execution.output).toBe('');
    expect(execution.finishedAt).not.toBeNull();
  });

  it('POST /api/executions should fail plan execution and reach terminal state without hanging', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'failure',
      delayMs: 10,
      exitCode: 1,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'plan'),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) => current.status === 'failed',
    );

    expect(execution.errorMessage).toContain('Execution process failed');
    expect(execution.finishedAt).not.toBeNull();
  });

  it('POST /api/executions should publish report fallback when repository diff is empty and requireCodeChanges is false', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['noop'],
      delayMs: 10,
    });
    fakeGitPublicationClient.setHasChangesResult(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'fix', {
        requireCodeChanges: false,
      }),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );

    expect(execution.pullRequestUrl).toContain('/pull/');
    const reportContents = await waitForFileContents(
      `${repository.localPath}/.ai/executions/${execution.id}.md`,
    );
    expect(reportContents).toContain('# Execution Report');
  });

  it('POST /api/executions should retry no-diff feature/fix and fail with no_changes after max attempts', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['noop'],
      delayMs: 10,
    });
    fakeGitPublicationClient.setHasChangesResult(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'feature'),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'failed' &&
        current.automationStatus === 'no_changes',
    );

    expect(execution.publishPullRequest).toBe(true);
    expect(execution.requireCodeChanges).toBe(true);
    expect(execution.implementationAttempts).toBe(3);
    expect(execution.pullRequestUrl).toBeNull();
    expect(execution.automationErrorMessage).toContain(
      'No code changes produced after 3 attempts',
    );
  });

  it('POST /api/executions should disable publication when publishPullRequest is false', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['done'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'fix', {
        publishPullRequest: false,
      }),
    });
    expect(response.statusCode).toBe(201);
    const created = response.json<{
      id: string;
      publishPullRequest: boolean;
    }>();
    expect(created.publishPullRequest).toBe(false);

    const executionId = created.id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'not_applicable',
    );

    expect(execution.publishPullRequest).toBe(false);
    expect(execution.branchName).toBeNull();
    expect(execution.pullRequestUrl).toBeNull();
    expect(execution.automationErrorMessage).toContain('disabled');
    expect(fakeGitPublicationClient.lastPushedBranch).toBeNull();
    expect(fakeGithubPullRequestsGateway.lastInput).toBeNull();
  });

  it('POST /api/executions should create suffixed branch when preferred branch already exists remotely', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['change'],
      delayMs: 10,
    });
    fakeGitPublicationClient.seedRemoteBranch('feature/ai/task-0001');

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );

    expect(execution.branchName).toBe('feature/ai/task-0001-2');
  });

  it('POST /api/executions should fail automation after 3 retries when push/PR keeps failing', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['change'],
      delayMs: 10,
    });
    fakeGithubPullRequestsGateway.setFailuresRemaining(3);

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'failed' && current.automationStatus === 'failed',
    );

    expect(execution.automationAttempts).toBe(3);
  });

  it('POST /api/executions should use pull request template from target cloned repository', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    const templateDirectory = `${repository.localPath}/.github`;
    await mkdir(templateDirectory, { recursive: true });
    await writeFile(
      `${templateDirectory}/pull_request_template.md`,
      '## Checklist\n- [ ] tested\n',
      'utf8',
    );

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['changed'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );

    expect(fakeGithubPullRequestsGateway.lastInput?.body?.trim()).toBe(
      '## Checklist\n- [ ] tested',
    );
  });

  it('POST /api/executions should fallback to Claude contract when PR template is missing', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['PR_TITLE: Bot update\nPR_BODY: Body line\n'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );

    expect(fakeGithubPullRequestsGateway.lastInput?.title).toContain(
      'Bot update',
    );
    expect(fakeGithubPullRequestsGateway.lastInput?.body).toContain(
      'Body line',
    );
  });

  it('POST /api/executions should fail automation when pre-PR command fails', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    process.env.EXECUTION_PRE_PR_CHECK_COMMAND = 'npm run format:check';
    fakeGitPublicationClient.setCheckCommandResult({
      success: false,
      stdout: '',
      stderr: 'format failed',
    });
    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['changed'],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    const execution = await waitForExecution(
      executionId,
      (current) =>
        current.status === 'failed' && current.automationStatus === 'failed',
    );

    expect(execution.automationErrorMessage).toContain('Pre-PR checks failed');
  });

  it('POST /api/executions should sanitize forbidden terms from commit and PR content', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: [
        'PR_TITLE: Claude AI Codex update\\nPR_BODY: anthropic notes\\n',
      ],
      delayMs: 10,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id, 'fix', {
        taskTitle: 'Claude AI Codex update',
      }),
    });
    expect(response.statusCode).toBe(201);

    const executionId = response.json<{ id: string }>().id;
    await waitForExecution(
      executionId,
      (current) =>
        current.status === 'completed' &&
        current.automationStatus === 'published',
    );

    const forbiddenPattern = /\b(ai|anthropic|claude|codex)\b/i;
    expect(fakeGitPublicationClient.lastCommitMessage).not.toMatch(
      forbiddenPattern,
    );
    expect(fakeGithubPullRequestsGateway.lastInput?.title).not.toMatch(
      forbiddenPattern,
    );
    expect(fakeGithubPullRequestsGateway.lastInput?.body).not.toMatch(
      forbiddenPattern,
    );
  });

  it('POST /api/executions should return 404 for foreign repository', async () => {
    const owner = await createLoginSession();
    const attacker = await createLoginSession();
    await userSettingsFactory.create(attacker.userId);
    const ownerRepository = await createRunnableRepository(owner.userId);

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${attacker.accessToken}` },
      payload: buildCreateExecutionPayload(ownerRepository.id),
    });

    expect(response.statusCode).toBe(404);
  });

  it('POST /api/executions should return 409 when repository is not runnable', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);

    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });

    expect(response.statusCode).toBe(409);
  });

  it('POST /api/executions should enforce max 2 concurrent executions', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({ kind: 'hang' });
    fakeRunner.enqueueBehavior({ kind: 'hang' });
    fakeRunner.enqueueBehavior({ kind: 'success' });

    const first = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    const third = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(409);

    const firstId = first.json<{ id: string }>().id;
    const secondId = second.json<{ id: string }>().id;
    await app.inject({
      method: 'POST',
      url: `/api/executions/${firstId}/cancel`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    await app.inject({
      method: 'POST',
      url: `/api/executions/${secondId}/cancel`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
  });

  it('GET /api/executions should return only user executions and apply limit', async () => {
    const owner = await createLoginSession();
    const other = await createLoginSession();
    const ownerRepo = await repositoryFactory.create({ userId: owner.userId });
    const otherRepo = await repositoryFactory.create({ userId: other.userId });

    for (let index = 0; index < 4; index += 1) {
      await executionFactory.create({
        userId: owner.userId,
        repositoryId: ownerRepo.id,
      });
    }
    await executionFactory.create({
      userId: other.userId,
      repositoryId: otherRepo.id,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/executions?limit=2',
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<
      Array<{
        repositoryId: string;
        publishPullRequest: boolean;
        requireCodeChanges: boolean;
        implementationAttempts: number;
      }>
    >();
    expect(body).toHaveLength(2);
    expect(body.every((item) => item.repositoryId === ownerRepo.id)).toBe(true);
    expect(body.every((item) => item.publishPullRequest)).toBe(true);
    expect(body.every((item) => item.requireCodeChanges)).toBe(true);
    expect(body.every((item) => item.implementationAttempts >= 1)).toBe(true);
  });

  it('GET /api/executions/:id should include publication and implementation fields', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });
    const execution = await executionFactory.create({
      userId: session.userId,
      repositoryId: repository.id,
      publishPullRequest: false,
      requireCodeChanges: false,
      implementationAttempts: 2,
      idempotencyKey: 'detail-idempotency-key',
      orchestrationState: 'done',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/executions/${execution.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      publishPullRequest: boolean;
      requireCodeChanges: boolean;
      implementationAttempts: number;
      orchestrationState: string;
      idempotencyKey: string | null;
    }>();
    expect(body.publishPullRequest).toBe(false);
    expect(body.requireCodeChanges).toBe(false);
    expect(body.implementationAttempts).toBe(2);
    expect(body.orchestrationState).toBe('done');
    expect(body.idempotencyKey).toMatch(/^sha256:/);
  });

  it('GET /api/executions/:id should return 404 for foreign ownership', async () => {
    const owner = await createLoginSession();
    const attacker = await createLoginSession();
    const repository = await repositoryFactory.create({ userId: owner.userId });
    const execution = await executionFactory.create({
      userId: owner.userId,
      repositoryId: repository.id,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/executions/${execution.id}`,
      headers: { authorization: `Bearer ${attacker.accessToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('POST /api/executions/:id/cancel should cancel running execution and reject inactive execution', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({ kind: 'hang' });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    const executionId = createResponse.json<{ id: string }>().id;

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/api/executions/${executionId}/cancel`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(cancelResponse.statusCode).toBe(200);
    const cancelledExecution = await waitForExecution(
      executionId,
      (execution) => execution.status === 'cancelled',
    );
    expect(cancelledExecution.status).toBe('cancelled');

    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/api/executions/${executionId}/cancel`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(conflictResponse.statusCode).toBe(409);
  });

  it('GET /api/executions/:id/stream should provide snapshot and live events', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['stream-line-1\n', 'stream-line-2\n'],
      delayMs: 15,
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });

    const executionId = createResponse.json<{ id: string }>().id;

    const streamResponse = await app.inject({
      method: 'GET',
      url: `/api/executions/${executionId}/stream`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.headers['content-type']).toContain(
      'text/event-stream',
    );
    expect(streamResponse.body).toContain('event: snapshot');
    expect(streamResponse.body).toContain('event: stdout');
    expect(streamResponse.body).toContain('event: publication');
    expect(streamResponse.body).toContain('"sequence":');
    expect(streamResponse.body).toContain('"sentAt":');
    expect(streamResponse.body).toMatch(/event: (completed|error)/);
  });

  it('GET /api/executions/:id/stream should return 400 for invalid afterSequence', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });
    const execution = await executionFactory.create({
      userId: session.userId,
      repositoryId: repository.id,
      status: 'completed',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/executions/${execution.id}/stream?afterSequence=10abc`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it('Execution should fail on timeout when process keeps running', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId, {
      executionTimeoutMs: null,
    });
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({ kind: 'hang' });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(createResponse.statusCode).toBe(201);
    const executionId = createResponse.json<{ id: string }>().id;

    const failedExecution = await waitForExecution(
      executionId,
      (execution) => execution.status === 'failed',
    );

    expect(failedExecution.errorMessage).toContain('timed out');
  });

  it('Execution output should respect cap and set outputTruncated flag', async () => {
    const session = await createLoginSession();
    await userSettingsFactory.create(session.userId);
    const repository = await createRunnableRepository(session.userId);

    fakeRunner.enqueueBehavior({
      kind: 'success',
      stdout: ['x'.repeat(900)],
      delayMs: 10,
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/executions',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: buildCreateExecutionPayload(repository.id),
    });
    expect(createResponse.statusCode).toBe(201);
    const executionId = createResponse.json<{ id: string }>().id;

    const completedExecution = await waitForExecution(
      executionId,
      (execution) => execution.status === 'completed',
    );

    expect(completedExecution.outputTruncated).toBe(true);
    expect(
      Buffer.byteLength(completedExecution.output, 'utf8'),
    ).toBeLessThanOrEqual(400);
  });

  const createLoginSession = async (): Promise<LoginSession> => {
    const { user, plainPassword } = await userFactory.create();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: user.email,
        password: plainPassword,
      },
    });
    expect(loginResponse.statusCode).toBe(200);

    return {
      accessToken: loginResponse.json<{ accessToken: string }>().accessToken,
      userId: user.id,
    };
  };

  const createRunnableRepository = async (
    userId: string,
  ): Promise<ManagedRepository> => {
    const remote = await repositoryFactory.createRemoteRepository();
    const localPath = repositoryFactory.buildLocalPath(userId, remote.fullName);

    await mkdir(dirname(localPath), { recursive: true });
    await execFileAsync('git', ['clone', remote.cloneUrl, localPath], {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    return repositoryFactory.create({
      userId,
      fullName: remote.fullName,
      cloneUrl: remote.cloneUrl,
      defaultBranch: remote.defaultBranch,
      localPath,
      isCloned: true,
    });
  };

  const waitForExecution = async (
    executionId: string,
    predicate: (execution: Execution) => boolean = () => true,
  ): Promise<Execution> => {
    const timeoutMs = 3000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const execution = await dataSource
        .getRepository(Execution)
        .findOneBy({ id: executionId });
      if (execution && predicate(execution)) {
        return execution;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error('Execution did not reach expected state within timeout');
  };

  const waitForFileContents = async (filePath: string): Promise<string> => {
    const timeoutMs = 1500;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        return await readFile(filePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    throw new Error(`Report file was not created in time: ${filePath}`);
  };
});

const buildCreateExecutionPayload = (
  repositoryId: string,
  action: ExecutionAction = 'fix',
  overrides: Partial<{
    taskId: string;
    taskExternalId: string;
    taskTitle: string;
    taskDescription: string;
    taskSource: TaskSource;
    publishPullRequest: boolean;
    requireCodeChanges: boolean;
  }> = {},
) => ({
  repositoryId,
  action,
  taskId: overrides.taskId ?? 'task-0001',
  taskExternalId: overrides.taskExternalId ?? 'TASK-0001',
  taskTitle: overrides.taskTitle ?? 'Fix backend issue',
  taskDescription: overrides.taskDescription ?? 'Implement task updates',
  taskSource: overrides.taskSource ?? 'jira',
  ...(overrides.publishPullRequest === undefined
    ? {}
    : { publishPullRequest: overrides.publishPullRequest }),
  ...(overrides.requireCodeChanges === undefined
    ? {}
    : { requireCodeChanges: overrides.requireCodeChanges }),
});
