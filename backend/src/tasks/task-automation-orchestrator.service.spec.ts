import { Repository } from 'typeorm';
import { AutomationRulesService } from '../automation-rules/automation-rules.service';
import {
  CreateExecutionDraftInput,
  ExecutionsService,
} from '../executions/executions.service';
import { SyncedTask } from './entities/synced-task.entity';
import { TaskAutomationOrchestratorService } from './task-automation-orchestrator.service';

describe('TaskAutomationOrchestratorService', () => {
  const createService = () => {
    const syncedTaskRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncedTask>>;

    const automationRulesService = {
      listActiveRulesForUser: jest.fn(),
      resolveTaskMatch: jest.fn(),
    } as unknown as jest.Mocked<AutomationRulesService>;

    const executionsService = {
      createOrRefreshDraftForTask: jest.fn(),
      supersedeReadyDraftsForTask: jest.fn(),
      supersedeReadyDraftsForTaskIds: jest.fn(),
    } as unknown as jest.Mocked<ExecutionsService>;

    const service = new TaskAutomationOrchestratorService(
      syncedTaskRepository,
      automationRulesService,
      executionsService,
    );

    return {
      service,
      syncedTaskRepository,
      automationRulesService,
      executionsService,
    };
  };

  const createTask = (overrides: Partial<SyncedTask> = {}): SyncedTask =>
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
      scopes: [],
      createdAt: new Date('2026-03-21T10:05:00.000Z'),
      updatedAt: new Date('2026-03-21T10:05:00.000Z'),
      ...overrides,
    }) as SyncedTask;

  it('creates draft executions for matched draft rules', async () => {
    const {
      service,
      syncedTaskRepository,
      automationRulesService,
      executionsService,
    } = createService();
    const task = createTask();

    syncedTaskRepository.find.mockResolvedValue([task]);
    automationRulesService.listActiveRulesForUser.mockResolvedValue(
      [] as never,
    );
    automationRulesService.resolveTaskMatch.mockReturnValue({
      ruleId: 'rule-1',
      ruleName: 'Draft backend fixes',
      repositoryId: 'repo-1',
      mode: 'draft',
      executionAction: 'fix',
    });

    await service.processSyncedTasks('user-1', ['task-db-1']);

    expect(executionsService.createOrRefreshDraftForTask).toHaveBeenCalledWith(
      expect.objectContaining<CreateExecutionDraftInput>({
        userId: 'user-1',
        repositoryId: 'repo-1',
        taskId: 'connection-1:asana:TASK-1',
        taskExternalId: 'TASK-1',
        action: 'fix',
        originRuleId: 'rule-1',
      }),
    );
    expect(
      executionsService.supersedeReadyDraftsForTask,
    ).not.toHaveBeenCalled();
  });

  it('supersedes drafts when rule is not in draft mode', async () => {
    const {
      service,
      syncedTaskRepository,
      automationRulesService,
      executionsService,
    } = createService();
    const task = createTask();

    syncedTaskRepository.find.mockResolvedValue([task]);
    automationRulesService.listActiveRulesForUser.mockResolvedValue(
      [] as never,
    );
    automationRulesService.resolveTaskMatch.mockReturnValue({
      ruleId: 'rule-1',
      ruleName: 'Suggest backend fixes',
      repositoryId: 'repo-1',
      mode: 'suggest',
      executionAction: 'fix',
    });

    await service.processSyncedTasks('user-1', ['task-db-1']);

    expect(executionsService.supersedeReadyDraftsForTask).toHaveBeenCalledWith(
      'user-1',
      'connection-1:asana:TASK-1',
    );
    expect(
      executionsService.createOrRefreshDraftForTask,
    ).not.toHaveBeenCalled();
  });

  it('supersedes drafts when a synced task no longer matches any active rule', async () => {
    const {
      service,
      syncedTaskRepository,
      automationRulesService,
      executionsService,
    } = createService();
    const task = createTask();

    syncedTaskRepository.find.mockResolvedValue([task]);
    automationRulesService.listActiveRulesForUser.mockResolvedValue(
      [] as never,
    );
    automationRulesService.resolveTaskMatch.mockReturnValue(null);

    await service.processSyncedTasks('user-1', ['task-db-1']);

    expect(executionsService.supersedeReadyDraftsForTask).toHaveBeenCalledWith(
      'user-1',
      'connection-1:asana:TASK-1',
    );
    expect(
      executionsService.createOrRefreshDraftForTask,
    ).not.toHaveBeenCalled();
  });
});
