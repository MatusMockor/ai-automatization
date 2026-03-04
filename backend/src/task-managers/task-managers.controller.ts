import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { RequestUser } from '../auth/interfaces/request-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConnectionTasksResponseDto } from './dto/connection-tasks-response.dto';
import { CreateTaskManagerConnectionDto } from './dto/create-task-manager-connection.dto';
import { GetConnectionTasksQueryDto } from './dto/get-connection-tasks-query.dto';
import { TaskManagerConnectionResponseDto } from './dto/task-manager-connection-response.dto';
import { TaskManagersService } from './task-managers.service';

@Controller('task-managers/connections')
export class TaskManagersController {
  constructor(private readonly taskManagersService: TaskManagersService) {}

  @Get()
  listConnections(
    @CurrentUser() user: RequestUser,
  ): Promise<TaskManagerConnectionResponseDto[]> {
    return this.taskManagersService.listConnectionsForUser(user.id);
  }

  @Post()
  createConnection(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTaskManagerConnectionDto,
  ): Promise<TaskManagerConnectionResponseDto> {
    return this.taskManagersService.createConnectionForUser(user.id, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  async deleteConnection(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) connectionId: string,
  ): Promise<void> {
    await this.taskManagersService.deleteConnectionForUser(
      user.id,
      connectionId,
    );
  }

  @Get(':id/tasks')
  fetchTasks(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) connectionId: string,
    @Query() query: GetConnectionTasksQueryDto,
  ): Promise<ConnectionTasksResponseDto> {
    return this.taskManagersService.fetchTasksForConnection(
      user.id,
      connectionId,
      query.limit,
    );
  }
}
