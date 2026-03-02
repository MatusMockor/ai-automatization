import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManualTasksController } from './manual-tasks.controller';
import { ManualTasksService } from './manual-tasks.service';
import { ManualTask } from './entities/manual-task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ManualTask])],
  controllers: [ManualTasksController],
  providers: [ManualTasksService],
  exports: [ManualTasksService],
})
export class ManualTasksModule {}
