import type { PreCommitChecksProfile } from '../../executions/pre-commit/pre-commit-check-profile.types';

export class SettingsResponseDto {
  githubToken!: string | null;
  claudeOauthToken!: string | null;
  executionTimeoutMs!: number | null;
  preCommitChecksDefault!: PreCommitChecksProfile | null;
  aiReviewEnabled!: boolean;
}
