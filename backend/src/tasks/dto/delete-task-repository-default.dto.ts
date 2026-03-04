import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';

export class DeleteTaskRepositoryDefaultDto {
  @IsIn(['asana', 'jira'])
  provider!: 'asana' | 'jira';

  @ValidateIf(
    (dto: DeleteTaskRepositoryDefaultDto) => dto.scopeId !== undefined,
  )
  @IsIn(['asana_project', 'asana_workspace', 'jira_project'])
  scopeType?: 'asana_project' | 'asana_workspace' | 'jira_project';

  @ValidateIf(
    (dto: DeleteTaskRepositoryDefaultDto) => dto.scopeType !== undefined,
  )
  @IsString()
  @MaxLength(128)
  scopeId?: string;
}
