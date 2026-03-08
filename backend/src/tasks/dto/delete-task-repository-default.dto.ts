import {
  IsIn,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { ProviderScopeCompatibilityConstraint } from '../../common/validation/provider-scope.validation';

export class DeleteTaskRepositoryDefaultDto {
  @Validate(ProviderScopeCompatibilityConstraint)
  private readonly providerScopeCompatibility = true;

  @IsIn(['asana', 'jira', 'manual'])
  provider!: 'asana' | 'jira' | 'manual';

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
