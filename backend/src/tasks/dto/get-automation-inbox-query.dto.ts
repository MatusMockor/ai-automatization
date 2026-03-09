import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import {
  parseOptionalBoolean,
  parseOptionalInteger,
} from '../../common/utils/parse.utils';

const normalizeOptionalString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length === 0 ? undefined : normalizedValue;
};

export class GetAutomationInboxQueryDto {
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsIn(['asana', 'jira', 'manual'])
  provider?: 'asana' | 'jira' | 'manual';

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsUUID()
  repositoryId?: string;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsUUID()
  ruleId?: string;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsIn(['matched', 'drafted'])
  automationState?: 'matched' | 'drafted';

  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsIn(['ready', 'superseded'])
  draftStatus?: 'ready' | 'superseded';

  @Transform(({ value }: { value: unknown }) =>
    parseOptionalInteger(value, {
      nullAsUndefined: true,
    }),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Transform(({ value }: { value: unknown }) =>
    parseOptionalBoolean(value, {
      nullAsUndefined: true,
    }),
  )
  @IsOptional()
  @IsBoolean()
  includeSuppressed?: boolean;
}
