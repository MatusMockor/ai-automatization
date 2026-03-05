import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_PRE_COMMIT_CHECK_MODE,
  PRE_COMMIT_CHECK_MODES,
  PRE_COMMIT_RUNTIME_LANGUAGES,
  PRE_COMMIT_STEP_PRESETS,
  type PreCommitCheckMode,
  type PreCommitCheckStep,
  type PreCommitChecksProfile,
  type PreCommitRuntimeLanguage,
  type PreCommitStepPreset,
  type PreCommitRuntimeConfig,
} from './pre-commit-check-profile.types';

const PRESET_SET = new Set<string>(PRE_COMMIT_STEP_PRESETS);
const MODE_SET = new Set<string>(PRE_COMMIT_CHECK_MODES);
const RUNTIME_LANGUAGE_SET = new Set<string>(PRE_COMMIT_RUNTIME_LANGUAGES);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toBoolean = (value: unknown): boolean | null => {
  return typeof value === 'boolean' ? value : null;
};

const normalizeMode = (
  value: unknown,
  contextLabel: string,
): PreCommitCheckMode => {
  if (value === undefined || value === null) {
    return DEFAULT_PRE_COMMIT_CHECK_MODE;
  }

  if (typeof value === 'string' && MODE_SET.has(value)) {
    return value as PreCommitCheckMode;
  }

  throw new BadRequestException(
    `${contextLabel}.mode must be one of: ${PRE_COMMIT_CHECK_MODES.join(', ')}`,
  );
};

const normalizeRuntime = (
  value: unknown,
  contextLabel: string,
): PreCommitRuntimeConfig | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new BadRequestException(
      `${contextLabel}.runtime must be an object when provided`,
    );
  }

  const language = value.language;
  const version = value.version;
  if (typeof language !== 'string' || !RUNTIME_LANGUAGE_SET.has(language)) {
    throw new BadRequestException(
      `${contextLabel}.runtime.language must be one of: ${PRE_COMMIT_RUNTIME_LANGUAGES.join(', ')}`,
    );
  }

  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new BadRequestException(
      `${contextLabel}.runtime.version must be a non-empty string`,
    );
  }

  return {
    language: language as PreCommitRuntimeLanguage,
    version: version.trim(),
  };
};

const normalizeSteps = (
  value: unknown,
  contextLabel: string,
): PreCommitCheckStep[] => {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${contextLabel}.steps must be an array`);
  }

  if (value.length === 0) {
    throw new BadRequestException(
      `${contextLabel}.steps must contain at least one step`,
    );
  }

  const seen = new Set<string>();
  const normalized: PreCommitCheckStep[] = [];

  for (const step of value) {
    if (!isRecord(step)) {
      throw new BadRequestException(
        `${contextLabel}.steps items must be objects`,
      );
    }

    const preset = step.preset;
    const enabled = toBoolean(step.enabled);

    if (typeof preset !== 'string' || !PRESET_SET.has(preset)) {
      throw new BadRequestException(
        `${contextLabel}.steps.preset must be one of: ${PRE_COMMIT_STEP_PRESETS.join(', ')}`,
      );
    }

    if (enabled === null) {
      throw new BadRequestException(
        `${contextLabel}.steps.enabled must be a boolean`,
      );
    }

    if (seen.has(preset)) {
      throw new BadRequestException(
        `${contextLabel}.steps contains duplicate preset: ${preset}`,
      );
    }

    seen.add(preset);
    normalized.push({ preset: preset as PreCommitStepPreset, enabled });
  }

  return normalized;
};

export const normalizePreCommitChecksProfile = (
  value: unknown,
  contextLabel: string,
): PreCommitChecksProfile => {
  if (!isRecord(value)) {
    throw new BadRequestException(`${contextLabel} must be an object`);
  }

  const enabled = toBoolean(value.enabled);
  if (enabled === null) {
    throw new BadRequestException(`${contextLabel}.enabled must be a boolean`);
  }

  const runner = value.runner;
  if (!isRecord(runner)) {
    throw new BadRequestException(`${contextLabel}.runner must be an object`);
  }

  if (runner.type !== 'compose_service') {
    throw new BadRequestException(
      `${contextLabel}.runner.type must be compose_service`,
    );
  }

  const service = runner.service;
  if (typeof service !== 'string' || service.trim().length === 0) {
    throw new BadRequestException(
      `${contextLabel}.runner.service must be a non-empty string`,
    );
  }

  const steps = normalizeSteps(value.steps, contextLabel);
  const enabledSteps = steps.filter((step) => step.enabled);
  if (enabled && enabledSteps.length === 0) {
    throw new BadRequestException(
      `${contextLabel} must have at least one enabled step when enabled=true`,
    );
  }

  return {
    enabled,
    mode: normalizeMode(value.mode, contextLabel),
    runner: {
      type: 'compose_service',
      service: service.trim(),
    },
    steps,
    runtime: normalizeRuntime(value.runtime, contextLabel),
  };
};
