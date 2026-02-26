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
