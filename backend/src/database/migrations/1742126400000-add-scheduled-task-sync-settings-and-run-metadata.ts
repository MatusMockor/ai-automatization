import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddScheduledTaskSyncSettingsAndRunMetadata1742126400000 implements MigrationInterface {
  name = 'AddScheduledTaskSyncSettingsAndRunMetadata1742126400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const userSettingsTable = await queryRunner.getTable('user_settings');
    if (userSettingsTable) {
      const missingUserSettingsColumns = [
        !userSettingsTable.findColumnByName('sync_enabled') &&
          new TableColumn({
            name: 'sync_enabled',
            type: 'boolean',
            default: false,
          }),
        !userSettingsTable.findColumnByName('sync_interval_minutes') &&
          new TableColumn({
            name: 'sync_interval_minutes',
            type: 'integer',
            isNullable: true,
          }),
        !userSettingsTable.findColumnByName('sync_asana_enabled') &&
          new TableColumn({
            name: 'sync_asana_enabled',
            type: 'boolean',
            default: true,
          }),
        !userSettingsTable.findColumnByName('sync_jira_enabled') &&
          new TableColumn({
            name: 'sync_jira_enabled',
            type: 'boolean',
            default: true,
          }),
      ].filter((column): column is TableColumn => Boolean(column));

      if (missingUserSettingsColumns.length > 0) {
        await queryRunner.addColumns(
          'user_settings',
          missingUserSettingsColumns,
        );
      }
    }

    const taskSyncRunsTable = await queryRunner.getTable('task_sync_runs');
    if (taskSyncRunsTable && !taskSyncRunsTable.findColumnByName('provider')) {
      await queryRunner.addColumn(
        'task_sync_runs',
        new TableColumn({
          name: 'provider',
          type: 'varchar',
          length: '32',
          isNullable: true,
        }),
      );
    }

    if (
      taskSyncRunsTable &&
      !taskSyncRunsTable.findColumnByName('trigger_type')
    ) {
      await queryRunner.addColumn(
        'task_sync_runs',
        new TableColumn({
          name: 'trigger_type',
          type: 'varchar',
          length: '16',
          default: "'manual'",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const taskSyncRunsTable = await queryRunner.getTable('task_sync_runs');
    if (taskSyncRunsTable?.findColumnByName('trigger_type')) {
      await queryRunner.dropColumn('task_sync_runs', 'trigger_type');
    }
    if (taskSyncRunsTable?.findColumnByName('provider')) {
      await queryRunner.dropColumn('task_sync_runs', 'provider');
    }

    const userSettingsTable = await queryRunner.getTable('user_settings');
    if (userSettingsTable?.findColumnByName('sync_jira_enabled')) {
      await queryRunner.dropColumn('user_settings', 'sync_jira_enabled');
    }
    if (userSettingsTable?.findColumnByName('sync_asana_enabled')) {
      await queryRunner.dropColumn('user_settings', 'sync_asana_enabled');
    }
    if (userSettingsTable?.findColumnByName('sync_interval_minutes')) {
      await queryRunner.dropColumn('user_settings', 'sync_interval_minutes');
    }
    if (userSettingsTable?.findColumnByName('sync_enabled')) {
      await queryRunner.dropColumn('user_settings', 'sync_enabled');
    }
  }
}
