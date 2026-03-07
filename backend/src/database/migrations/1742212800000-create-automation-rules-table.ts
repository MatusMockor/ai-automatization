import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAutomationRulesTable1742212800000 implements MigrationInterface {
  name = 'CreateAutomationRulesTable1742212800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'automation_rules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'priority',
            type: 'integer',
            default: 0,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'scope_type',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'scope_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'title_contains',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'task_statuses',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'repository_id',
            type: 'uuid',
          },
          {
            name: 'suggested_action',
            type: 'varchar',
            length: '16',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['repository_id'],
            referencedTableName: 'repositories',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_automation_rules_user_provider_enabled',
            columnNames: ['user_id', 'provider', 'enabled'],
          }),
          new TableIndex({
            name: 'IDX_automation_rules_user_priority',
            columnNames: ['user_id', 'priority'],
          }),
          new TableIndex({
            name: 'IDX_automation_rules_repository_id',
            columnNames: ['repository_id'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_automation_rules_scope_pair',
            expression:
              '("scope_type" IS NULL AND "scope_id" IS NULL) OR ("scope_type" IS NOT NULL AND "scope_id" IS NOT NULL)',
          }),
          new TableCheck({
            name: 'CHK_automation_rules_provider',
            expression: `provider IN ('asana', 'jira')`,
          }),
          new TableCheck({
            name: 'CHK_automation_rules_scope_type',
            expression:
              "scope_type IS NULL OR scope_type IN ('asana_workspace', 'asana_project', 'jira_project')",
          }),
          new TableCheck({
            name: 'CHK_automation_rules_suggested_action',
            expression:
              "suggested_action IS NULL OR suggested_action IN ('fix', 'feature', 'plan')",
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('automation_rules');
    if (hasTable) {
      await queryRunner.dropTable('automation_rules');
    }
  }
}
