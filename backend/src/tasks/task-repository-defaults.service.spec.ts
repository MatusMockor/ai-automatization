import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RepositoriesService } from '../repositories/repositories.service';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { TaskScopeRepositoryDefault } from './entities/task-scope-repository-default.entity';
import { TaskRepositoryDefaultsService } from './task-repository-defaults.service';

describe('TaskRepositoryDefaultsService', () => {
  const createService = (databaseType: 'postgres' | 'sqljs' = 'postgres') => {
    const upsertQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    const defaultsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => upsertQueryBuilder),
      manager: {
        connection: {
          options: {
            type: databaseType,
          },
        },
      },
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
      upsertQueryBuilder,
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

  it('treats provider defaults only when both scopeType and scopeId are null', async () => {
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
        scopeType: null,
        scopeId: 'ws-1',
        repositoryId: 'repo-malformed',
      },
    ] as TaskScopeRepositoryDefault[]);

    const lookup = await service.buildLookupForUser('user-1');
    const scopes: SyncedTaskScope[] = [
      {
        id: 'scope-1',
        taskId: 'task-1',
        task: {} as never,
        scopeType: 'asana_workspace',
        scopeId: 'ws-1',
        scopeName: 'Workspace 1',
        parentScopeType: null,
        parentScopeId: null,
        parentScopeName: null,
        isPrimary: true,
      },
    ];

    const resolved = service.resolveSuggestedRepository(
      'asana',
      scopes,
      lookup,
    );

    expect(resolved).toEqual({
      repositoryId: 'repo-provider',
      source: 'provider_default',
    });
  });

  it('uses atomic upsert for scoped defaults', async () => {
    const {
      service,
      defaultsRepository,
      repositoriesService,
      upsertQueryBuilder,
    } = createService();
    defaultsRepository.findOne.mockResolvedValue({
      id: 'default-1',
      provider: 'asana',
      scopeType: 'asana_project',
      scopeId: 'proj-1',
      repositoryId: 'repo-1',
      userId: 'user-1',
      repository: {} as never,
      user: {} as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskScopeRepositoryDefault);
    upsertQueryBuilder.execute.mockResolvedValue({});

    const result = await service.upsertForUser('user-1', {
      provider: 'asana',
      repositoryId: 'repo-1',
      scopeType: 'asana_project',
      scopeId: 'proj-1',
    });

    expect(repositoriesService.assertOwnedRepository).toHaveBeenCalledWith(
      'user-1',
      'repo-1',
    );
    expect(upsertQueryBuilder.insert).toHaveBeenCalledTimes(1);
    expect(upsertQueryBuilder.onConflict).toHaveBeenCalledWith(
      expect.stringContaining(
        '("user_id","provider","scope_type","scope_id") WHERE "scope_type" IS NOT NULL AND "scope_id" IS NOT NULL',
      ),
    );
    expect(result.id).toBe('default-1');
  });

  it('uses provider-level atomic upsert conflict target when scope is null', async () => {
    const { service, defaultsRepository, upsertQueryBuilder } = createService();
    defaultsRepository.findOne.mockResolvedValue({
      id: 'default-2',
      provider: 'asana',
      scopeType: null,
      scopeId: null,
      repositoryId: 'repo-2',
      userId: 'user-1',
      repository: {} as never,
      user: {} as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskScopeRepositoryDefault);
    upsertQueryBuilder.execute.mockResolvedValue({});

    await service.upsertForUser('user-1', {
      provider: 'asana',
      repositoryId: 'repo-2',
    });

    expect(upsertQueryBuilder.onConflict).toHaveBeenCalledWith(
      expect.stringContaining(
        '("user_id","provider") WHERE "scope_type" IS NULL AND "scope_id" IS NULL',
      ),
    );
  });

  it('uses portable upsert flow for sqljs (no postgres ON CONFLICT clause)', async () => {
    const { service, defaultsRepository, upsertQueryBuilder } =
      createService('sqljs');
    defaultsRepository.update.mockResolvedValue({ affected: 0 } as never);
    defaultsRepository.insert.mockResolvedValue({} as never);
    defaultsRepository.findOne.mockResolvedValue({
      id: 'default-3',
      provider: 'asana',
      scopeType: null,
      scopeId: null,
      repositoryId: 'repo-3',
      userId: 'user-1',
      repository: {} as never,
      user: {} as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskScopeRepositoryDefault);

    const result = await service.upsertForUser('user-1', {
      provider: 'asana',
      repositoryId: 'repo-3',
    });

    expect(upsertQueryBuilder.execute).not.toHaveBeenCalled();
    expect(defaultsRepository.update).toHaveBeenCalled();
    expect(defaultsRepository.insert).toHaveBeenCalled();
    expect(result.id).toBe('default-3');
  });
});
