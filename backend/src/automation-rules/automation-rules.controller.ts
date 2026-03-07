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
import { AutomationRuleResponseDto } from './dto/automation-rule-response.dto';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import { AutomationRulesService } from './automation-rules.service';

@Controller('automation-rules')
export class AutomationRulesController {
  constructor(
    private readonly automationRulesService: AutomationRulesService,
  ) {}

  @Get()
  listRules(
    @CurrentUser() user: RequestUser,
  ): Promise<AutomationRuleResponseDto[]> {
    return this.automationRulesService.listForUser(user.id);
  }

  @Post()
  createRule(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAutomationRuleDto,
  ): Promise<AutomationRuleResponseDto> {
    return this.automationRulesService.createForUser(user.id, dto);
  }

  @Patch(':id')
  updateRule(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) ruleId: string,
    @Body() dto: UpdateAutomationRuleDto,
  ): Promise<AutomationRuleResponseDto> {
    return this.automationRulesService.updateForUser(user.id, ruleId, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  async deleteRule(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) ruleId: string,
  ): Promise<void> {
    await this.automationRulesService.deleteForUser(user.id, ruleId);
  }
}
