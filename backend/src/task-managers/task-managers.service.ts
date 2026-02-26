import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';
import { AddTaskPrefixDto } from './dto/add-task-prefix.dto';
import { ConnectionTasksResponseDto } from './dto/connection-tasks-response.dto';
import { CreateTaskManagerConnectionDto } from './dto/create-task-manager-connection.dto';
import { TaskManagerConnectionResponseDto } from './dto/task-manager-connection-response.dto';
import { TaskPrefixResponseDto } from './dto/task-prefix-response.dto';
import { TaskManagerConnection } from './entities/task-manager-connection.entity';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderConfigurationError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from './errors/task-manager-provider.errors';
import {
  TaskManagerConnectionConfig,
  TaskManagerProviderType,
} from './interfaces/task-manager-provider.interface';
import { TaskFilterService } from './task-filter.service';
import { TaskManagerProviderRegistry } from './task-manager-provider.registry';
import { TaskPrefixService } from './task-prefix.service';

type DatabaseError = {
  code?: string;
  message?: string;
  driverError?: {
    code?: string;
    errno?: number;
    message?: string;
  };
};

@Injectable()
export class TaskManagersService {
  private readonly defaultTaskLimit: number;
  private readonly maxTaskLimit: number;

  constructor(
    @InjectRepository(TaskManagerConnection)
    private readonly connectionRepository: Repository<TaskManagerConnection>,
    private readonly encryptionService: EncryptionService,
    private readonly providerRegistry: TaskManagerProviderRegistry,
    private readonly taskPrefixService: TaskPrefixService,
    private readonly taskFilterService: TaskFilterService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTaskLimit = this.parsePositiveInteger(
      this.configService.get<string>('TASK_MANAGER_DEFAULT_TASK_LIMIT', '100'),
      100,
    );
    this.maxTaskLimit = this.parsePositiveInteger(
      this.configService.get<string>('TASK_MANAGER_MAX_TASK_LIMIT', '100'),
      this.defaultTaskLimit,
    );
  }

  async listConnectionsForUser(
    userId: string,
  ): Promise<TaskManagerConnectionResponseDto[]> {
    const connections = await this.connectionRepository.find({
      where: { userId },
      relations: { prefixes: true },
      order: {
        createdAt: 'DESC',
        prefixes: { createdAt: 'ASC' },
      },
    });

    return connections.map((connection) =>
      this.mapConnectionToResponse(connection),
    );
  }

  async createConnectionForUser(
    userId: string,
    dto: CreateTaskManagerConnectionDto,
  ): Promise<TaskManagerConnectionResponseDto> {
    const providerType = dto.provider;
    const provider = this.providerRegistry.getProvider(providerType);
    const validationConfig = this.buildConnectionConfigFromDto(dto);

    try {
      await provider.validateConnection(validationConfig);
    } catch (error) {
      this.throwMappedProviderError(error);
    }

    const connection = this.connectionRepository.create({
      userId,
      provider: providerType,
      name: dto.name ?? null,
      scopeKey: this.buildScopeKey(validationConfig),
      baseUrl:
        validationConfig.provider === 'jira' ? validationConfig.baseUrl : null,
      workspaceId:
        validationConfig.provider === 'asana'
          ? validationConfig.workspaceId
          : null,
      projectId:
        validationConfig.provider === 'asana'
          ? validationConfig.projectId
          : null,
      projectKey:
        validationConfig.provider === 'jira'
          ? validationConfig.projectKey
          : null,
      authMode:
        validationConfig.provider === 'jira' ? validationConfig.authMode : null,
      email:
        validationConfig.provider === 'jira' &&
        validationConfig.authMode === 'basic'
          ? validationConfig.email
          : null,
      secretEncrypted: this.encryptionService.encrypt(
        this.extractSecret(validationConfig),
      ),
      status: 'connected',
      lastValidatedAt: new Date(),
    });

    try {
      const savedConnection = await this.connectionRepository.save(connection);
      const withPrefixes = await this.connectionRepository.findOne({
        where: { id: savedConnection.id, userId },
        relations: { prefixes: true },
      });

      if (!withPrefixes) {
        throw new NotFoundException('Task manager connection not found');
      }

      return this.mapConnectionToResponse(withPrefixes);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Task manager connection already exists for this scope',
        );
      }

