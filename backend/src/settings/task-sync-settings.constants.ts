export type SyncProvidersEnabled = {
  asana: boolean;
  jira: boolean;
};

export const DEFAULT_SYNC_ENABLED = false;
export const DEFAULT_SYNC_INTERVAL_MINUTES = 15;
export const MIN_SYNC_INTERVAL_MINUTES = 5;
export const MAX_SYNC_INTERVAL_MINUTES = 1440;
export const DEFAULT_SYNC_PROVIDERS_ENABLED: SyncProvidersEnabled = {
  asana: true,
  jira: true,
};

export const resolveSyncProvidersEnabled = (
  value: Partial<SyncProvidersEnabled> | null | undefined,
): SyncProvidersEnabled => ({
  asana: value?.asana ?? DEFAULT_SYNC_PROVIDERS_ENABLED.asana,
  jira: value?.jira ?? DEFAULT_SYNC_PROVIDERS_ENABLED.jira,
});

export const resolveSyncIntervalMinutes = (
  value: number | null | undefined,
): number => value ?? DEFAULT_SYNC_INTERVAL_MINUTES;
