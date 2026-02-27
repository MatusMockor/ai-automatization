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

const normalizeNullableString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const toOptionalIntegerOrNull = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  if (!/^[+-]?\d+$/.test(normalizedValue)) {
    return value;
  }

  return Number.parseInt(normalizedValue, 10);
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
