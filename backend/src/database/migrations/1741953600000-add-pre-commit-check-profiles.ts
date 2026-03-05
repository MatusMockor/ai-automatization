import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPreCommitCheckProfiles1741953600000 implements MigrationInterface {
  name = 'AddPreCommitCheckProfiles1741953600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user_settings',
      new TableColumn({
        name: 'pre_commit_checks_default',
        type: 'jsonb',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'repositories',
      new TableColumn({
        name: 'pre_commit_checks_override',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasUserSettings = await queryRunner.hasTable('user_settings');
    if (hasUserSettings) {
      const userSettingsTable = await queryRunner.getTable('user_settings');
      if (userSettingsTable?.findColumnByName('pre_commit_checks_default')) {
        await queryRunner.dropColumn(
          'user_settings',
          'pre_commit_checks_default',
        );
      }
    }

    const hasRepositories = await queryRunner.hasTable('repositories');
    if (hasRepositories) {
      const repositoriesTable = await queryRunner.getTable('repositories');
      if (repositoriesTable?.findColumnByName('pre_commit_checks_override')) {
        await queryRunner.dropColumn(
          'repositories',
          'pre_commit_checks_override',
        );
      }
    }
  }
}
