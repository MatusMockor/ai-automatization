import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRulesModule } from '../automation-rules/automation-rules.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { ExecutionsModule } from '../executions/executions.module';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { TaskManagerConnection } from '../task-managers/entities/task-manager-connection.entity';
import { TaskManagersModule } from '../task-managers/task-managers.module';
import { TasksController } from './tasks.controller';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { SyncedTask } from './entities/synced-task.entity';
import { TaskScopeRepositoryDefault } from './entities/task-scope-repository-default.entity';
import { TaskSyncRun } from './entities/task-sync-run.entity';
import { TaskRepositoryDefaultsService } from './task-repository-defaults.service';
import { TaskAutomationOrchestratorService } from './task-automation-orchestrator.service';
import { TaskSyncSchedulerService } from './task-sync-scheduler.service';
import { TaskSyncService } from './task-sync.service';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    AutomationRulesModule,
    TaskManagersModule,
    RepositoriesModule,
    ExecutionsModule,
    EncryptionModule,
    TypeOrmModule.forFeature([
      TaskManagerConnection,
      SyncedTask,
      SyncedTaskScope,
      TaskSyncRun,
      TaskScopeRepositoryDefault,
      UserSettings,
    ]),
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskSyncService,
    TaskRepositoryDefaultsService,
    TaskAutomationOrchestratorService,
    TaskSyncSchedulerService,
  ],
})
export class TasksModule {}
