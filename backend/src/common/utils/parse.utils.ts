export const parsePositiveInteger = (
  value: string,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

type ParseOptionalIntegerOptions = {
  nullAsUndefined?: boolean;
};

export const parseOptionalInteger = (
  value: unknown,
  options: ParseOptionalIntegerOptions = {},
): unknown => {
  const { nullAsUndefined = false } = options;

  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === null) {
    return nullAsUndefined ? undefined : null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  if (!/^[+-]?\d+$/.test(normalizedValue)) {
    return value;
  }

  return Number.parseInt(normalizedValue, 10);
};

type ParseOptionalBooleanOptions = {
  nullAsUndefined?: boolean;
};

export const parseOptionalBoolean = (
  value: unknown,
  options: ParseOptionalBooleanOptions = {},
): unknown => {
  const { nullAsUndefined = false } = options;

  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === null) {
    return nullAsUndefined ? undefined : null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  return value;
};
