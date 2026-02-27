import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

const toOptionalInteger = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
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

export class GetExecutionsQueryDto {
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
