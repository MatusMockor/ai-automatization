import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { ProviderScopeCompatibilityConstraint } from '../../common/validation/provider-scope.validation';

export class UpsertTaskRepositoryDefaultDto {
  @Validate(ProviderScopeCompatibilityConstraint)
  private readonly providerScopeCompatibility = true;

  @IsIn(['asana', 'jira', 'manual'])
  provider!: 'asana' | 'jira' | 'manual';

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
