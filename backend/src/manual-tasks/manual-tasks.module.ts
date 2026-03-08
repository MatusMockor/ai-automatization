import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRulesModule } from '../automation-rules/automation-rules.module';
import { Execution } from '../executions/entities/execution.entity';
import { ExecutionsModule } from '../executions/executions.module';
import { ManualTasksController } from './manual-tasks.controller';
import { ManualTasksService } from './manual-tasks.service';
import { ManualTask } from './entities/manual-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManualTask, Execution]),
    AutomationRulesModule,
    ExecutionsModule,
  ],
  controllers: [ManualTasksController],
  providers: [ManualTasksService],
  exports: [ManualTasksService],
})
export class ManualTasksModule {}
