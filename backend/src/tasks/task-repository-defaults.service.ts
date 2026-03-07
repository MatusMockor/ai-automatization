import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { RepositoriesService } from '../repositories/repositories.service';
import type { TaskManagerProviderType } from '../task-managers/interfaces/task-manager-provider.interface';
import { DeleteTaskRepositoryDefaultDto } from './dto/delete-task-repository-default.dto';
import {
  TaskRepositoryDefaultItemDto,
  TaskRepositoryDefaultsResponseDto,
} from './dto/task-repository-defaults-response.dto';
import { UpsertTaskRepositoryDefaultDto } from './dto/upsert-task-repository-default.dto';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { TaskScopeRepositoryDefault } from './entities/task-scope-repository-default.entity';

type ResolvedScope = {
  scopeType: 'asana_project' | 'asana_workspace' | 'jira_project' | null;
  scopeId: string | null;
};

type DatabaseError = QueryFailedError & {
  code?: string;
  driverError?: {
    code?: string;
    errno?: number;
    message?: string;
  };
};

export type RepositorySelectionSource =
  | 'automation_rule'
  | 'asana_project'
  | 'asana_workspace'
  | 'jira_project'
  | 'provider_default'
  | null;

export type ResolvedRepositorySelection = {
  repositoryId: string | null;
  source: RepositorySelectionSource;
};

type RepositoryDefaultsLookup = {
  providerDefaults: Map<TaskManagerProviderType, string>;
  scopedDefaults: Map<string, string>;
};

@Injectable()
export class TaskRepositoryDefaultsService {
  constructor(
    @InjectRepository(TaskScopeRepositoryDefault)
    private readonly defaultsRepository: Repository<TaskScopeRepositoryDefault>,
    private readonly repositoriesService: RepositoriesService,
  ) {}

  async listForUser(
    userId: string,
  ): Promise<TaskRepositoryDefaultsResponseDto> {
    const defaults = await this.defaultsRepository.find({
      where: { userId },
      order: {
        provider: 'ASC',
        scopeType: 'ASC',
        scopeId: 'ASC',
      },
    });

    return {
      items: defaults.map((item) => this.mapToResponse(item)),
    };
  }

  async upsertForUser(
    userId: string,
    dto: UpsertTaskRepositoryDefaultDto,
  ): Promise<TaskRepositoryDefaultItemDto> {
    const scope = this.resolveScope(dto.provider, dto.scopeType, dto.scopeId);
    await this.repositoriesService.assertOwnedRepository(
      userId,
      dto.repositoryId,
    );

    const values = {
      userId,
      provider: dto.provider,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      repositoryId: dto.repositoryId,
    };

    if (this.isPostgres()) {
      const queryBuilder = this.defaultsRepository
        .createQueryBuilder()
        .insert()
        .into(TaskScopeRepositoryDefault)
        .values(values);

      if (scope.scopeType === null && scope.scopeId === null) {
        queryBuilder.onConflict(
          `("user_id","provider") WHERE "scope_type" IS NULL AND "scope_id" IS NULL DO UPDATE SET "repository_id" = EXCLUDED."repository_id", "updated_at" = now()`,
        );
      } else {
        queryBuilder.onConflict(
          `("user_id","provider","scope_type","scope_id") WHERE "scope_type" IS NOT NULL AND "scope_id" IS NOT NULL DO UPDATE SET "repository_id" = EXCLUDED."repository_id", "updated_at" = now()`,
        );
      }

      await queryBuilder.execute();
    } else {
      await this.upsertDefaultPortable(userId, dto.provider, scope, values);
    }

    const saved = await this.findExistingDefault(
      userId,
      dto.provider,
      scope.scopeType,
      scope.scopeId,
    );
    if (!saved) {
      throw new BadRequestException('Failed to upsert repository default');
    }

    return this.mapToResponse(saved);
  }

  async deleteForUser(
    userId: string,
    dto: DeleteTaskRepositoryDefaultDto,
  ): Promise<void> {
    const scope = this.resolveScope(dto.provider, dto.scopeType, dto.scopeId);

    const existing = await this.findExistingDefault(
      userId,
      dto.provider,
      scope.scopeType,
      scope.scopeId,
    );
    if (!existing) {
      return;
    }

    await this.defaultsRepository.delete({ id: existing.id, userId });
  }

