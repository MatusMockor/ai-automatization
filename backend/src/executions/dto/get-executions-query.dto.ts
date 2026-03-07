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

export class GetExecutionsQueryDto {
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['manual', 'automation_rule', 'schedule'])
  triggerType?: ExecutionTriggerType;

  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;
}
