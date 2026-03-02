import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { RequestUser } from '../auth/interfaces/request-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateManualTaskDto } from './dto/create-manual-task.dto';
import { ManualTaskResponseDto } from './dto/manual-task-response.dto';
import { UpdateManualTaskDto } from './dto/update-manual-task.dto';
import { ManualTasksService } from './manual-tasks.service';

@Controller('manual-tasks')
export class ManualTasksController {
  constructor(private readonly manualTasksService: ManualTasksService) {}

  @Get()
  listManualTasks(
    @CurrentUser() user: RequestUser,
  ): Promise<ManualTaskResponseDto[]> {
    return this.manualTasksService.listForUser(user.id);
  }

  @Post()
  createManualTask(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateManualTaskDto,
  ): Promise<ManualTaskResponseDto> {
    return this.manualTasksService.createForUser(user.id, dto);
  }

  @Patch(':id')
  updateManualTask(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() dto: UpdateManualTaskDto,
  ): Promise<ManualTaskResponseDto> {
    return this.manualTasksService.updateForUser(user.id, taskId, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  async deleteManualTask(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
  ): Promise<void> {
    await this.manualTasksService.deleteForUser(user.id, taskId);
  }
}
