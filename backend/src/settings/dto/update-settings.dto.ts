import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { parseOptionalInteger } from '../../common/utils/parse.utils';
import { PreCommitChecksProfileDto } from '../../executions/pre-commit/dto/pre-commit-check-profile.dto';
import {
  MAX_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
} from '../task-sync-settings.constants';
import { TaskSyncProvidersEnabledDto } from './task-sync-providers-enabled.dto';

const normalizeNullableString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const toOptionalIntegerOrNull = (value: unknown): unknown => {
  return parseOptionalInteger(value, {
    nullAsUndefined: false,
  });
};

export class UpdateSettingsDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeNullableString(value))
  @IsString()
  @MaxLength(4096)
  githubToken?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeNullableString(value))
  @IsString()
  @MaxLength(4096)
  claudeOauthToken?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalIntegerOrNull(value))
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(60000)
  @Max(7200000)
  executionTimeoutMs?: number | null;

  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @ValidateNested()
  @Type(() => PreCommitChecksProfileDto)
  preCommitChecksDefault?: PreCommitChecksProfileDto | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return value;
  })
  @IsBoolean()
  aiReviewEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return value;
  })
  @NotEquals(null, { message: 'syncEnabled must be a boolean value' })
  @IsBoolean()
  syncEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalIntegerOrNull(value))
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(MIN_SYNC_INTERVAL_MINUTES)
  @Max(MAX_SYNC_INTERVAL_MINUTES)
  syncIntervalMinutes?: number | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => TaskSyncProvidersEnabledDto)
  syncProvidersEnabled?: TaskSyncProvidersEnabledDto;
}
