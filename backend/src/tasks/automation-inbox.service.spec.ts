import { AutomationInboxService } from './automation-inbox.service';
import type { ResolvedTaskFeedItem } from './task-feed.types';

describe('AutomationInboxService', () => {
  let service: AutomationInboxService;
  const executionRepository = {
    find: jest.fn(),
  };
  const taskAutomationControlRepository = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
    upsert: jest.fn(),
  };
  const tasksService = {
    listTaskFeedItemsForUser: jest.fn(),
    getTaskFeedItemByKey: jest.fn(),
  };
  const repositoriesService = {
    assertOwnedRepository: jest.fn(),
  };

  const buildTask = (
    overrides: Partial<ResolvedTaskFeedItem> = {},
  ): ResolvedTaskFeedItem => ({
    id: 'connection-1:asana:TASK-1',
    connectionId: 'connection-1',
    externalId: 'TASK-1',
    title: 'Fix failing API response',
    description: '',
    url: 'https://example.test/task/TASK-1',
    status: 'open',
    assignee: null,
    source: 'asana',
    primaryScopeType: 'asana_project',
    primaryScopeId: 'proj-1',
    primaryScopeName: 'Project 1',
    suggestedRepositoryId: 'repo-1',
    repositorySelectionSource: 'automation_rule',
    matchedRuleId: 'rule-1',
    matchedRuleName: 'API fixes',
    suggestedAction: 'fix',
    automationMode: 'draft',
    draftExecutionId: 'draft-1',
    draftStatus: 'ready',
    executionGroupId: null,
    groupStatus: null,
    groupRepositoryIds: [],
    coordinatedDraftCount: 0,
    automationState: 'drafted',
    manualWorkflowState: null,
    hasMultipleScopes: false,
    updatedAt: '2026-03-09T10:00:00.000Z',
    sourceVersion: '2026-03-09T10:00:00.000Z',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutomationInboxService(
      executionRepository as never,
      taskAutomationControlRepository as never,
      tasksService as never,
      repositoriesService as never,
    );
  });

  it('returns ready drafts as startable inbox items', async () => {
    tasksService.listTaskFeedItemsForUser.mockResolvedValue([buildTask()]);
    executionRepository.find.mockResolvedValue([]);
    taskAutomationControlRepository.find.mockResolvedValue([]);

    const response = await service.listForUser('user-1', {});

    expect(response.total).toBe(1);
    expect(response.items[0]).toMatchObject({
      taskKey: 'connection-1:asana:TASK-1',
      reasonCode: 'draft_ready',
      nextAction: 'start_draft',
      latestExecutionId: null,
    });
  });

  it('hides snoozed items by default and returns them when includeSuppressed=true', async () => {
    tasksService.listTaskFeedItemsForUser.mockResolvedValue([buildTask()]);
    executionRepository.find.mockResolvedValue([]);
    taskAutomationControlRepository.find.mockResolvedValue([
      {
        taskKey: 'connection-1:asana:TASK-1',
        controlType: 'snooze',
        untilAt: new Date(Date.now() + 60_000),
        isActive: true,
        sourceVersion: '2026-03-09T10:00:00.000Z',
        restoredAt: null,
      },
    ]);

    const hiddenResponse = await service.listForUser('user-1', {});
    const visibleResponse = await service.listForUser('user-1', {
      includeSuppressed: true,
    });

    expect(hiddenResponse.total).toBe(0);
    expect(visibleResponse.total).toBe(1);
    expect(visibleResponse.items[0]).toMatchObject({
      reasonCode: 'snoozed',
      nextAction: 'none',
    });
  });

  it('falls back to blocked reason when latest execution failed', async () => {
    tasksService.listTaskFeedItemsForUser.mockResolvedValue([
      buildTask({
        draftExecutionId: null,
        draftStatus: null,
        automationState: 'matched',
      }),
    ]);
    executionRepository.find.mockResolvedValue([
      {
        id: 'exec-1',
        taskId: 'connection-1:asana:TASK-1',
        status: 'failed',
        reviewGateStatus: 'not_applicable',
        orchestrationState: 'failed',
        createdAt: new Date('2026-03-09T11:00:00.000Z'),
        updatedAt: new Date('2026-03-09T11:00:00.000Z'),
      },
    ]);
    taskAutomationControlRepository.find.mockResolvedValue([]);

    const response = await service.listForUser('user-1', {});

    expect(response.total).toBe(1);
    expect(response.items[0]).toMatchObject({
      latestExecutionId: 'exec-1',
      latestExecutionStatus: 'failed',
      reasonCode: 'blocked_by_execution_failure',
    });
  });

  it('ignores dismiss-until-change control after source version changed', async () => {
    tasksService.listTaskFeedItemsForUser.mockResolvedValue([
      buildTask({
        draftExecutionId: null,
        draftStatus: null,
        automationState: 'matched',
        sourceVersion: '2026-03-09T12:00:00.000Z',
      }),
    ]);
    executionRepository.find.mockResolvedValue([]);
    taskAutomationControlRepository.find.mockResolvedValue([
      {
        taskKey: 'connection-1:asana:TASK-1',
        controlType: 'dismiss_until_change',
        untilAt: null,
        isActive: true,
        sourceVersion: '2026-03-09T10:00:00.000Z',
        restoredAt: null,
      },
    ]);

    const response = await service.listForUser('user-1', {
      includeSuppressed: true,
    });

    expect(response.total).toBe(1);
    expect(response.items[0]).toMatchObject({
      reasonCode: 'matched_rule_no_draft',
    });
  });

  it('keeps dismiss-until-change active when source version is unavailable', async () => {
    tasksService.listTaskFeedItemsForUser.mockResolvedValue([
      buildTask({
        draftExecutionId: null,
        draftStatus: null,
        automationState: 'matched',
        sourceVersion: null,
      }),
    ]);
    executionRepository.find.mockResolvedValue([]);
    taskAutomationControlRepository.find.mockResolvedValue([
      {
        taskKey: 'connection-1:asana:TASK-1',
        controlType: 'dismiss_until_change',
        untilAt: null,
        isActive: true,
        sourceVersion: null,
        restoredAt: null,
      },
    ]);

    const hiddenResponse = await service.listForUser('user-1', {});
    const visibleResponse = await service.listForUser('user-1', {
      includeSuppressed: true,
    });

    expect(hiddenResponse.total).toBe(0);
    expect(visibleResponse.items[0]).toMatchObject({
      reasonCode: 'dismissed_until_change',
    });
  });
});
