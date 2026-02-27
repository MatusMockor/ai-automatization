import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { parseOptionalInteger } from '../../common/utils/parse.utils';

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
  claudeApiKey?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalIntegerOrNull(value))
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(60000)
  @Max(7200000)
  executionTimeoutMs?: number | null;
}
