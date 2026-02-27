import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const normalizeOptionalString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
};

const toOptionalInteger = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  // Reject decimal inputs (for example "5.7"), the query accepts integers only.
  return Number.isInteger(parsed) ? parsed : value;
};

const toOptionalPrefixes = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedPrefixes = value
    .split(',')
    .map((prefix) => prefix.trim().toLowerCase())
    .filter((prefix) => prefix.length > 0);

  if (normalizedPrefixes.some((prefix) => prefix.length > 64)) {
    return value;
  }

  return [...new Set(normalizedPrefixes)];
};

export class GetTasksQueryDto {
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsUUID()
  repoId?: string;

  @Transform(({ value }: { value: unknown }) => toOptionalPrefixes(value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  prefixes?: string[];

  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
