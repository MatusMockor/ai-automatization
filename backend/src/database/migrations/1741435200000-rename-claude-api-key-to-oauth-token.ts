import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameClaudeApiKeyToOauthToken1741435200000 implements MigrationInterface {
  name = 'RenameClaudeApiKeyToOauthToken1741435200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn(
      'user_settings',
      'claude_api_key',
      'claude_oauth_token',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn(
      'user_settings',
      'claude_oauth_token',
      'claude_api_key',
    );
  }
}
