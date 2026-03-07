import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AUTOMATION_RULE_ACTIONS,
  AUTOMATION_RULE_SCOPE_TYPES,
  TASK_ITEM_STATUSES,
  normalizeNullableStringTransform,
  normalizeOptionalStringTransform,
  normalizeStringArrayTransform,
  toOptionalBooleanTransform,
  toOptionalIntegerTransform,
} from './automation-rule.dto-helpers';

export class UpdateAutomationRuleDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(normalizeOptionalStringTransform)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(toOptionalBooleanTransform)
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(toOptionalIntegerTransform)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  priority?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(normalizeOptionalStringTransform)
  @IsIn(['asana', 'jira'])
  provider?: 'asana' | 'jira';

  @IsOptional()
  @Transform(normalizeNullableStringTransform)
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsIn(AUTOMATION_RULE_SCOPE_TYPES)
  scopeType?: (typeof AUTOMATION_RULE_SCOPE_TYPES)[number] | null;

  @IsOptional()
  @Transform(normalizeNullableStringTransform)
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(128)
  scopeId?: string | null;

  @IsOptional()
  @Transform(normalizeStringArrayTransform)
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(255, { each: true })
  titleContains?: string[] | null;

  @IsOptional()
  @Transform(normalizeStringArrayTransform)
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsArray()
  @IsIn(TASK_ITEM_STATUSES, { each: true })
  taskStatuses?: Array<(typeof TASK_ITEM_STATUSES)[number]> | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsUUID()
  repositoryId?: string;

  @IsOptional()
  @Transform(normalizeNullableStringTransform)
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsIn(AUTOMATION_RULE_ACTIONS)
  suggestedAction?: (typeof AUTOMATION_RULE_ACTIONS)[number] | null;
}
