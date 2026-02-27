import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';
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
        claudeApiKey: null,
        executionTimeoutMs: null,
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

  async getClaudeApiKeyForUserOrNull(userId: string): Promise<string | null> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    if (!settings?.claudeApiKeyEncrypted) {
      return null;
    }

    return this.encryptionService.decrypt(settings.claudeApiKeyEncrypted);
  }

  async getExecutionTimeoutMsForUserOrNull(
    userId: string,
  ): Promise<number | null> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    return settings?.executionTimeoutMs ?? null;
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
        claudeApiKeyEncrypted: null,
        executionTimeoutMs: null,
      });

    if (dto.githubToken !== undefined) {
      settings.githubTokenEncrypted = this.encryptNullableSecret(
        dto.githubToken,
      );
    }

    if (dto.claudeApiKey !== undefined) {
      settings.claudeApiKeyEncrypted = this.encryptNullableSecret(
        dto.claudeApiKey,
      );
    }

    if (dto.executionTimeoutMs !== undefined) {
      settings.executionTimeoutMs = dto.executionTimeoutMs;
    }

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
      claudeApiKey: this.maskEncryptedSecret(settings.claudeApiKeyEncrypted),
      executionTimeoutMs: settings.executionTimeoutMs,
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
}
