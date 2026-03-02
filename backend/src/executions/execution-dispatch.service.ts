import { Injectable, Logger } from '@nestjs/common';
import { ExecutionOrchestratorService } from './execution-orchestrator.service';
import { ExecutionQueueService } from './execution-queue.service';

@Injectable()
export class ExecutionDispatchService {
  private readonly logger = new Logger(ExecutionDispatchService.name);

  constructor(
    private readonly executionQueueService: ExecutionQueueService,
    private readonly executionOrchestratorService: ExecutionOrchestratorService,
  ) {}

  async dispatch(executionId: string): Promise<void> {
    if (this.executionQueueService.isInlineDriver()) {
      setImmediate(() => {
        this.executionOrchestratorService
          .processExecution(executionId)
          .catch((error: unknown) => {
            this.logger.error(
              `Inline execution dispatch failed for ${executionId}`,
              error instanceof Error ? error.stack : String(error),
            );
          });
      });
      return;
    }

    await this.executionQueueService.enqueue(executionId);
  }
}
