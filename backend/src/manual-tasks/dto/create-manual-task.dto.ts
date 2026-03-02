import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const normalizeTitle = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
};

const normalizeDescription = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? null : trimmedValue;
};

export class CreateManualTaskDto {
  @Transform(({ value }: { value: unknown }) => normalizeTitle(value))
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  title!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeDescription(value))
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(20000)
  description?: string | null;
}
