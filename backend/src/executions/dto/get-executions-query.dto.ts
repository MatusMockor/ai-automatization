import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import {
  parseOptionalBoolean,
  parseOptionalInteger,
} from '../../common/utils/parse.utils';
import type { ExecutionTriggerType } from '../interfaces/execution.types';

const toOptionalInteger = (value: unknown): unknown => {
  return parseOptionalInteger(value, {
    nullAsUndefined: true,
  });
};

const toOptionalBoolean = (value: unknown): unknown => {
  return parseOptionalBoolean(value, {
    nullAsUndefined: true,
  });
};

const toOptionalTriggerType = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  return normalizedValue === '' ? undefined : normalizedValue;
};

export class GetExecutionsQueryDto {
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Transform(({ value }: { value: unknown }) => toOptionalTriggerType(value))
  @IsOptional()
  @IsIn(['manual', 'automation_rule', 'schedule'])
  triggerType?: ExecutionTriggerType;

  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;
}
