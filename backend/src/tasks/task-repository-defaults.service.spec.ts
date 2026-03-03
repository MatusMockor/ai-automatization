import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RepositoriesService } from '../repositories/repositories.service';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { TaskScopeRepositoryDefault } from './entities/task-scope-repository-default.entity';
import { TaskRepositoryDefaultsService } from './task-repository-defaults.service';

describe('TaskRepositoryDefaultsService', () => {
  const createService = () => {
    const defaultsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<TaskScopeRepositoryDefault>>;

    const repositoriesService = {
      assertOwnedRepository: jest.fn(),
    } as unknown as jest.Mocked<RepositoriesService>;

    const service = new TaskRepositoryDefaultsService(
      defaultsRepository,
      repositoriesService,
    );

    return {
      service,
      defaultsRepository,
      repositoriesService,
    };
  };

  it('resolves repository defaults with priority project > workspace > provider', async () => {
    const { service, defaultsRepository } = createService();
    defaultsRepository.find.mockResolvedValue([
      {
        provider: 'asana',
        scopeType: null,
        scopeId: null,
        repositoryId: 'repo-provider',
      },
      {
        provider: 'asana',
        scopeType: 'asana_workspace',
        scopeId: 'ws-1',
        repositoryId: 'repo-workspace',
      },
      {
        provider: 'asana',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        repositoryId: 'repo-project',
      },
    ] as TaskScopeRepositoryDefault[]);

    const lookup = await service.buildLookupForUser('user-1');
    const scopes: SyncedTaskScope[] = [
      {
        id: 'scope-1',
        taskId: 'task-1',
        task: {} as never,
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        scopeName: 'Project 1',
        parentScopeType: 'asana_workspace',
        parentScopeId: 'ws-1',
        parentScopeName: 'Workspace 1',
        isPrimary: true,
      },
    ];

    const resolved = service.resolveSuggestedRepository(
      'asana',
      scopes,
      lookup,
    );

    expect(resolved).toEqual({
      repositoryId: 'repo-project',
      source: 'asana_project',
    });
  });

  it('falls back to workspace and provider default when project default does not exist', async () => {
    const { service, defaultsRepository } = createService();
    defaultsRepository.find.mockResolvedValue([
      {
        provider: 'asana',
        scopeType: null,
        scopeId: null,
        repositoryId: 'repo-provider',
      },
      {
        provider: 'asana',
        scopeType: 'asana_workspace',
        scopeId: 'ws-1',
        repositoryId: 'repo-workspace',
      },
    ] as TaskScopeRepositoryDefault[]);

    const lookup = await service.buildLookupForUser('user-1');
    const scopes: SyncedTaskScope[] = [
      {
        id: 'scope-1',
        taskId: 'task-1',
        task: {} as never,
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        scopeName: 'Project 1',
        parentScopeType: 'asana_workspace',
        parentScopeId: 'ws-1',
        parentScopeName: 'Workspace 1',
        isPrimary: true,
      },
    ];

    expect(service.resolveSuggestedRepository('asana', scopes, lookup)).toEqual(
      {
        repositoryId: 'repo-workspace',
        source: 'asana_workspace',
      },
    );

    const noScopes = service.resolveSuggestedRepository('asana', [], lookup);
    expect(noScopes).toEqual({
      repositoryId: 'repo-provider',
      source: 'provider_default',
    });
  });

  it('validates scope type compatibility in upsert', async () => {
    const { service } = createService();

    await expect(
      service.upsertForUser('user-1', {
        provider: 'jira',
        repositoryId: '0f64391d-56d5-4f89-a3da-a205624f5f2e',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
