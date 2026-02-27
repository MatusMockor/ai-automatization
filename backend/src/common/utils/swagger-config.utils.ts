const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
export const DEFAULT_SWAGGER_PATH = 'api/docs';

export const isEnabledValue = (value: string): boolean => {
  return ENABLED_VALUES.has(value.toLowerCase());
};

export const isEnvFlagEnabled = (
  value: string | undefined,
  fallback = false,
): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return isEnabledValue(value);
};

export const normalizeSwaggerPath = (raw: string | undefined): string => {
  const normalized = (raw ?? DEFAULT_SWAGGER_PATH)
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  return normalized || DEFAULT_SWAGGER_PATH;
};

export const resolveSwaggerRoutePath = (raw: string | undefined): string => {
  return `/${normalizeSwaggerPath(raw)}`;
};
