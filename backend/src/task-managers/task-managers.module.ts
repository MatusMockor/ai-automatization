import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { TASK_MANAGER_PROVIDERS } from './constants/task-managers.tokens';
import { TaskManagerConnection } from './entities/task-manager-connection.entity';
import { AsanaTaskManagerProvider } from './providers/asana-task-manager.provider';
import { JiraTaskManagerProvider } from './providers/jira-task-manager.provider';
import { TaskManagerProviderRegistry } from './task-manager-provider.registry';
import { TaskManagersController } from './task-managers.controller';
import { TaskManagersService } from './task-managers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskManagerConnection]),
    EncryptionModule,
  ],
  controllers: [TaskManagersController],
  providers: [
    TaskManagersService,
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
  exports: [TaskManagersService, TaskManagerProviderRegistry],
})
export class TaskManagersModule {}
