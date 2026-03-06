import { IsBoolean } from 'class-validator';

export class TaskSyncProvidersEnabledDto {
  @IsBoolean()
  asana!: boolean;

  @IsBoolean()
  jira!: boolean;
}
