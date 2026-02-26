import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../../src/common/encryption/encryption.service';
import { TaskManagerConnection } from '../../src/task-managers/entities/task-manager-connection.entity';

type TaskManagerProvider = 'asana' | 'jira';

type CreateTaskManagerConnectionInput = {
  userId: string;
  provider?: TaskManagerProvider;
  name?: string | null;
  scopeKey?: string;
  baseUrl?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  projectKey?: string | null;
  authMode?: 'basic' | 'bearer' | null;
  email?: string | null;
  secret?: string;
  status?: string;
  lastValidatedAt?: Date | null;
};

export class TaskManagerConnectionFactory {
  constructor(
    private readonly dataSource: DataSource,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(
    input: CreateTaskManagerConnectionInput,
  ): Promise<TaskManagerConnection> {
    const provider = input.provider ?? 'asana';
    const secret = input.secret ?? faker.string.alphanumeric(24);

    const connection = this.dataSource
      .getRepository(TaskManagerConnection)
      .create({
        userId: input.userId,
        provider,
        name: input.name ?? faker.company.name(),
        scopeKey: input.scopeKey ?? this.buildScopeKey(provider),
        baseUrl:
          input.baseUrl ??
          (provider === 'jira' ? 'https://example.atlassian.net' : null),
        workspaceId:
          input.workspaceId ??
          (provider === 'asana' ? faker.string.numeric(10) : null),
        projectId:
          input.projectId ??
          (provider === 'asana' ? faker.string.numeric(10) : null),
        projectKey:
          input.projectKey ??
          (provider === 'jira'
            ? faker.string.alpha({ length: 4 }).toUpperCase()
            : null),
        authMode: input.authMode ?? (provider === 'jira' ? 'bearer' : null),
        email:
          input.email ??
          (provider === 'jira' && (input.authMode ?? 'bearer') === 'basic'
            ? faker.internet.email().toLowerCase()
            : null),
        secretEncrypted: this.encryptionService.encrypt(secret),
        status: input.status ?? 'connected',
        lastValidatedAt: input.lastValidatedAt ?? new Date(),
      });

    return this.dataSource
      .getRepository(TaskManagerConnection)
      .save(connection);
  }

  private buildScopeKey(provider: TaskManagerProvider): string {
    if (provider === 'asana') {
      return `asana:${faker.string.numeric(10)}:${faker.string.numeric(10)}`;
    }

    return `jira:https://example.atlassian.net:${faker.string.alpha({ length: 4 }).toUpperCase()}`;
  }
}