  async buildLookupForUser(userId: string): Promise<RepositoryDefaultsLookup> {
    const defaults = await this.defaultsRepository.find({
      where: { userId },
      select: {
        provider: true,
        scopeType: true,
        scopeId: true,
        repositoryId: true,
      },
    });

    const providerDefaults = new Map<TaskManagerProviderType, string>();
    const scopedDefaults = new Map<string, string>();

    for (const item of defaults) {
      if (item.scopeType === null && item.scopeId === null) {
        providerDefaults.set(item.provider, item.repositoryId);
        continue;
      }

      if (item.scopeType === null || item.scopeId === null) {
        continue;
      }

      scopedDefaults.set(
        this.buildScopedKey(item.provider, item.scopeType, item.scopeId),
        item.repositoryId,
      );
    }

    return {
      providerDefaults,
      scopedDefaults,
    };
  }

  resolveSuggestedRepository(
    provider: TaskManagerProviderType,
    scopes: SyncedTaskScope[],
    lookup: RepositoryDefaultsLookup,
  ): ResolvedRepositorySelection {
    if (provider === 'asana') {
      const projectDefaults = this.resolveAsanaProjectDefault(scopes, lookup);
      if (projectDefaults) {
        return projectDefaults;
      }

      const workspaceDefaults = this.resolveAsanaWorkspaceDefault(
        scopes,
        lookup,
      );
      if (workspaceDefaults) {
        return workspaceDefaults;
      }
    }

    if (provider === 'jira') {
      const jiraProjectDefault = this.resolveJiraProjectDefault(scopes, lookup);
      if (jiraProjectDefault) {
        return jiraProjectDefault;
      }
    }

    const providerDefault = lookup.providerDefaults.get(provider);
    if (!providerDefault) {
      return {
        repositoryId: null,
        source: null,
      };
    }

    return {
      repositoryId: providerDefault,
      source: 'provider_default',
    };
  }

  private resolveAsanaProjectDefault(
    scopes: SyncedTaskScope[],
    lookup: RepositoryDefaultsLookup,
  ): ResolvedRepositorySelection | null {
    const sortedScopes = this.sortScopes(scopes).filter(
      (scope) => scope.scopeType === 'asana_project',
    );

    for (const scope of sortedScopes) {
      const repositoryId = lookup.scopedDefaults.get(
        this.buildScopedKey('asana', 'asana_project', scope.scopeId),
      );
      if (repositoryId) {
        return {
          repositoryId,
          source: 'asana_project',
        };
      }
    }

    return null;
  }

  private resolveAsanaWorkspaceDefault(
    scopes: SyncedTaskScope[],
    lookup: RepositoryDefaultsLookup,
  ): ResolvedRepositorySelection | null {
    const workspaceIds = new Set<string>();

    for (const scope of this.sortScopes(scopes)) {
      if (scope.scopeType === 'asana_workspace') {
        workspaceIds.add(scope.scopeId);
      }
      if (
        scope.scopeType === 'asana_project' &&
        scope.parentScopeType === 'asana_workspace' &&
        scope.parentScopeId
      ) {
        workspaceIds.add(scope.parentScopeId);
      }
    }

    for (const workspaceId of workspaceIds) {
      const repositoryId = lookup.scopedDefaults.get(
        this.buildScopedKey('asana', 'asana_workspace', workspaceId),
      );
      if (repositoryId) {
        return {
          repositoryId,
          source: 'asana_workspace',
        };
      }
    }

    return null;
  }

  private resolveJiraProjectDefault(
    scopes: SyncedTaskScope[],
    lookup: RepositoryDefaultsLookup,
  ): ResolvedRepositorySelection | null {
    const sortedScopes = this.sortScopes(scopes).filter(
      (scope) => scope.scopeType === 'jira_project',
    );

    for (const scope of sortedScopes) {
      const repositoryId = lookup.scopedDefaults.get(
        this.buildScopedKey('jira', 'jira_project', scope.scopeId),
      );
      if (repositoryId) {
        return {
          repositoryId,
          source: 'jira_project',
        };
      }
    }

    return null;
  }

