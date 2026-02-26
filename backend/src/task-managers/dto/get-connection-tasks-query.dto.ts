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

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  // Reject decimal inputs (for example "5.7"), the query accepts integers only.
  return Number.isInteger(parsed) ? parsed : value;
};

export class GetConnectionTasksQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
