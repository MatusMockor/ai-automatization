import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { parseOptionalInteger } from '../../common/utils/parse.utils';
import { PreCommitChecksProfileDto } from '../../executions/pre-commit/dto/pre-commit-check-profile.dto';

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
}
