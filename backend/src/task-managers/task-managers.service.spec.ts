import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { CreateTaskManagerConnectionDto } from './dto/create-task-manager-connection.dto';
import { TaskManagerConnection } from './entities/task-manager-connection.entity';
import { TaskManagerConnectionConfig } from './interfaces/task-manager-provider.interface';
import { TaskFilterService } from './task-filter.service';
import { TaskManagerProviderRegistry } from './task-manager-provider.registry';
import { TaskManagersService } from './task-managers.service';
import { TaskPrefixService } from './task-prefix.service';

describe('TaskManagersService', () => {
  const createService = () => {
    const connectionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<TaskManagerConnection>>;

    const encryptionService = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
    };

    const providerRegistry = {
      getProvider: jest.fn(),
    } as unknown as jest.Mocked<TaskManagerProviderRegistry>;

    const taskPrefixService = {
      addPrefix: jest.fn(),
      deletePrefix: jest.fn(),
      mapToResponse: jest.fn(),
    } as unknown as jest.Mocked<TaskPrefixService>;

    const taskFilterService = {
      filterTasks: jest.fn(),
    } as unknown as jest.Mocked<TaskFilterService>;

    const configService = {
      get: jest.fn((_: string, defaultValue?: string) => defaultValue),
    } as unknown as jest.Mocked<ConfigService>;

    const service = new TaskManagersService(
      connectionRepository,
      encryptionService as never,
      providerRegistry,
      taskPrefixService,
      taskFilterService,
      configService,
    );

    return {
      service,
      providerRegistry,
    };
  };

  it('maps unexpected provider runtime errors to BadGatewayException', async () => {
    const { service, providerRegistry } = createService();

    providerRegistry.getProvider.mockReturnValue({
      provider: 'asana',
      validateConnection: jest
        .fn<Promise<void>, [TaskManagerConnectionConfig]>()
        .mockRejectedValue(new Error('Unexpected Asana SDK failure')),
      fetchTasks: jest.fn(),
      fetchProjects: jest.fn(),
      listSyncScopes: jest.fn(),
      fetchTasksForScope: jest.fn(),
    });

    const dto = {
      provider: 'asana',
      personalAccessToken: 'asana-token',
    } as CreateTaskManagerConnectionDto;

    await expect(
      service.createConnectionForUser('user-1', dto),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps unknown errors passed to throwMappedProviderError to BadGatewayException', () => {
    const { service } = createService();

    const invokeThrowMappedProviderError = () =>
      (
        service as unknown as {
          throwMappedProviderError: (error: unknown) => never;
        }
      ).throwMappedProviderError(new Error('Unknown provider failure'));

    expect(invokeThrowMappedProviderError).toThrow(BadGatewayException);
  });

  it('sanitizes lastSyncError in connection response payload', () => {
    const { service } = createService();

    const response = (
      service as unknown as {
        mapConnectionToResponse: (connection: TaskManagerConnection) => {
          lastSyncError: string | null;
        };
      }
    ).mapConnectionToResponse({
      id: 'connection-1',
      provider: 'asana',
      name: 'Asana',
      status: 'connected',
      baseUrl: null,
      workspaceId: null,
      projectId: null,
      projectKey: null,
      secretEncrypted: 'encrypted',
      emailEncrypted: null,
      authMode: null,
      lastValidatedAt: null,
      lastSyncedAt: null,
      lastSyncStatus: 'failed',
      lastSyncError: 'Asana token invalid: bearer abc123',
      createdAt: new Date(),
      updatedAt: new Date(),
      prefixes: [],
      userId: 'user-1',
      user: {} as never,
    } as TaskManagerConnection);

    expect(response.lastSyncError).toBe(
      'Task sync failed. Please retry or reconnect.',
    );
  });
});
