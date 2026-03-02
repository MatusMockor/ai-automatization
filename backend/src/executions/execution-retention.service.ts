import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { MetricsService } from '../observability/metrics.service';
import { ManagedRepository } from '../repositories/entities/repository.entity';
import { ExecutionEvent } from './entities/execution-event.entity';
import { Execution } from './entities/execution.entity';

@Injectable()
export class ExecutionRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExecutionRetentionService.name);
  private readonly enabled: boolean;
  private readonly outputRetentionDays: number;
  private readonly eventsRetentionDays: number;
  private readonly reportRetentionDays: number;
  private readonly scheduleTimezone: 'UTC';
  private timerId: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    @InjectRepository(ExecutionEvent)
    private readonly executionEventRepository: Repository<ExecutionEvent>,
    @InjectRepository(ManagedRepository)
    private readonly managedRepositoryRepository: Repository<ManagedRepository>,
    private readonly metricsService: MetricsService,
    configService: ConfigService,
  ) {
    const enabledFlag = (
      configService.get<string>('EXECUTION_RETENTION_ENABLED', 'true') ?? 'true'
    )
      .trim()
      .toLowerCase();
    this.enabled = ['1', 'true', 'yes', 'on'].includes(enabledFlag);
    this.outputRetentionDays = parsePositiveInteger(
      configService.get<string>('EXECUTION_OUTPUT_RETENTION_DAYS', '30'),
      30,
    );
    this.eventsRetentionDays = parsePositiveInteger(
      configService.get<string>('EXECUTION_EVENTS_RETENTION_DAYS', '14'),
      14,
    );
    this.reportRetentionDays = parsePositiveInteger(
      configService.get<string>('EXECUTION_REPORT_RETENTION_DAYS', '30'),
      30,
    );
    const configuredTimezone =
      configService.get<string>('EXECUTION_RETENTION_TIMEZONE', 'UTC') ?? 'UTC';
    if (configuredTimezone.toUpperCase() !== 'UTC') {
      this.logger.warn(
        `Unsupported EXECUTION_RETENTION_TIMEZONE=${configuredTimezone}; falling back to UTC`,
      );
    }
    this.scheduleTimezone = 'UTC';
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Execution retention scheduler is disabled');
      return;
    }
    this.scheduleNextRun();
  }

  onModuleDestroy(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  async runCleanup(): Promise<void> {
    const outputCutoff = this.daysAgo(this.outputRetentionDays);
    const eventsCutoff = this.daysAgo(this.eventsRetentionDays);
    const reportsCutoff = this.daysAgo(this.reportRetentionDays);

    const deletedEvents = await this.executionEventRepository
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff: eventsCutoff })
      .execute();
    const deletedEventsCount = deletedEvents.affected ?? 0;
    if (deletedEventsCount > 0) {
      this.metricsService.incrementRetentionDeleted(
        'events',
        deletedEventsCount,
      );
    }

    const clearedOutputs = await this.executionRepository
      .createQueryBuilder()
      .update(Execution)
      .set({
        output: '',
        outputTruncated: false,
      })
      .where('created_at < :cutoff', { cutoff: outputCutoff })
      .andWhere("output <> ''")
      .andWhere("status IN ('completed', 'failed', 'cancelled')")
      .execute();
    const clearedOutputsCount = clearedOutputs.affected ?? 0;
    if (clearedOutputsCount > 0) {
      this.metricsService.incrementRetentionDeleted(
        'output',
        clearedOutputsCount,
      );
    }

    const deletedReportsCount =
      await this.deleteOldReportArtifacts(reportsCutoff);
    if (deletedReportsCount > 0) {
      this.metricsService.incrementRetentionDeleted(
        'reports',
        deletedReportsCount,
      );
    }

    this.logger.log(
      `Retention cleanup completed: events=${deletedEventsCount}, outputs=${clearedOutputsCount}, reports=${deletedReportsCount}`,
    );
  }

  private scheduleNextRun(): void {
    const nextRun = new Date();
    nextRun.setUTCHours(3, 15, 0, 0);
    if (nextRun.getTime() <= Date.now()) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const delayMs = nextRun.getTime() - Date.now();
    this.logger.log(
      `Scheduled next retention cleanup at ${nextRun.toISOString()} (${this.scheduleTimezone})`,
    );
    this.timerId = setTimeout(() => {
      this.runCleanup()
        .catch((error: unknown) => {
          this.logger.error(
            'Retention cleanup failed',
            error instanceof Error ? error.stack : String(error),
          );
        })
        .finally(() => {
          this.scheduleNextRun();
        });
    }, delayMs);
  }

  private daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private async deleteOldReportArtifacts(cutoff: Date): Promise<number> {
    const repositories = await this.managedRepositoryRepository.find({
      select: {
        localPath: true,
      },
    });

    const localPaths = new Set(repositories.map((repo) => repo.localPath));
    let deletedCount = 0;
    for (const localPath of localPaths) {
      const reportsDir = join(localPath, '.ai', 'executions');
      let entries: string[] = [];
      try {
        entries = await readdir(reportsDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.endsWith('.md')) {
          continue;
        }

        const absolutePath = join(reportsDir, entry);
        try {
          const fileStats = await stat(absolutePath);
          if (fileStats.mtime >= cutoff) {
            continue;
          }
          await rm(absolutePath, { force: true });
          deletedCount += 1;
        } catch {
          // best-effort cleanup
        }
      }
    }

    return deletedCount;
  }
}
