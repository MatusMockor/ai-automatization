import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly executionsStartedTotal: Counter<string>;
  private readonly executionsCompletedTotal: Counter<string>;
  private readonly executionsFailedTotal: Counter<string>;
  private readonly executionsTimeoutTotal: Counter<string>;
  private readonly executionPublicationFailedTotal: Counter<string>;
  private readonly executionPreCommitChecksTotal: Counter<string>;
  private readonly retentionDeletedTotal: Counter<string>;
  private readonly executionDurationSeconds: Histogram<string>;
  private readonly executionPreCommitChecksDurationSeconds: Histogram<string>;
  private readonly queueWaitSeconds: Histogram<string>;

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
    });

    this.executionsStartedTotal = new Counter({
      name: 'executions_started_total',
      help: 'Count of execution runs started',
      registers: [this.registry],
    });
    this.executionsCompletedTotal = new Counter({
      name: 'executions_completed_total',
      help: 'Count of execution runs completed',
      registers: [this.registry],
    });
    this.executionsFailedTotal = new Counter({
      name: 'executions_failed_total',
      help: 'Count of execution runs failed',
      registers: [this.registry],
    });
    this.executionsTimeoutTotal = new Counter({
      name: 'executions_timeout_total',
      help: 'Count of execution runs timed out',
      registers: [this.registry],
    });
    this.executionPublicationFailedTotal = new Counter({
      name: 'execution_publication_failed_total',
      help: 'Count of execution publication failures',
      registers: [this.registry],
    });
    this.executionPreCommitChecksTotal = new Counter({
      name: 'execution_precommit_checks_total',
      help: 'Count of pre-commit checks outcomes',
      labelNames: ['status'],
      registers: [this.registry],
    });
    this.retentionDeletedTotal = new Counter({
      name: 'retention_deleted_total',
      help: 'Count of deleted retention artifacts',
      labelNames: ['target'],
      registers: [this.registry],
    });
    this.executionDurationSeconds = new Histogram({
      name: 'execution_duration_seconds',
      help: 'Execution runtime duration in seconds',
      buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
      registers: [this.registry],
    });
    this.executionPreCommitChecksDurationSeconds = new Histogram({
      name: 'execution_precommit_checks_duration_seconds',
      help: 'Pre-commit checks duration in seconds',
      buckets: [0.1, 0.5, 1, 3, 5, 10, 30, 60, 120, 300],
      registers: [this.registry],
    });
    this.queueWaitSeconds = new Histogram({
      name: 'queue_wait_seconds',
      help: 'Queue wait duration in seconds',
      buckets: [0.1, 0.5, 1, 3, 5, 10, 30, 60, 120, 300],
      registers: [this.registry],
    });
  }

  incrementExecutionsStarted(): void {
    this.executionsStartedTotal.inc();
  }

  incrementExecutionsCompleted(): void {
    this.executionsCompletedTotal.inc();
  }

  incrementExecutionsFailed(): void {
    this.executionsFailedTotal.inc();
  }

  incrementExecutionsTimeout(): void {
    this.executionsTimeoutTotal.inc();
  }

  incrementExecutionPublicationFailed(): void {
    this.executionPublicationFailedTotal.inc();
  }

  incrementExecutionPreCommitChecks(
    status: 'passed' | 'failed' | 'skipped',
  ): void {
    this.executionPreCommitChecksTotal.inc({ status });
  }

  observeExecutionDuration(seconds: number): void {
    this.executionDurationSeconds.observe(Math.max(0, seconds));
  }

  observeExecutionPreCommitChecksDuration(seconds: number): void {
    this.executionPreCommitChecksDurationSeconds.observe(Math.max(0, seconds));
  }

  observeQueueWait(seconds: number): void {
    this.queueWaitSeconds.observe(Math.max(0, seconds));
  }

  incrementRetentionDeleted(
    target: 'events' | 'output' | 'reports',
    by = 1,
  ): void {
    this.retentionDeletedTotal.inc({ target }, Math.max(0, by));
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