  private async findExistingDefault(
    userId: string,
    provider: TaskManagerProviderType,
    scopeType: ResolvedScope['scopeType'],
    scopeId: string | null,
  ): Promise<TaskScopeRepositoryDefault | null> {
    return this.defaultsRepository.findOne({
      where: {
        userId,
        provider,
        scopeType: scopeType === null ? IsNull() : scopeType,
        scopeId: scopeId === null ? IsNull() : scopeId,
      },
    });
  }

  private async upsertDefaultPortable(
    userId: string,
    provider: TaskManagerProviderType,
    scope: ResolvedScope,
    values: Pick<
      TaskScopeRepositoryDefault,
      'userId' | 'provider' | 'scopeType' | 'scopeId' | 'repositoryId'
    >,
  ): Promise<void> {
    const where = {
      userId,
      provider,
      scopeType: scope.scopeType === null ? IsNull() : scope.scopeType,
      scopeId: scope.scopeId === null ? IsNull() : scope.scopeId,
    };

    const updated = await this.defaultsRepository.update(where, {
      repositoryId: values.repositoryId,
    });
    if ((updated.affected ?? 0) > 0) {
      return;
    }

    try {
      await this.defaultsRepository.insert(values);
      return;
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
    }

    await this.defaultsRepository.update(where, {
      repositoryId: values.repositoryId,
    });
  }

  private isPostgres(): boolean {
    return (
      this.defaultsRepository.manager.connection.options.type === 'postgres'
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const databaseError = error as DatabaseError;
    const driverCode = databaseError.driverError?.code;
    const driverErrno = databaseError.driverError?.errno;
    const driverMessage =
      databaseError.driverError?.message ?? databaseError.message ?? '';

    return (
      databaseError.code === '23505' ||
      driverCode === '23505' ||
      databaseError.code === 'SQLITE_CONSTRAINT' ||
      driverCode === 'SQLITE_CONSTRAINT' ||
      driverErrno === 2067 ||
      /unique/i.test(driverMessage)
    );
  }

  private mapToResponse(
    item: TaskScopeRepositoryDefault,
  ): TaskRepositoryDefaultItemDto {
    return {
      id: item.id,
      provider: item.provider,
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      repositoryId: item.repositoryId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private resolveScope(
    provider: TaskManagerProviderType,
    scopeType: string | undefined,
    scopeId: string | undefined,
  ): ResolvedScope {
    const normalizedScopeType = scopeType?.trim();
    const normalizedScopeId = scopeId?.trim();

    const hasScopeType = Boolean(normalizedScopeType);
    const hasScopeId = Boolean(normalizedScopeId);

    if (!hasScopeType && !hasScopeId) {
      return {
        scopeType: null,
        scopeId: null,
      };
    }

    if (hasScopeType !== hasScopeId) {
      throw new BadRequestException(
        'scopeType and scopeId must be provided together',
      );
    }

    if (provider === 'asana') {
      if (
        normalizedScopeType !== 'asana_project' &&
        normalizedScopeType !== 'asana_workspace'
      ) {
        throw new BadRequestException(
          'Invalid scopeType for Asana provider defaults',
        );
      }
    } else if (normalizedScopeType !== 'jira_project') {
      throw new BadRequestException(
        'Invalid scopeType for Jira provider defaults',
      );
    }

    return {
      scopeType: normalizedScopeType,
      scopeId: normalizedScopeId ?? null,
    };
  }

  private buildScopedKey(
    provider: TaskManagerProviderType,
    scopeType: 'asana_project' | 'asana_workspace' | 'jira_project',
    scopeId: string,
  ): string {
    return `${provider}:${scopeType}:${scopeId}`;
  }

  private sortScopes(scopes: SyncedTaskScope[]): SyncedTaskScope[] {
    return [...scopes].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }

      return `${a.scopeType}:${a.scopeId}`.localeCompare(
        `${b.scopeType}:${b.scopeId}`,
      );
    });
  }
}
