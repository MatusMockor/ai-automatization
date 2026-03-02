import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../../src/common/encryption/encryption.service';
import { UserSettings } from '../../src/settings/entities/user-settings.entity';

type CreateUserSettingsInput = {
  githubToken?: string | null;
  claudeOauthToken?: string | null;
  executionTimeoutMs?: number | null;
};

type CreatedUserSettings = {
  settings: UserSettings;
  githubToken: string | null;
  claudeOauthToken: string | null;
  executionTimeoutMs: number | null;
};

export class UserSettingsFactory {
  constructor(
    private readonly dataSource: DataSource,
    private readonly encryptionService: EncryptionService,
  ) {}

  buildCreateInput(
    input: CreateUserSettingsInput = {},
  ): Required<CreateUserSettingsInput> {
    return {
      githubToken:
        input.githubToken === undefined
          ? `ghp_${faker.string.alphanumeric(36)}`
          : input.githubToken,
      claudeOauthToken:
        input.claudeOauthToken === undefined
          ? `oauth_${faker.string.alphanumeric(48)}`
          : input.claudeOauthToken,
      executionTimeoutMs:
        input.executionTimeoutMs === undefined
          ? 1800000
          : input.executionTimeoutMs,
    };
  }

  async create(
    userId: string,
    input: CreateUserSettingsInput = {},
  ): Promise<CreatedUserSettings> {
    const generatedInput = this.buildCreateInput(input);

    const repository = this.dataSource.getRepository(UserSettings);
    const settings = repository.create({
      userId,
      githubTokenEncrypted:
        generatedInput.githubToken === null
          ? null
          : this.encryptionService.encrypt(generatedInput.githubToken),
      claudeOauthTokenEncrypted:
        generatedInput.claudeOauthToken === null
          ? null
          : this.encryptionService.encrypt(generatedInput.claudeOauthToken),
      executionTimeoutMs: generatedInput.executionTimeoutMs,
    });

    return {
      settings: await repository.save(settings),
      githubToken: generatedInput.githubToken,
      claudeOauthToken: generatedInput.claudeOauthToken,
      executionTimeoutMs: generatedInput.executionTimeoutMs,
    };
  }
}
