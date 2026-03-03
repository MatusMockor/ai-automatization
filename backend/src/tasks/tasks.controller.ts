import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { RequestUser } from '../auth/interfaces/request-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DeleteTaskRepositoryDefaultDto } from './dto/delete-task-repository-default.dto';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { StartTaskSyncResponseDto } from './dto/start-task-sync-response.dto';
import { TaskRepositoryDefaultsResponseDto } from './dto/task-repository-defaults-response.dto';
import { TaskScopesResponseDto } from './dto/task-scopes-response.dto';
import { TaskSyncRunResponseDto } from './dto/task-sync-run-response.dto';
import { TaskFeedResponseDto } from './dto/task-feed-response.dto';
import { UpsertTaskRepositoryDefaultDto } from './dto/upsert-task-repository-default.dto';
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

  @HttpCode(202)
  @Post('sync')
  startSync(
    @CurrentUser() user: RequestUser,
  ): Promise<StartTaskSyncResponseDto> {
    return this.tasksService.startSyncForUser(user.id);
  }

  @Get('sync-runs/:id')
  getSyncRun(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) runId: string,
  ): Promise<TaskSyncRunResponseDto> {
    return this.tasksService.getSyncRunForUser(user.id, runId);
  }

  @Get('scopes')
  getScopes(@CurrentUser() user: RequestUser): Promise<TaskScopesResponseDto> {
    return this.tasksService.listScopesForUser(user.id);
  }

  @Get('repository-defaults')
  getRepositoryDefaults(
    @CurrentUser() user: RequestUser,
  ): Promise<TaskRepositoryDefaultsResponseDto> {
    return this.tasksService.listRepositoryDefaultsForUser(user.id);
  }

  @Put('repository-defaults')
  putRepositoryDefault(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpsertTaskRepositoryDefaultDto,
  ): Promise<TaskRepositoryDefaultsResponseDto> {
    return this.tasksService.upsertRepositoryDefaultForUser(user.id, dto);
  }

  @Delete('repository-defaults')
  @HttpCode(204)
  async deleteRepositoryDefault(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteTaskRepositoryDefaultDto,
  ): Promise<void> {
    await this.tasksService.deleteRepositoryDefaultForUser(user.id, dto);
  }
}
