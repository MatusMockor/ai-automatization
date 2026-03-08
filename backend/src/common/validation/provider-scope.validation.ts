import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

type ScopedProvider = 'asana' | 'jira' | 'manual';
type ScopedScopeType = 'asana_workspace' | 'asana_project' | 'jira_project';

type ProviderScopeLike = {
  provider?: ScopedProvider;
  scopeType?: ScopedScopeType | null;
  scopeId?: string | null;
};

const ASANA_SCOPE_TYPES = new Set<ScopedScopeType>([
  'asana_workspace',
  'asana_project',
]);

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null;

const resolveProviderScopeValidationError = (
  value: ProviderScopeLike,
  options?: { allowMissingProvider?: boolean },
): string | null => {
  const hasScopeType = hasValue(value.scopeType);
  const hasScopeId = hasValue(value.scopeId);

  if (hasScopeType !== hasScopeId) {
    return 'scopeType and scopeId must both be provided or both be omitted';
  }

  if (!hasScopeType) {
    return null;
  }

  if (!value.provider) {
    return options?.allowMissingProvider === true
      ? null
      : 'provider must be specified when scopeType is provided';
  }

  if (value.provider === 'manual') {
    return 'scopeType is not compatible with the selected provider';
  }

  if (
    value.provider === 'asana' &&
    !ASANA_SCOPE_TYPES.has(value.scopeType as ScopedScopeType)
  ) {
    return 'scopeType is not compatible with the selected provider';
  }

  if (value.provider === 'jira' && value.scopeType !== 'jira_project') {
    return 'scopeType is not compatible with the selected provider';
  }

  return null;
};

@ValidatorConstraint({ name: 'ProviderScopeCompatibility', async: false })
export class ProviderScopeCompatibilityConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const [options] = (args.constraints ?? []) as [
      { allowMissingProvider?: boolean } | undefined,
    ];

    return (
      resolveProviderScopeValidationError(
        args.object as ProviderScopeLike,
        options,
      ) === null
    );
  }

  defaultMessage(args: ValidationArguments): string {
    const [options] = (args.constraints ?? []) as [
      { allowMissingProvider?: boolean } | undefined,
    ];

    return (
      resolveProviderScopeValidationError(
        args.object as ProviderScopeLike,
        options,
      ) ?? 'scopeType is not compatible with the selected provider'
    );
  }
}

@ValidatorConstraint({
  name: 'ManualProviderFiltersForbidden',
  async: false,
})
export class ManualProviderFiltersForbiddenConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const query = args.object as {
      provider?: ScopedProvider;
      asanaWorkspaceId?: string;
      asanaProjectId?: string;
      jiraProjectKey?: string;
    };

    if (query.provider !== 'manual') {
      return true;
    }

    return (
      !hasValue(query.asanaWorkspaceId) &&
      !hasValue(query.asanaProjectId) &&
      !hasValue(query.jiraProjectKey)
    );
  }

  defaultMessage(): string {
    return 'Scope filters cannot be used with manual provider filter';
  }
}
