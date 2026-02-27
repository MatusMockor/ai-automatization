import { Controller, Get, Query } from '@nestjs/common';
import type { RequestUser } from '../auth/interfaces/request-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { TaskFeedResponseDto } from './dto/task-feed-response.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  getTasks(
    @CurrentUser() user: RequestUser,
    @Query() query: GetTasksQueryDto,
  ): Promise<TaskFeedResponseDto> {
    return this.tasksService.getTasksForUser(user.id, query);
  }
}
