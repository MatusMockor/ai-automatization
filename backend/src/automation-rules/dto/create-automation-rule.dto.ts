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
  normalizeOptionalStringTransform,
  normalizeStringArrayTransform,
  toOptionalBooleanTransform,
  toOptionalIntegerTransform,
} from './automation-rule.dto-helpers';

export class CreateAutomationRuleDto {
  @Transform(normalizeOptionalStringTransform)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @Transform(toOptionalBooleanTransform)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Transform(toOptionalIntegerTransform)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  priority?: number;

  @IsIn(['asana', 'jira'])
  provider!: 'asana' | 'jira';

  @IsOptional()
  @Transform(normalizeOptionalStringTransform)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(AUTOMATION_RULE_SCOPE_TYPES)
  scopeType?: (typeof AUTOMATION_RULE_SCOPE_TYPES)[number];

  @IsOptional()
  @Transform(normalizeOptionalStringTransform)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  scopeId?: string;

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

  @IsUUID()
  repositoryId!: string;

  @IsOptional()
  @Transform(normalizeOptionalStringTransform)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(AUTOMATION_RULE_ACTIONS)
  suggestedAction?: (typeof AUTOMATION_RULE_ACTIONS)[number];
}
