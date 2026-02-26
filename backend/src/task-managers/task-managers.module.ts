import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { TASK_MANAGER_PROVIDERS } from './constants/task-managers.tokens';
import { TaskManagerConnection } from './entities/task-manager-connection.entity';
import { TaskPrefix } from './entities/task-prefix.entity';
import { AsanaTaskManagerProvider } from './providers/asana-task-manager.provider';
import { JiraTaskManagerProvider } from './providers/jira-task-manager.provider';
import { TaskFilterService } from './task-filter.service';
import { TaskManagerProviderRegistry } from './task-manager-provider.registry';
import { TaskManagersController } from './task-managers.controller';
import { TaskManagersService } from './task-managers.service';
import { TaskPrefixService } from './task-prefix.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskManagerConnection, TaskPrefix]),
    EncryptionModule,
  ],
  controllers: [TaskManagersController],
  providers: [
    TaskManagersService,
    TaskPrefixService,
    TaskFilterService,
    TaskManagerProviderRegistry,
    AsanaTaskManagerProvider,
    JiraTaskManagerProvider,
    {
      provide: TASK_MANAGER_PROVIDERS,
      useFactory: (
        asanaProvider: AsanaTaskManagerProvider,
        jiraProvider: JiraTaskManagerProvider,
      ) => [asanaProvider, jiraProvider],
      inject: [AsanaTaskManagerProvider, JiraTaskManagerProvider],
    },
  ],
  exports: [TaskManagersService],
})
export class TaskManagersModule {}
