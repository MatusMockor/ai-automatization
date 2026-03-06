import type { PreCommitChecksProfile } from '../../executions/pre-commit/pre-commit-check-profile.types';
import { TaskSyncProvidersEnabledDto } from './task-sync-providers-enabled.dto';

export class SettingsResponseDto {
  githubToken!: string | null;
  claudeOauthToken!: string | null;
  executionTimeoutMs!: number | null;
  preCommitChecksDefault!: PreCommitChecksProfile | null;
  aiReviewEnabled!: boolean;
  syncEnabled!: boolean;
  syncIntervalMinutes!: number;
  syncProvidersEnabled!: TaskSyncProvidersEnabledDto;
}
