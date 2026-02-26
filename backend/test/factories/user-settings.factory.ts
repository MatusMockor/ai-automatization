import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../../src/common/encryption/encryption.service';
import { UserSettings } from '../../src/settings/entities/user-settings.entity';

type CreateUserSettingsInput = {
  githubToken?: string | null;
  claudeApiKey?: string | null;
};

type CreatedUserSettings = {
  settings: UserSettings;
  githubToken: string | null;
  claudeApiKey: string | null;
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
      githubToken: input.githubToken ?? `ghp_${faker.string.alphanumeric(36)}`,
      claudeApiKey:
        input.claudeApiKey ?? `sk-ant-${faker.string.alphanumeric(40)}`,
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
      claudeApiKeyEncrypted:
        generatedInput.claudeApiKey === null
          ? null
          : this.encryptionService.encrypt(generatedInput.claudeApiKey),
    });

    return {
      settings: await repository.save(settings),
      githubToken: generatedInput.githubToken,
      claudeApiKey: generatedInput.claudeApiKey,
    };
  }
}
