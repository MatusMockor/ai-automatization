import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ExecutionAction } from '../executions/interfaces/execution.types';
import { RepositoriesService } from '../repositories/repositories.service';
import type { TaskItemStatus } from '../task-managers/interfaces/task-manager-provider.interface';
import { SyncedTaskScope } from '../tasks/entities/synced-task-scope.entity';
import { SyncedTask } from '../tasks/entities/synced-task.entity';
import { AutomationRuleResponseDto } from './dto/automation-rule-response.dto';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import {
  AutomationRule,
  AutomationRuleScopeType,
} from './entities/automation-rule.entity';

export type AutomationRuleMatch = {
  ruleId: string;
  ruleName: string;
  repositoryId: string;
  suggestedAction: ExecutionAction | null;
};

type TaskSnapshotLike = Pick<SyncedTask, 'provider' | 'title' | 'status'> & {
  scopes: SyncedTaskScope[];
};

@Injectable()
export class AutomationRulesService {
  constructor(
    @InjectRepository(AutomationRule)
    private readonly automationRulesRepository: Repository<AutomationRule>,
    private readonly repositoriesService: RepositoriesService,
  ) {}

  async listForUser(userId: string): Promise<AutomationRuleResponseDto[]> {
    const rules = await this.automationRulesRepository.find({
      where: { userId },
      order: {
        priority: 'DESC',
        createdAt: 'ASC',
        id: 'ASC',
      },
    });

    return rules.map((rule) => this.mapToResponse(rule));
  }

