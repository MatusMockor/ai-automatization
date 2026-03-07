import { TransformFnParams } from 'class-transformer';

export const AUTOMATION_RULE_SCOPE_TYPES = [
  'asana_workspace',
  'asana_project',
  'jira_project',
] as const;

export const TASK_ITEM_STATUSES = [
  'open',
  'in_progress',
  'done',
  'closed',
  'unknown',
] as const;

export const AUTOMATION_RULE_ACTIONS = ['fix', 'feature', 'plan'] as const;
export const AUTOMATION_RULE_MODES = ['suggest', 'draft'] as const;

export const normalizeOptionalString = (
  value: unknown,
): string | undefined | unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export const normalizeNullableString = (
  value: unknown,
): string | null | undefined | unknown => {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const toOptionalInteger = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return value === null ? null : undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  if (!/^[+-]?\d+$/.test(normalized)) {
    return value;
  }

  return Number.parseInt(normalized, 10);
};

export const toOptionalBoolean = (value: unknown): boolean | unknown => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return value;
};

export const normalizeStringArray = (
  value: unknown,
): string[] | null | undefined | unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return value;
  }

  const normalized = value.map((entry) =>
    typeof entry === 'string' ? entry.trim() : entry,
  );

  if (normalized.some((entry) => typeof entry !== 'string')) {
    return normalized;
  }

  if (normalized.every((entry) => entry.length === 0)) {
    return null;
  }

  if (normalized.some((entry) => entry.length === 0)) {
    return normalized;
  }

  return normalized;
};

export const normalizeStringArrayTransform = ({
  value,
}: TransformFnParams): unknown => normalizeStringArray(value);

export const normalizeOptionalStringTransform = ({
  value,
}: TransformFnParams): unknown => normalizeOptionalString(value);

export const normalizeNullableStringTransform = ({
  value,
}: TransformFnParams): unknown => normalizeNullableString(value);

export const toOptionalBooleanTransform = ({
  value,
}: TransformFnParams): unknown => toOptionalBoolean(value);

export const toOptionalIntegerTransform = ({
  value,
}: TransformFnParams): unknown => toOptionalInteger(value);
