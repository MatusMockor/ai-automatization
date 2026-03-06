import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

const normalizeOptionalString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length === 0 ? undefined : normalizedValue;
};

const toOptionalInteger = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return undefined;
  }

  if (!/^[+-]?\d+$/.test(normalizedValue)) {
    return value;
  }

  return Number.parseInt(normalizedValue, 10);
};

export class GetTaskSyncRunsQueryDto {
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsIn(['asana', 'jira'])
  provider?: 'asana' | 'jira';

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsIn(['manual', 'schedule', 'webhook'])
  triggerType?: 'manual' | 'schedule' | 'webhook';

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsIn(['queued', 'running', 'completed', 'failed'])
  status?: 'queued' | 'running' | 'completed' | 'failed';

  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
