import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PRE_COMMIT_CHECK_MODES,
  PRE_COMMIT_CHECK_RUNNER_TYPES,
  PRE_COMMIT_RUNTIME_LANGUAGES,
  PRE_COMMIT_STEP_PRESETS,
  type PreCommitChecksProfile,
} from '../pre-commit-check-profile.types';

const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export class PreCommitCheckStepDto {
  @IsIn(PRE_COMMIT_STEP_PRESETS)
  preset!: (typeof PRE_COMMIT_STEP_PRESETS)[number];

  @IsBoolean()
  enabled!: boolean;
}

export class PreCommitCheckRunnerDto {
  @IsIn(PRE_COMMIT_CHECK_RUNNER_TYPES)
  type!: (typeof PRE_COMMIT_CHECK_RUNNER_TYPES)[number];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(128)
  @Matches(SERVICE_NAME_PATTERN, {
    message:
      'service must contain only letters, numbers, dots, underscores or dashes',
  })
  service!: string;
}

export class PreCommitCheckRuntimeDto {
  @IsIn(PRE_COMMIT_RUNTIME_LANGUAGES)
  language!: (typeof PRE_COMMIT_RUNTIME_LANGUAGES)[number];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(32)
  version!: string;
}

export class PreCommitChecksProfileDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsIn(PRE_COMMIT_CHECK_MODES)
  mode?: (typeof PRE_COMMIT_CHECK_MODES)[number];

  @IsObject()
  @ValidateNested()
  @Type(() => PreCommitCheckRunnerDto)
  runner!: PreCommitCheckRunnerDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PRE_COMMIT_STEP_PRESETS.length)
  @ValidateNested({ each: true })
  @Type(() => PreCommitCheckStepDto)
  steps!: PreCommitCheckStepDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PreCommitCheckRuntimeDto)
  runtime?: PreCommitCheckRuntimeDto;
}

export const toPreCommitChecksProfileValue = (
  profile: PreCommitChecksProfile,
): Record<string, unknown> => {
  return {
    enabled: profile.enabled,
    mode: profile.mode,
    runner: {
      type: profile.runner.type,
      service: profile.runner.service,
    },
    steps: profile.steps.map((step) => ({
      preset: step.preset,
      enabled: step.enabled,
    })),
    runtime:
      profile.runtime === undefined
        ? undefined
        : {
            language: profile.runtime.language,
            version: profile.runtime.version,
          },
  };
};
