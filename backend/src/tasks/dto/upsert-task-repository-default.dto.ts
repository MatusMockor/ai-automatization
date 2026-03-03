import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpsertTaskRepositoryDefaultDto {
  @IsIn(['asana', 'jira'])
  provider!: 'asana' | 'jira';

  @IsUUID()
  repositoryId!: string;

  @ValidateIf(
    (dto: UpsertTaskRepositoryDefaultDto) => dto.scopeId !== undefined,
  )
  @IsIn(['asana_project', 'asana_workspace', 'jira_project'])
  scopeType?: 'asana_project' | 'asana_workspace' | 'jira_project';

  @ValidateIf(
    (dto: UpsertTaskRepositoryDefaultDto) => dto.scopeType !== undefined,
  )
  @IsString()
  @MaxLength(128)
  scopeId?: string;
}
