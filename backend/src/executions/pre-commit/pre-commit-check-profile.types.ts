export const PRE_COMMIT_CHECK_MODES = ['warn', 'block'] as const;
export type PreCommitCheckMode = (typeof PRE_COMMIT_CHECK_MODES)[number];

export const PRE_COMMIT_CHECK_RUNNER_TYPES = ['compose_service'] as const;
export type PreCommitCheckRunnerType =
  (typeof PRE_COMMIT_CHECK_RUNNER_TYPES)[number];

export const PRE_COMMIT_STEP_PRESETS = ['format', 'lint', 'test'] as const;
export type PreCommitStepPreset = (typeof PRE_COMMIT_STEP_PRESETS)[number];

export const PRE_COMMIT_RUNTIME_LANGUAGES = ['php', 'node'] as const;
export type PreCommitRuntimeLanguage =
  (typeof PRE_COMMIT_RUNTIME_LANGUAGES)[number];

export const DEFAULT_PRE_COMMIT_CHECK_MODE: PreCommitCheckMode = 'warn';

export type PreCommitCheckStep = {
  preset: PreCommitStepPreset;
  enabled: boolean;
};

export type ComposeServiceRunnerConfig = {
  type: 'compose_service';
  service: string;
};

export type PreCommitRuntimeConfig = {
  language: PreCommitRuntimeLanguage;
  version: string;
};

export type PreCommitChecksProfile = {
  enabled: boolean;
  mode: PreCommitCheckMode;
  runner: ComposeServiceRunnerConfig;
  steps: PreCommitCheckStep[];
  runtime?: PreCommitRuntimeConfig;
};

export type PreCommitProfileSource =
  | 'repository'
  | 'user_default'
  | 'legacy_env'
  | 'none';

export type ResolvedPreCommitProfile = {
  source: PreCommitProfileSource;
  profile: PreCommitChecksProfile | null;
  legacyCommand: string | null;
};

export type PreCommitStepExecutionResult = {
  preset: PreCommitStepPreset;
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
};

export type PreCommitChecksExecutionStatus = 'passed' | 'failed' | 'skipped';

export type PreCommitChecksExecutionResult = {
  source: PreCommitProfileSource;
  mode: PreCommitCheckMode;
  status: PreCommitChecksExecutionStatus;
  failureReason: string | null;
  stepResults: PreCommitStepExecutionResult[];
  durationMs: number;
};
