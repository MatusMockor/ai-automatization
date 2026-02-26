import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const toOptionalInteger = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? value : parsed;
};

export class GetConnectionTasksQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
