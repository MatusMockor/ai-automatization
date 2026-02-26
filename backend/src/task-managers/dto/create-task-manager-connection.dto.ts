import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import type {
  TaskManagerAuthMode,
  TaskManagerProviderType,
} from '../interfaces/task-manager-provider.interface';

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeOptionalLowerCaseString = (
  value: unknown,
): string | undefined => {
  const normalized = normalizeOptionalString(value);
  return normalized?.toLowerCase();
};

const normalizeBaseUrl = (value: unknown): string | undefined => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  return normalized.replace(/\/+$/, '');
};

export class CreateTaskManagerConnectionDto {
  @Transform(({ value }: { value: unknown }) =>
    normalizeOptionalLowerCaseString(value),
  )
  @IsIn(['asana', 'jira'])
  provider!: TaskManagerProviderType;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ValidateIf((dto: CreateTaskManagerConnectionDto) => dto.provider === 'asana')
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(4096)
  personalAccessToken?: string;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  workspaceId?: string;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  projectId?: string;

  @ValidateIf((dto: CreateTaskManagerConnectionDto) => dto.provider === 'jira')
  @Transform(({ value }: { value: unknown }) => normalizeBaseUrl(value))
  @IsUrl({
    require_protocol: true,
    require_tld: false,
    allow_underscores: false,
  })
  @MaxLength(512)
  baseUrl?: string;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectKey?: string;

  @ValidateIf((dto: CreateTaskManagerConnectionDto) => dto.provider === 'jira')
  @Transform(({ value }: { value: unknown }) =>
    normalizeOptionalLowerCaseString(value),
  )
  @IsIn(['basic', 'bearer'])
  authMode?: TaskManagerAuthMode;

  @ValidateIf(
    (dto: CreateTaskManagerConnectionDto) =>
      dto.provider === 'jira' && dto.authMode === 'basic',
  )
  @Transform(({ value }: { value: unknown }) =>
    normalizeOptionalLowerCaseString(value),
  )
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ValidateIf(
    (dto: CreateTaskManagerConnectionDto) =>
      dto.provider === 'jira' && dto.authMode === 'basic',
  )
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(4096)
  apiToken?: string;

  @ValidateIf(
    (dto: CreateTaskManagerConnectionDto) =>
      dto.provider === 'jira' && dto.authMode === 'bearer',
  )
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(4096)
  accessToken?: string;
}
