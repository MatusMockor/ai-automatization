import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const normalizeNullableString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
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
}
