import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { Execution } from './entities/execution.entity';
import { ExecutionPublicationService } from './execution-publication.service';
import { ExecutionsController } from './executions.controller';
import { ExecutionStreamHub } from './execution-stream.hub';
import { ExecutionRuntimeManager } from './execution-runtime.manager';
import { ExecutionsService } from './executions.service';
import { BranchNameBuilder } from './publication/branch-name.builder';
import { PublicationContentResolver } from './publication/publication-content.resolver';
import { PullRequestTemplateResolver } from './publication/pull-request-template.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([Execution]),
    RepositoriesModule,
    SettingsModule,
  ],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    ExecutionStreamHub,
    ExecutionPublicationService,
    ExecutionRuntimeManager,
    BranchNameBuilder,
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
