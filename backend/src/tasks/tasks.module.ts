import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { TaskManagersModule } from '../task-managers/task-managers.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [TaskManagersModule, RepositoriesModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
