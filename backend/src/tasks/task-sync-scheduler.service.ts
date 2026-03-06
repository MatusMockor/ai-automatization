import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { resolveSyncIntervalMinutes } from '../settings/task-sync-settings.constants';
import { TaskManagerConnection } from '../task-managers/entities/task-manager-connection.entity';
import type { TaskManagerProviderType } from '../task-managers/interfaces/task-manager-provider.interface';
import { TaskSyncService } from './task-sync.service';

@Injectable()
export class TaskSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskSyncSchedulerService.name);
  private readonly enabled: boolean;
  private readonly pollMs: number;
  private intervalHandle: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(UserSettings)
    private readonly settingsRepository: Repository<UserSettings>,
    @InjectRepository(TaskManagerConnection)
    private readonly connectionRepository: Repository<TaskManagerConnection>,
    private readonly taskSyncService: TaskSyncService,
    configService: ConfigService,
  ) {
    const enabledFlag = (
      configService.get<string>('TASK_SYNC_SCHEDULER_ENABLED', 'false') ??
      'false'
    )
      .trim()
      .toLowerCase();
    this.enabled = ['1', 'true', 'yes', 'on'].includes(enabledFlag);
    this.pollMs = parsePositiveInteger(
      configService.get<string>('TASK_SYNC_SCHEDULER_POLL_MS', '60000'),
      60000,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.runOnce();
    this.intervalHandle = setInterval(() => {
      void this.runOnce();
    }, this.pollMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async runOnce(): Promise<void> {
    if (!this.enabled || this.running) {
      return;
    }

    this.running = true;

    try {
      const settings = await this.settingsRepository.find({
        where: { syncEnabled: true },
        select: {
          userId: true,
          syncIntervalMinutes: true,
          syncAsanaEnabled: true,
          syncJiraEnabled: true,
        },
      });

      if (settings.length === 0) {
        return;
      }

      const userIds = settings.map((setting) => setting.userId);
      const connections = await this.connectionRepository.find({
        where: { userId: In(userIds) },
        select: {
          userId: true,
          provider: true,
        },
      });

      const providersByUser = new Map<string, Set<TaskManagerProviderType>>();
      for (const connection of connections) {
        if (connection.provider !== 'asana' && connection.provider !== 'jira') {
          continue;
        }

        const userProviders =
          providersByUser.get(connection.userId) ??
          new Set<TaskManagerProviderType>();
        userProviders.add(connection.provider);
        providersByUser.set(connection.userId, userProviders);
      }

      for (const setting of settings) {
        const availableProviders = providersByUser.get(setting.userId);
        if (!availableProviders || availableProviders.size === 0) {
          continue;
        }

        const intervalMinutes = resolveSyncIntervalMinutes(
          setting.syncIntervalMinutes,
        );

        if (setting.syncAsanaEnabled && availableProviders.has('asana')) {
          await this.startScheduledSyncIfDue(
            setting.userId,
            'asana',
            intervalMinutes,
          );
        }

        if (setting.syncJiraEnabled && availableProviders.has('jira')) {
          await this.startScheduledSyncIfDue(
            setting.userId,
            'jira',
            intervalMinutes,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Scheduled task sync sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private async startScheduledSyncIfDue(
    userId: string,
    provider: TaskManagerProviderType,
    intervalMinutes: number,
  ): Promise<void> {
    try {
      await this.taskSyncService.startScheduledSyncIfDue(
        userId,
        provider,
        intervalMinutes,
      );
    } catch (error) {
      this.logger.warn(
        `Scheduled sync dispatch failed for ${provider} user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
