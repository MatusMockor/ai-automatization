import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { parseOptionalInteger } from '../../common/utils/parse.utils';
import type { ExecutionTriggerType } from '../interfaces/execution.types';

const toOptionalInteger = (value: unknown): unknown => {
  return parseOptionalInteger(value, {
    nullAsUndefined: true,
  });
};

const toOptionalBoolean = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return value;
};

export class GetExecutionsQueryDto {
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Transform(({ value }: { value: unknown }) => value)
  @IsOptional()
  @IsIn(['manual', 'automation_rule', 'schedule'])
  triggerType?: ExecutionTriggerType;

  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;
}
