import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ExecutionsService } from '../executions/executions.service';
import { RepositoriesService } from '../repositories/repositories.service';
import { SyncedTaskScope } from '../tasks/entities/synced-task-scope.entity';
import { SyncedTask } from '../tasks/entities/synced-task.entity';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRule } from './entities/automation-rule.entity';

describe('AutomationRulesService', () => {
  const createService = () => {
    const automationRulesRepository = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((input: Partial<AutomationRule>) => input),
      save: jest.fn(async (input: Partial<AutomationRule>) => input),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<AutomationRule>>;

    const syncedTaskRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncedTask>>;

    const repositoriesService = {
      assertOwnedRepository: jest.fn(),
    } as unknown as jest.Mocked<RepositoriesService>;

    const executionsService = {
      listReadyDraftTaskIdsForUser: jest.fn(),
      createOrRefreshDraftForTask: jest.fn(),
      supersedeReadyDraftsForTask: jest.fn(),
      supersedeReadyDraftsForTaskIds: jest.fn(),
    } as unknown as jest.Mocked<ExecutionsService>;

    const service = new AutomationRulesService(
      automationRulesRepository,
      syncedTaskRepository,
      repositoriesService,
      executionsService,
    );

    return {
      service,
      automationRulesRepository,
      syncedTaskRepository,
      repositoriesService,
      executionsService,
    };
  };

  const createTaskScope = (
    overrides: Partial<SyncedTaskScope> = {},
  ): SyncedTaskScope => ({
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
    ...overrides,
  });

  const createRule = (
    overrides: Partial<AutomationRule> = {},
  ): AutomationRule => ({
    id: 'rule-1',
    userId: 'user-1',
    user: {} as never,
    name: 'Rule 1',
    enabled: true,
    priority: 100,
    provider: 'asana',
    scopeType: 'asana_project',
    scopeId: 'proj-1',
    titleContains: ['backend'],
    taskStatuses: ['open'],
    repositoryId: 'repo-1',
    repository: {} as never,
    mode: 'suggest',
    suggestedAction: 'fix',
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    ...overrides,
  });

  const createSyncedTask = (overrides: Partial<SyncedTask> = {}): SyncedTask =>
    ({
      id: 'task-db-1',
      userId: 'user-1',
      user: {} as never,
      connectionId: 'connection-1',
      connection: {} as never,
      provider: 'asana',
      externalId: 'TASK-1',
      title: 'Backend automation fix',
      description: 'Task description',
      url: 'https://example.com/task',
      status: 'open',
      assignee: null,
      sourceUpdatedAt: new Date('2026-03-21T10:00:00.000Z'),
      lastSyncedAt: new Date('2026-03-21T10:05:00.000Z'),
      scopes: [createTaskScope()],
      createdAt: new Date('2026-03-21T10:05:00.000Z'),
      updatedAt: new Date('2026-03-21T10:05:00.000Z'),
      ...overrides,
    }) as SyncedTask;

  it('lists active rules with deterministic priority ordering', async () => {
    const { service, automationRulesRepository } = createService();
    automationRulesRepository.find.mockResolvedValue([]);

    await service.listActiveRulesForUser('user-1');

    expect(automationRulesRepository.find).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        enabled: true,
      },
      order: {
        priority: 'DESC',
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
  });

  it('matches workspace-scoped Asana rules through project parent scope', () => {
    const { service } = createService();

    const match = service.resolveTaskMatch(
      {
        provider: 'asana',
        title: 'Backend API regression fix',
        status: 'open',
        scopes: [createTaskScope()],
      },
      [
        createRule({
          id: 'rule-workspace',
          scopeType: 'asana_workspace',
          scopeId: 'ws-1',
          titleContains: ['backend', 'fix'],
        }),
      ],
    );

    expect(match).toEqual({
      ruleId: 'rule-workspace',
      ruleName: 'Rule 1',
      repositoryId: 'repo-1',
      mode: 'suggest',
      executionAction: 'fix',
    });
  });

  it('returns the first matching rule from the ordered list and ignores disabled rules', () => {
    const { service } = createService();

    const match = service.resolveTaskMatch(
      {
        provider: 'jira',
        title: 'API bug fix',
        status: 'in_progress',
        scopes: [
          createTaskScope({
            scopeType: 'jira_project',
            scopeId: 'SCRUM',
            scopeName: 'SCRUM',
            parentScopeType: null,
            parentScopeId: null,
            parentScopeName: null,
          }),
        ],
      },
      [
        createRule({
          id: 'disabled-rule',
          provider: 'jira',
          enabled: false,
          scopeType: 'jira_project',
          scopeId: 'SCRUM',
          titleContains: ['api'],
          taskStatuses: ['in_progress'],
          repositoryId: 'repo-disabled',
        }),
        createRule({
          id: 'winning-rule',
          name: 'Winning rule',
          provider: 'jira',
          scopeType: 'jira_project',
          scopeId: 'SCRUM',
          titleContains: ['api'],
          taskStatuses: ['in_progress'],
          repositoryId: 'repo-winning',
          suggestedAction: 'feature',
        }),
        createRule({
          id: 'later-rule',
          name: 'Later rule',
          provider: 'jira',
          scopeType: 'jira_project',
          scopeId: 'SCRUM',
          titleContains: ['api'],
          taskStatuses: ['in_progress'],
          repositoryId: 'repo-later',
          suggestedAction: 'plan',
        }),
      ],
    );

    expect(match).toEqual({
      ruleId: 'winning-rule',
      ruleName: 'Winning rule',
      repositoryId: 'repo-winning',
      mode: 'suggest',
      executionAction: 'feature',
    });
  });

  it('requires all title phrases and matching status', () => {
    const { service } = createService();

    const noMatch = service.resolveTaskMatch(
      {
        provider: 'asana',
        title: 'Frontend polish',
        status: 'done',
        scopes: [createTaskScope()],
      },
      [
        createRule({
          titleContains: ['frontend', 'backend'],
          taskStatuses: ['open'],
        }),
      ],
    );

    expect(noMatch).toBeNull();
  });

  it('treats empty titleContains and taskStatuses arrays as wildcard filters', () => {
    const { service } = createService();

    const match = service.resolveTaskMatch(
      {
        provider: 'asana',
        title: 'Any task title',
        status: 'done',
        scopes: [createTaskScope()],
      },
      [
        createRule({
          titleContains: [],
          taskStatuses: [],
        }),
      ],
    );

    expect(match).toEqual({
      ruleId: 'rule-1',
      ruleName: 'Rule 1',
      repositoryId: 'repo-1',
      mode: 'suggest',
      executionAction: 'fix',
    });
  });

  it('treats null optional filters as wildcard filters', () => {
    const { service } = createService();

    const match = service.resolveTaskMatch(
      {
        provider: 'asana',
        title: 'Another task title',
        status: 'closed',
        scopes: [createTaskScope()],
      },
      [
        createRule({
          titleContains: null,
          taskStatuses: null,
        }),
      ],
    );

    expect(match).toEqual({
      ruleId: 'rule-1',
      ruleName: 'Rule 1',
      repositoryId: 'repo-1',
      mode: 'suggest',
      executionAction: 'fix',
    });
  });

  it('rejects incompatible provider and scope combinations on create', async () => {
    const { service } = createService();

    await expect(
      service.createForUser('user-1', {
        name: 'Invalid Jira scope',
        provider: 'jira',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        repositoryId: '4d5d9f85-8d13-4db8-b84c-6564e1e8ce21',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires executionAction when draft mode is used', async () => {
    const { service, repositoriesService } = createService();
    repositoriesService.assertOwnedRepository.mockResolvedValue(undefined);

    await expect(
      service.createForUser('user-1', {
        name: 'Draft rule without action',
        provider: 'asana',
        repositoryId: '4d5d9f85-8d13-4db8-b84c-6564e1e8ce21',
        mode: 'draft',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects conflicting executionAction and suggestedAction aliases', async () => {
    const { service, repositoriesService } = createService();
    repositoriesService.assertOwnedRepository.mockResolvedValue(undefined);

    await expect(
      service.createForUser('user-1', {
        name: 'Conflicting aliases',
        provider: 'asana',
        repositoryId: '4d5d9f85-8d13-4db8-b84c-6564e1e8ce21',
        executionAction: 'fix',
        suggestedAction: 'plan',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('supersedes ready drafts when a rule update changes execution semantics', async () => {
    const {
      service,
      automationRulesRepository,
      syncedTaskRepository,
      repositoriesService,
      executionsService,
    } = createService();
    const rule = createRule();
    const task = createSyncedTask();
    const updatedRule = createRule({
      repositoryId: 'repo-2',
      suggestedAction: 'plan',
      mode: 'draft',
    });

    automationRulesRepository.findOneBy.mockResolvedValue(rule);
    repositoriesService.assertOwnedRepository.mockResolvedValue(undefined);
    automationRulesRepository.save.mockImplementation(
      async (input: Partial<AutomationRule>) =>
        ({
          ...updatedRule,
          ...input,
        }) as AutomationRule,
    );
    automationRulesRepository.find.mockResolvedValue([updatedRule]);
    executionsService.listReadyDraftTaskIdsForUser.mockResolvedValue([
      'connection-1:asana:TASK-1',
    ]);
    syncedTaskRepository.find.mockResolvedValue([task]);
    executionsService.createOrRefreshDraftForTask.mockResolvedValue(
      {} as never,
    );

    await service.updateForUser('user-1', rule.id, {
      repositoryId: 'repo-2',
      mode: 'draft',
      executionAction: 'plan',
    });

    expect(executionsService.listReadyDraftTaskIdsForUser).toHaveBeenCalledWith(
      'user-1',
      ['asana'],
    );
    expect(executionsService.createOrRefreshDraftForTask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        repositoryId: 'repo-2',
        taskId: 'connection-1:asana:TASK-1',
        originRuleId: rule.id,
        action: 'plan',
      }),
    );
  });

  it('does not supersede ready drafts when a rule rename keeps semantics unchanged', async () => {
    const { service, automationRulesRepository, executionsService } =
      createService();
    const rule = createRule();

    automationRulesRepository.findOneBy.mockResolvedValue(rule);
    automationRulesRepository.save.mockImplementation(
      async (input: Partial<AutomationRule>) =>
        ({
          ...rule,
          ...input,
        }) as AutomationRule,
    );

    await service.updateForUser('user-1', rule.id, {
      name: 'Renamed rule',
    });

    expect(
      executionsService.listReadyDraftTaskIdsForUser,
    ).not.toHaveBeenCalled();
  });

  it('re-evaluates ready drafts after deleting a rule', async () => {
    const {
      service,
      automationRulesRepository,
      syncedTaskRepository,
      executionsService,
    } = createService();
    const rule = createRule();
    const task = createSyncedTask();
    const deleteCallOrder: string[] = [];

    automationRulesRepository.findOneBy.mockResolvedValue(rule);
    automationRulesRepository.remove.mockImplementation(async () => {
      deleteCallOrder.push('remove');
      return rule;
    });
    automationRulesRepository.find.mockResolvedValue([]);
    executionsService.listReadyDraftTaskIdsForUser.mockImplementation(
      async () => {
        deleteCallOrder.push('reconcile');
        return ['connection-1:asana:TASK-1'];
      },
    );
    syncedTaskRepository.find.mockResolvedValue([task]);
    executionsService.supersedeReadyDraftsForTask.mockResolvedValue(1);

    await service.deleteForUser('user-1', rule.id);

    expect(automationRulesRepository.remove).toHaveBeenCalledWith(rule);
    expect(deleteCallOrder).toEqual(['remove', 'reconcile']);
    expect(executionsService.supersedeReadyDraftsForTask).toHaveBeenCalledWith(
      'user-1',
      'connection-1:asana:TASK-1',
    );
  });

  it('re-evaluates ready drafts when rule priority changes', async () => {
    const {
      service,
      automationRulesRepository,
      syncedTaskRepository,
      executionsService,
    } = createService();
    const rule = createRule();
    const task = createSyncedTask();

    automationRulesRepository.findOneBy.mockResolvedValue(rule);
    automationRulesRepository.save.mockImplementation(
      async (input: Partial<AutomationRule>) =>
        ({
          ...rule,
          ...input,
        }) as AutomationRule,
    );
    automationRulesRepository.find.mockResolvedValue([rule]);
    executionsService.listReadyDraftTaskIdsForUser.mockResolvedValue([
      'connection-1:asana:TASK-1',
    ]);
    syncedTaskRepository.find.mockResolvedValue([task]);
    executionsService.supersedeReadyDraftsForTask.mockResolvedValue(1);

    await service.updateForUser('user-1', rule.id, {
      priority: 200,
    });

    expect(executionsService.listReadyDraftTaskIdsForUser).toHaveBeenCalledWith(
      'user-1',
      ['asana'],
    );
  });
});
