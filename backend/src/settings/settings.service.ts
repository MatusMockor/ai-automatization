import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';
import { normalizePreCommitChecksProfile } from '../executions/pre-commit/pre-commit-check-profile.normalizer';
import type { PreCommitChecksProfile } from '../executions/pre-commit/pre-commit-check-profile.types';
import {
  DEFAULT_SYNC_ENABLED,
  resolveSyncIntervalMinutes,
  resolveSyncProvidersEnabled,
} from './task-sync-settings.constants';
import { SettingsResponseDto } from './dto/settings-response.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UserSettings } from './entities/user-settings.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private readonly settingsRepository: Repository<UserSettings>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getMaskedSettings(userId: string): Promise<SettingsResponseDto> {
    const settings = await this.settingsRepository.findOneBy({ userId });

    if (!settings) {
      return {
        githubToken: null,
        claudeOauthToken: null,
        executionTimeoutMs: null,
        preCommitChecksDefault: null,
        aiReviewEnabled: true,
        syncEnabled: DEFAULT_SYNC_ENABLED,
        syncIntervalMinutes: resolveSyncIntervalMinutes(null),
        syncProvidersEnabled: resolveSyncProvidersEnabled(undefined),
      };
    }

    return this.toSettingsResponse(settings);
  }

  async getGithubTokenForUserOrNull(userId: string): Promise<string | null> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    if (!settings?.githubTokenEncrypted) {
      return null;
    }

    return this.encryptionService.decrypt(settings.githubTokenEncrypted);
  }

  async getClaudeOauthTokenForUserOrNull(
    userId: string,
  ): Promise<string | null> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    if (!settings?.claudeOauthTokenEncrypted) {
      return null;
    }

    return this.encryptionService.decrypt(settings.claudeOauthTokenEncrypted);
  }

  async getExecutionTimeoutMsForUserOrNull(
    userId: string,
  ): Promise<number | null> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    return settings?.executionTimeoutMs ?? null;
  }

  async getPreCommitChecksDefaultForUserOrNull(
    userId: string,
  ): Promise<PreCommitChecksProfile | null> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    return settings?.preCommitChecksDefault ?? null;
  }

  async getAiReviewEnabledForUser(userId: string): Promise<boolean> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    return settings?.aiReviewEnabled ?? true;
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    const settings =
      (await this.settingsRepository.findOneBy({ userId })) ??
      this.settingsRepository.create({
        userId,
        githubTokenEncrypted: null,
        claudeOauthTokenEncrypted: null,
        executionTimeoutMs: null,
        preCommitChecksDefault: null,
        aiReviewEnabled: true,
        syncEnabled: DEFAULT_SYNC_ENABLED,
        syncIntervalMinutes: null,
        syncAsanaEnabled: true,
        syncJiraEnabled: true,
      });

    if (dto.githubToken !== undefined) {
      settings.githubTokenEncrypted = this.encryptNullableSecret(
        dto.githubToken,
      );
    }

    if (dto.claudeOauthToken !== undefined) {
      this.validateNoInternalWhitespace(
        dto.claudeOauthToken,
        'Claude OAuth token',
      );
      settings.claudeOauthTokenEncrypted = this.encryptNullableSecret(
        dto.claudeOauthToken,
      );
    }

    if (dto.executionTimeoutMs !== undefined) {
      settings.executionTimeoutMs = dto.executionTimeoutMs;
    }

    if (dto.preCommitChecksDefault !== undefined) {
      settings.preCommitChecksDefault =
        dto.preCommitChecksDefault === null
          ? null
          : normalizePreCommitChecksProfile(
              dto.preCommitChecksDefault,
              'preCommitChecksDefault',
            );
    }

    if (dto.aiReviewEnabled !== undefined) {
      settings.aiReviewEnabled = dto.aiReviewEnabled;
    }

    if (dto.syncEnabled !== undefined) {
      settings.syncEnabled = dto.syncEnabled;
    }

    if (dto.syncIntervalMinutes !== undefined) {
      settings.syncIntervalMinutes = dto.syncIntervalMinutes;
    }

    if (dto.syncProvidersEnabled !== undefined) {
      settings.syncAsanaEnabled = dto.syncProvidersEnabled.asana;
      settings.syncJiraEnabled = dto.syncProvidersEnabled.jira;
    }

    this.validateSyncConfiguration(settings);

    const savedSettings = await this.settingsRepository.save(settings);
    return this.toSettingsResponse(savedSettings);
  }

  private encryptNullableSecret(value: string | null): string | null {
    if (value === null) {
      return null;
    }

    return this.encryptionService.encrypt(value);
  }

  private toSettingsResponse(settings: UserSettings): SettingsResponseDto {
    return {
      githubToken: this.maskEncryptedSecret(settings.githubTokenEncrypted),
      claudeOauthToken: this.maskEncryptedSecret(
        settings.claudeOauthTokenEncrypted,
      ),
      executionTimeoutMs: settings.executionTimeoutMs,
      preCommitChecksDefault: settings.preCommitChecksDefault,
      aiReviewEnabled: settings.aiReviewEnabled ?? true,
      syncEnabled: settings.syncEnabled ?? DEFAULT_SYNC_ENABLED,
      syncIntervalMinutes: resolveSyncIntervalMinutes(
        settings.syncIntervalMinutes,
      ),
      syncProvidersEnabled: resolveSyncProvidersEnabled({
        asana: settings.syncAsanaEnabled,
        jira: settings.syncJiraEnabled,
      }),
    };
  }

  private maskEncryptedSecret(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const decrypted = this.encryptionService.decrypt(value);
    return this.maskSecret(decrypted);
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 4) {
      return '*'.repeat(secret.length);
    }

    return `****${secret.slice(-4)}`;
  }

  private validateNoInternalWhitespace(
    value: string | null | undefined,
    label: string,
  ): void {
    if (value != null && /\s/.test(value)) {
      throw new BadRequestException(
        `${label} must not contain whitespace characters`,
      );
    }
  }

  private validateSyncConfiguration(settings: UserSettings): void {
    if (!settings.syncEnabled) {
      return;
    }

    if (!settings.syncAsanaEnabled && !settings.syncJiraEnabled) {
      throw new BadRequestException(
        'At least one sync provider must be enabled when automatic sync is enabled',
      );
    }
  }
}
