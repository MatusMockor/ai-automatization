import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { RequestUser } from '../auth/interfaces/request-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AutomationInboxService } from './automation-inbox.service';
import { AutomationInboxHistoryResponseDto } from './dto/automation-inbox-history-response.dto';
import { AutomationInboxResponseDto } from './dto/automation-inbox-response.dto';
import { GetAutomationInboxQueryDto } from './dto/get-automation-inbox-query.dto';
import { SnoozeAutomationInboxItemDto } from './dto/snooze-automation-inbox-item.dto';
import { TaskKeyAutomationInboxItemDto } from './dto/task-key-automation-inbox-item.dto';

@Controller('automation-inbox')
export class AutomationInboxController {
  constructor(
    private readonly automationInboxService: AutomationInboxService,
  ) {}

  @Get()
  listInbox(
    @CurrentUser() user: RequestUser,
    @Query() query: GetAutomationInboxQueryDto,
  ): Promise<AutomationInboxResponseDto> {
    return this.automationInboxService.listForUser(user.id, query);
  }

  @HttpCode(204)
  @Post('snooze')
  async snoozeTask(
    @CurrentUser() user: RequestUser,
    @Body() dto: SnoozeAutomationInboxItemDto,
  ): Promise<void> {
    await this.automationInboxService.snoozeForUser(user.id, dto);
  }

  @HttpCode(204)
  @Post('dismiss')
  async dismissTask(
    @CurrentUser() user: RequestUser,
    @Body() dto: TaskKeyAutomationInboxItemDto,
  ): Promise<void> {
    await this.automationInboxService.dismissForUser(user.id, dto);
  }

  @HttpCode(204)
  @Post('restore')
  async restoreTask(
    @CurrentUser() user: RequestUser,
    @Body() dto: TaskKeyAutomationInboxItemDto,
  ): Promise<void> {
    await this.automationInboxService.restoreForUser(user.id, dto);
  }

  @Get(':taskKey/history')
  getTaskHistory(
    @CurrentUser() user: RequestUser,
    @Param('taskKey') taskKey: string,
  ): Promise<AutomationInboxHistoryResponseDto> {
    return this.automationInboxService.getHistoryForUser(user.id, taskKey);
  }
}
