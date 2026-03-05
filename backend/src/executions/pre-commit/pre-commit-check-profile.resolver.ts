import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ManagedRepository } from '../../repositories/entities/repository.entity';
import { SettingsService } from '../../settings/settings.service';
import { normalizePreCommitChecksProfile } from './pre-commit-check-profile.normalizer';
import {
  type PreCommitChecksProfile,
  type ResolvedPreCommitProfile,
} from './pre-commit-check-profile.types';

@Injectable()
export class PreCommitCheckProfileResolver {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {}

  async resolve(
    userId: string,
    repository: ManagedRepository,
  ): Promise<ResolvedPreCommitProfile> {
    const repositoryProfile = this.toNormalizedProfile(
      repository.preCommitChecksOverride,
    );
    if (repositoryProfile !== null) {
      return {
        source: 'repository',
        profile: repositoryProfile,
        legacyCommand: null,
      };
    }

    const userDefaultProfile =
      await this.settingsService.getPreCommitChecksDefaultForUserOrNull(userId);
    if (userDefaultProfile !== null) {
      return {
        source: 'user_default',
        profile: userDefaultProfile,
        legacyCommand: null,
      };
    }

    const legacyCommand =
      process.env.EXECUTION_PRE_PR_CHECK_COMMAND ??
      this.configService.get<string>('EXECUTION_PRE_PR_CHECK_COMMAND', '') ??
      '';

    if (legacyCommand.trim().length > 0) {
      return {
        source: 'legacy_env',
        profile: null,
        legacyCommand,
      };
    }

    return {
      source: 'none',
      profile: null,
      legacyCommand: null,
    };
  }

  private toNormalizedProfile(
    profile: PreCommitChecksProfile | Record<string, unknown> | null,
  ): PreCommitChecksProfile | null {
    if (profile === null) {
      return null;
    }

    if (typeof profile !== 'object' || Array.isArray(profile)) {
      return null;
    }

    try {
      return normalizePreCommitChecksProfile(profile, 'preCommitChecksProfile');
    } catch {
      return null;
    }
  }
}
