import { IsIn } from 'class-validator';

export class StartTaskSyncDto {
  @IsIn(['asana', 'jira'])
  provider!: 'asana' | 'jira';
}
