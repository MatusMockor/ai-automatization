import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoriesModule } from '../repositories/repositories.module';
import { SettingsModule } from '../settings/settings.module';
import { ChildProcessClaudeCliRunner } from './adapters/child-process-claude-cli.runner';
import { CLAUDE_CLI_RUNNER } from './constants/executions.tokens';
import { Execution } from './entities/execution.entity';
import { ExecutionsController } from './executions.controller';
import { ExecutionStreamHub } from './execution-stream.hub';
import { ExecutionRuntimeManager } from './execution-runtime.manager';
import { ExecutionsService } from './executions.service';

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
    ExecutionRuntimeManager,
    {
      provide: CLAUDE_CLI_RUNNER,
      useClass: ChildProcessClaudeCliRunner,
    },
  ],
})
export class ExecutionsModule {}
