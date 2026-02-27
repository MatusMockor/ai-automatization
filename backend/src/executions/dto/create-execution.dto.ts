import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  ExecutionAction,
  TaskSource,
} from '../interfaces/execution.types';

const ACTIONS: ExecutionAction[] = ['fix', 'feature', 'plan'];
const TASK_SOURCES: TaskSource[] = ['asana', 'jira'];

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
}
