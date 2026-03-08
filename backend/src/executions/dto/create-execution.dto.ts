import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { parseOptionalBoolean } from '../../common/utils/parse.utils';
import type {
  ExecutionAction,
  TaskSource,
} from '../interfaces/execution.types';

const ACTIONS = ['fix', 'feature', 'plan'] as const;
const TASK_SOURCES = ['asana', 'jira', 'manual'] as const;

function toOptionalBoolean(value: unknown): boolean | undefined | unknown {
  return parseOptionalBoolean(value) as boolean | undefined | unknown;
}

export class CreateExecutionDto {
  @IsUUID()
  repositoryId!: string;

  @IsIn(ACTIONS)
  action!: ExecutionAction;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  taskId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  taskExternalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  taskTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  taskDescription?: string;

  @IsIn(TASK_SOURCES)
  taskSource!: TaskSource;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  publishPullRequest?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  requireCodeChanges?: boolean;
}
