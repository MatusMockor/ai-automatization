import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { TaskManagerConnection } from '../task-managers/entities/task-manager-connection.entity';
import { TaskSyncSchedulerService } from './task-sync-scheduler.service';
import { TaskSyncService } from './task-sync.service';

describe('TaskSyncSchedulerService', () => {
  const createService = (
    enabled = true,
    settings: Partial<UserSettings>[] = [],
    connections: Partial<TaskManagerConnection>[] = [],
  ) => {
    const settingsRepository = {
      find: jest.fn().mockResolvedValue(settings),
    } as unknown as jest.Mocked<Repository<UserSettings>>;

    const connectionRepository = {
      find: jest.fn().mockResolvedValue(connections),
    } as unknown as jest.Mocked<Repository<TaskManagerConnection>>;

    const taskSyncService = {
      startScheduledSyncIfDue: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<TaskSyncService>;

    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'TASK_SYNC_SCHEDULER_ENABLED') {
          return enabled ? 'true' : 'false';
        }

        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const service = new TaskSyncSchedulerService(
      settingsRepository,
      connectionRepository,
      taskSyncService,
      configService,
    );

    return {
      service,
      settingsRepository,
      connectionRepository,
      taskSyncService,
    };
  };

  it('starts due syncs only for enabled providers with connections', async () => {
    const { service, taskSyncService } = createService(
      true,
      [
        {
          userId: 'user-1',
          syncEnabled: true,
          syncIntervalMinutes: 30,
          syncAsanaEnabled: true,
          syncJiraEnabled: false,
        },
      ],
      [
        {
          userId: 'user-1',
          provider: 'asana',
        },
        {
          userId: 'user-1',
          provider: 'jira',
        },
      ],
    );

    await service.runOnce();

    expect(taskSyncService.startScheduledSyncIfDue).toHaveBeenCalledTimes(1);
    expect(taskSyncService.startScheduledSyncIfDue).toHaveBeenCalledWith(
      'user-1',
      'asana',
      30,
    );
  });

  it('does nothing when scheduler is disabled', async () => {
    const {
      service,
      settingsRepository,
      connectionRepository,
      taskSyncService,
    } = createService(false);

    await service.runOnce();

    expect(settingsRepository.find).not.toHaveBeenCalled();
    expect(connectionRepository.find).not.toHaveBeenCalled();
    expect(taskSyncService.startScheduledSyncIfDue).not.toHaveBeenCalled();
  });
});