  async listActiveRulesForUser(userId: string): Promise<AutomationRule[]> {
    return this.automationRulesRepository.find({
      where: {
        userId,
        enabled: true,
      },
      order: {
        priority: 'DESC',
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
  }

  async createForUser(
    userId: string,
    dto: CreateAutomationRuleDto,
  ): Promise<AutomationRuleResponseDto> {
    await this.repositoriesService.assertOwnedRepository(
      userId,
      dto.repositoryId,
    );
    this.validateScopeCompatibility(
      dto.provider,
      dto.scopeType ?? null,
      dto.scopeId ?? null,
    );

    const rule = this.automationRulesRepository.create({
      userId,
      name: dto.name,
      enabled: dto.enabled ?? true,
      priority: dto.priority ?? 0,
      provider: dto.provider,
      scopeType: dto.scopeType ?? null,
      scopeId: dto.scopeId ?? null,
      titleContains: dto.titleContains ?? null,
      taskStatuses: dto.taskStatuses ?? null,
      repositoryId: dto.repositoryId,
      suggestedAction: dto.suggestedAction ?? null,
    });

    const savedRule = await this.automationRulesRepository.save(rule);
    return this.mapToResponse(savedRule);
  }

  async updateForUser(
    userId: string,
    ruleId: string,
    dto: UpdateAutomationRuleDto,
  ): Promise<AutomationRuleResponseDto> {
    if (this.isPatchEmpty(dto)) {
      throw new BadRequestException(
        'At least one field must be provided for update',
      );
    }

    const rule = await this.getOwnedRule(userId, ruleId);

    if (dto.name !== undefined) {
      rule.name = dto.name;
    }
    if (dto.enabled !== undefined) {
      rule.enabled = dto.enabled;
    }
    if (dto.priority !== undefined) {
      rule.priority = dto.priority;
    }
    if (dto.provider !== undefined) {
      rule.provider = dto.provider;
    }
    if (dto.scopeType !== undefined) {
      rule.scopeType = dto.scopeType ?? null;
    }
    if (dto.scopeId !== undefined) {
      rule.scopeId = dto.scopeId ?? null;
    }
    if (dto.titleContains !== undefined) {
      rule.titleContains = dto.titleContains ?? null;
    }
    if (dto.taskStatuses !== undefined) {
      rule.taskStatuses = dto.taskStatuses ?? null;
    }
    if (dto.repositoryId !== undefined) {
      await this.repositoriesService.assertOwnedRepository(
        userId,
        dto.repositoryId,
      );
      rule.repositoryId = dto.repositoryId;
    }
    if (dto.suggestedAction !== undefined) {
      rule.suggestedAction = dto.suggestedAction ?? null;
    }

    this.validateScopeCompatibility(
      rule.provider,
      rule.scopeType,
      rule.scopeId,
    );

    const savedRule = await this.automationRulesRepository.save(rule);
    return this.mapToResponse(savedRule);
  }

  async deleteForUser(userId: string, ruleId: string): Promise<void> {
    const rule = await this.getOwnedRule(userId, ruleId);
    await this.automationRulesRepository.remove(rule);
  }

  resolveTaskMatch(
    task: TaskSnapshotLike,
    rules: AutomationRule[],
  ): AutomationRuleMatch | null {
    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      if (!this.matchesRule(rule, task)) {
        continue;
      }

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        repositoryId: rule.repositoryId,
        suggestedAction: rule.suggestedAction,
      };
    }

    return null;
  }

  private matchesRule(rule: AutomationRule, task: TaskSnapshotLike): boolean {
    if (rule.provider !== task.provider) {
      return false;
    }

    if (!this.matchesScope(rule.scopeType, rule.scopeId, task.scopes)) {
      return false;
    }

    if (!this.matchesTitle(rule.titleContains, task.title)) {
      return false;
    }

    return this.matchesStatus(rule.taskStatuses, task.status);
  }

  private matchesScope(
    scopeType: AutomationRuleScopeType | null,
    scopeId: string | null,
    scopes: SyncedTaskScope[],
  ): boolean {
    if (scopeType === null || scopeId === null) {
      return true;
    }

    if (scopeType === 'asana_workspace') {
      return scopes.some(
        (scope) =>
          (scope.scopeType === 'asana_workspace' &&
            scope.scopeId === scopeId) ||
          (scope.scopeType === 'asana_project' &&
            scope.parentScopeType === 'asana_workspace' &&
            scope.parentScopeId === scopeId),
      );
    }

    return scopes.some(
      (scope) => scope.scopeType === scopeType && scope.scopeId === scopeId,
    );
  }

  private matchesTitle(titleContains: string[] | null, title: string): boolean {
    if (!titleContains || titleContains.length === 0) {
      return true;
    }

    const normalizedTitle = title.toLocaleLowerCase();
    return titleContains.every((phrase) =>
      normalizedTitle.includes(phrase.toLocaleLowerCase()),
    );
  }

  private matchesStatus(
    taskStatuses: TaskItemStatus[] | null,
    status: TaskItemStatus,
  ): boolean {
    if (!taskStatuses || taskStatuses.length === 0) {
      return true;
    }

    return taskStatuses.includes(status);
  }

  private validateScopeCompatibility(
    provider: 'asana' | 'jira',
    scopeType: AutomationRuleScopeType | null,
    scopeId: string | null,
  ): void {
    if ((scopeType === null) !== (scopeId === null)) {
      throw new BadRequestException(
        'scopeType and scopeId must both be provided or both be omitted',
      );
    }

    if (scopeType === null) {
      return;
    }

    if (provider === 'asana') {
      if (scopeType === 'jira_project') {
        throw new BadRequestException(
          'scopeType is not compatible with the selected provider',
        );
      }
      return;
    }

    if (scopeType !== 'jira_project') {
      throw new BadRequestException(
        'scopeType is not compatible with the selected provider',
      );
    }
  }

  private async getOwnedRule(
    userId: string,
    ruleId: string,
  ): Promise<AutomationRule> {
    const rule = await this.automationRulesRepository.findOneBy({
      id: ruleId,
      userId,
    });

    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }

    return rule;
  }

  private isPatchEmpty(dto: UpdateAutomationRuleDto): boolean {
    return (
      dto.name === undefined &&
      dto.enabled === undefined &&
      dto.priority === undefined &&
      dto.provider === undefined &&
      dto.scopeType === undefined &&
      dto.scopeId === undefined &&
      dto.titleContains === undefined &&
      dto.taskStatuses === undefined &&
      dto.repositoryId === undefined &&
      dto.suggestedAction === undefined
    );
  }

  private mapToResponse(rule: AutomationRule): AutomationRuleResponseDto {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      provider: rule.provider,
      scopeType: rule.scopeType,
      scopeId: rule.scopeId,
      titleContains: rule.titleContains,
      taskStatuses: rule.taskStatuses,
      repositoryId: rule.repositoryId,
      suggestedAction: rule.suggestedAction,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
