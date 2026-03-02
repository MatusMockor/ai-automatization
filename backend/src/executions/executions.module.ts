import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedactionService } from '../common/security/redaction.service';
import { ManagedRepository } from '../repositories/entities/repository.entity';
import { RepositoriesModule } from '../repositories/repositories.module';
import { SettingsModule } from '../settings/settings.module';
import { ChildProcessClaudeCliRunner } from './adapters/child-process-claude-cli.runner';
import { CliGitPublicationClient } from './adapters/cli-git-publication.client';
import { GithubApiPullRequestsGateway } from './adapters/github-api-pull-requests.gateway';
import {
  CLAUDE_CLI_RUNNER,
  GITHUB_PULL_REQUESTS_GATEWAY,
  GIT_PUBLICATION_CLIENT,
} from './constants/executions.tokens';
import { ExecutionEvent } from './entities/execution-event.entity';
import { Execution } from './entities/execution.entity';
import { ExecutionDispatchService } from './execution-dispatch.service';
import { ExecutionEventStoreService } from './execution-event-store.service';
import { ExecutionOrchestratorService } from './execution-orchestrator.service';
import { ExecutionPublicationService } from './execution-publication.service';
import { ExecutionQueueService } from './execution-queue.service';
import { ExecutionRetentionService } from './execution-retention.service';
import { ExecutionsController } from './executions.controller';
import { ExecutionStreamHub } from './execution-stream.hub';
import { ExecutionRuntimeManager } from './execution-runtime.manager';
import { ExecutionWorkerService } from './execution-worker.service';
import { ExecutionsService } from './executions.service';
import { BranchNameBuilder } from './publication/branch-name.builder';
import { ExecutionReportArtifactService } from './publication/execution-report-artifact.service';
import { PublicationContentResolver } from './publication/publication-content.resolver';
import { PullRequestTemplateResolver } from './publication/pull-request-template.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([Execution, ExecutionEvent, ManagedRepository]),
    RepositoriesModule,
    SettingsModule,
  ],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    ExecutionDispatchService,
    ExecutionEventStoreService,
    ExecutionQueueService,
    ExecutionOrchestratorService,
    ExecutionWorkerService,
    ExecutionRetentionService,
    RedactionService,
    ExecutionStreamHub,
    ExecutionPublicationService,
    ExecutionRuntimeManager,
    BranchNameBuilder,
    ExecutionReportArtifactService,
    PullRequestTemplateResolver,
    PublicationContentResolver,
    {
      provide: CLAUDE_CLI_RUNNER,
      useClass: ChildProcessClaudeCliRunner,
    },
    {
      provide: GIT_PUBLICATION_CLIENT,
      useClass: CliGitPublicationClient,
    },
    {
      provide: GITHUB_PULL_REQUESTS_GATEWAY,
      useClass: GithubApiPullRequestsGateway,
    },
  ],
})
export class ExecutionsModule {}