      throw error;
    }
  }

  async deleteConnectionForUser(
    userId: string,
    connectionId: string,
  ): Promise<void> {
    const connection = await this.getOwnedConnection(connectionId, userId);

    const deleteResult = await this.connectionRepository.delete({
      id: connection.id,
      userId,
    });

    if ((deleteResult.affected ?? 0) === 0) {
      throw new NotFoundException('Task manager connection not found');
    }
  }

  async addPrefixForConnection(
    userId: string,
    connectionId: string,
    dto: AddTaskPrefixDto,
  ): Promise<TaskPrefixResponseDto> {
    await this.getOwnedConnection(connectionId, userId);
    return this.taskPrefixService.addPrefix(connectionId, dto);
  }

  async deletePrefixForConnection(
    userId: string,
    connectionId: string,
    prefixId: string,
  ): Promise<void> {
    await this.getOwnedConnection(connectionId, userId);
    const deleted = await this.taskPrefixService.deletePrefix(
      connectionId,
      prefixId,
    );

    if (!deleted) {
      throw new NotFoundException('Task prefix not found');
    }
  }

  async fetchTasksForConnection(
    userId: string,
    connectionId: string,
    requestedLimit: number | undefined,
  ): Promise<ConnectionTasksResponseDto> {
    const connection = await this.getOwnedConnection(connectionId, userId);
    const providerType = this.toProviderType(connection.provider);
    const provider = this.providerRegistry.getProvider(providerType);

    const connectionConfig = this.toConnectionConfig(connection);
    const limit = this.resolveTaskLimit(requestedLimit);

    let providerTasks;
    try {
      providerTasks = await provider.fetchTasks(connectionConfig, limit);
    } catch (error) {
      this.throwMappedProviderError(error);
    }

    const filteredTasks = this.taskFilterService.filterTasks(
      providerTasks,
      connection.prefixes,
    );

    const items = filteredTasks
      .map((task) => ({
        id: `${providerType}:${task.externalId}`,
        externalId: task.externalId,
        title: task.title,
        description: task.description,
        url: task.url,
        status: task.status,
        assignee: task.assignee,
        source: providerType,
        matchedPrefix: task.matchedPrefix,
        updatedAt: task.updatedAt,
      }))
      .sort((a, b) => {
        if (a.updatedAt !== b.updatedAt) {
          return b.updatedAt.localeCompare(a.updatedAt);
        }

        return a.externalId.localeCompare(b.externalId);
      });

    return {
      connectionId: connection.id,
      provider: providerType,
      total: items.length,
      items,
    };
  }

  private async getOwnedConnection(
    connectionId: string,
    userId: string,
  ): Promise<TaskManagerConnection> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId, userId },
      relations: { prefixes: true },
      order: {
        prefixes: {
          createdAt: 'ASC',
        },
      },
    });

    if (!connection) {
      throw new NotFoundException('Task manager connection not found');
    }

    return connection;
  }

  private mapConnectionToResponse(
    connection: TaskManagerConnection,
  ): TaskManagerConnectionResponseDto {
    return {
      id: connection.id,
      provider: this.toProviderType(connection.provider),
      name: connection.name,
      status: connection.status,
      baseUrl: connection.baseUrl,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      projectKey: connection.projectKey,
      hasSecret: Boolean(connection.secretEncrypted),
      lastValidatedAt: connection.lastValidatedAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      prefixes: (connection.prefixes ?? []).map((prefix) =>
        this.taskPrefixService.mapToResponse(prefix),
      ),
    };
  }

  private toProviderType(provider: string): TaskManagerProviderType {
    if (provider === 'asana' || provider === 'jira') {
      return provider;
    }

    throw new BadRequestException('Unsupported task manager provider');
  }

  private buildConnectionConfigFromDto(
    dto: CreateTaskManagerConnectionDto,
  ): TaskManagerConnectionConfig {
    if (dto.provider === 'asana') {
      if (!dto.personalAccessToken) {
        throw new BadRequestException(
          'personalAccessToken is required for Asana connection',
        );
      }

      return {
        provider: 'asana',
        personalAccessToken: dto.personalAccessToken,
        workspaceId: dto.workspaceId ?? null,
        projectId: dto.projectId ?? null,
      };
    }

    if (!dto.baseUrl) {
      throw new BadRequestException('baseUrl is required for Jira connection');
    }

    if (dto.authMode === 'basic') {
      if (!dto.email || !dto.apiToken) {
        throw new BadRequestException(
          'email and apiToken are required for Jira basic authentication',
        );
      }

      return {
        provider: 'jira',
        baseUrl: dto.baseUrl,
        projectKey: dto.projectKey ?? null,
        authMode: 'basic',
        email: dto.email,
        apiToken: dto.apiToken,
      };
    }

    if (dto.authMode === 'bearer') {
      if (!dto.accessToken) {
        throw new BadRequestException(
          'accessToken is required for Jira bearer authentication',
        );
      }

      return {
        provider: 'jira',
        baseUrl: dto.baseUrl,
        projectKey: dto.projectKey ?? null,
        authMode: 'bearer',
        accessToken: dto.accessToken,
      };
    }

    throw new BadRequestException('authMode is required for Jira connection');
  }

  private toConnectionConfig(
    connection: TaskManagerConnection,
  ): TaskManagerConnectionConfig {
    const provider = this.toProviderType(connection.provider);
    const secret = this.encryptionService.decrypt(connection.secretEncrypted);

    if (provider === 'asana') {
      return {
        provider: 'asana',
        personalAccessToken: secret,
        workspaceId: connection.workspaceId,
        projectId: connection.projectId,
      };
    }

    if (connection.authMode === 'basic') {
      if (!connection.baseUrl || !connection.email) {
        throw new BadRequestException(
          'Stored Jira connection is invalid and cannot be used',
        );
      }

      return {
        provider: 'jira',
        baseUrl: connection.baseUrl,
        projectKey: connection.projectKey,
        authMode: 'basic',
        email: connection.email,
        apiToken: secret,
      };
    }

    if (connection.authMode === 'bearer') {
      if (!connection.baseUrl) {
        throw new BadRequestException(
          'Stored Jira connection is invalid and cannot be used',
        );
      }

      return {
        provider: 'jira',
        baseUrl: connection.baseUrl,
        projectKey: connection.projectKey,
        authMode: 'bearer',
        accessToken: secret,
      };
    }

    throw new BadRequestException(
      'Stored Jira connection authentication mode is invalid',
    );
  }

  private buildScopeKey(config: TaskManagerConnectionConfig): string {
    if (config.provider === 'asana') {
      return `asana:${config.workspaceId ?? '*'}:${config.projectId ?? '*'}`;
    }

    const normalizedBaseUrl = config.baseUrl.toLowerCase();
    return `jira:${normalizedBaseUrl}:${config.projectKey ?? '*'}`;
  }

  private extractSecret(config: TaskManagerConnectionConfig): string {
    if (config.provider === 'asana') {
      return config.personalAccessToken;
    }

    if (config.authMode === 'basic') {
      return config.apiToken;
    }

    return config.accessToken;
  }

  private throwMappedProviderError(error: unknown): never {
    if (error instanceof TaskManagerProviderAuthError) {
      throw new BadRequestException(error.message);
    }

    if (error instanceof TaskManagerProviderNotFoundError) {
      throw new NotFoundException(error.message);
    }

    if (error instanceof TaskManagerProviderConfigurationError) {
      throw new BadRequestException(error.message);
    }

    if (error instanceof TaskManagerProviderRequestError) {
      throw new BadGatewayException(error.message);
    }

    throw error;
  }

  private resolveTaskLimit(requestedLimit: number | undefined): number {
    if (requestedLimit === undefined) {
      return Math.min(this.defaultTaskLimit, this.maxTaskLimit);
    }

    return Math.min(Math.max(1, requestedLimit), this.maxTaskLimit);
  }

  private parsePositiveInteger(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const databaseError = error as DatabaseError;
    const driverCode = databaseError.driverError?.code;
    const driverErrno = databaseError.driverError?.errno;
    const errorMessage = (
      databaseError.driverError?.message ??
      databaseError.message ??
      ''
    ).toLowerCase();

    return (
      databaseError.code === '23505' ||
      driverCode === '23505' ||
      databaseError.code === 'SQLITE_CONSTRAINT' ||
      driverCode === 'SQLITE_CONSTRAINT' ||
      driverErrno === 19 ||
      errorMessage.includes('unique constraint failed')
    );
  }
}
