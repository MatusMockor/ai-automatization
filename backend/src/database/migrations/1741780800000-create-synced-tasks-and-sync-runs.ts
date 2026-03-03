import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableColumn,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateSyncedTasksAndSyncRuns1741780800000 implements MigrationInterface {
  name = 'CreateSyncedTasksAndSyncRuns1741780800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('task_manager_connections', [
      new TableColumn({
        name: 'last_synced_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_sync_status',
        type: 'varchar',
        length: '16',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_sync_error',
        type: 'text',
        isNullable: true,
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'synced_tasks',
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
            name: 'connection_id',
            type: 'uuid',
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'external_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '4000',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'assignee',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'source_updated_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_synced_at',
            type: 'timestamptz',
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
        uniques: [
          new TableUnique({
            name: 'UQ_synced_tasks_connection_external',
            columnNames: ['connection_id', 'external_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['connection_id'],
            referencedTableName: 'task_manager_connections',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_synced_tasks_user_provider',
            columnNames: ['user_id', 'provider'],
          }),
          new TableIndex({
            name: 'IDX_synced_tasks_connection_id',
            columnNames: ['connection_id'],
          }),
          new TableIndex({
            name: 'IDX_synced_tasks_source_updated_at',
            columnNames: ['source_updated_at'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_synced_tasks_provider',
            expression: `provider IN ('asana', 'jira')`,
          }),
          new TableCheck({
            name: 'CHK_synced_tasks_status',
            expression: `status IN ('open', 'in_progress', 'done', 'closed', 'unknown')`,
          }),
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'synced_task_scopes',
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
            name: 'task_id',
            type: 'uuid',
          },
          {
            name: 'scope_type',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'scope_id',
            type: 'varchar',
            length: '128',
          },
          {
            name: 'scope_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'parent_scope_type',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'parent_scope_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'parent_scope_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'is_primary',
            type: 'boolean',
            default: false,
          },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_synced_task_scopes_task_scope',
            columnNames: ['task_id', 'scope_type', 'scope_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['task_id'],
            referencedTableName: 'synced_tasks',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_synced_task_scopes_task_id',
            columnNames: ['task_id'],
          }),
          new TableIndex({
            name: 'IDX_synced_task_scopes_scope_type_id',
            columnNames: ['scope_type', 'scope_id'],
          }),
          new TableIndex({
            name: 'IDX_synced_task_scopes_parent_scope',
            columnNames: ['parent_scope_type', 'parent_scope_id'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_synced_task_scopes_scope_type',
            expression: `scope_type IN ('asana_workspace', 'asana_project', 'jira_project')`,
          }),
          new TableCheck({
            name: 'CHK_synced_task_scopes_parent_scope_type',
            expression: `parent_scope_type IS NULL OR parent_scope_type IN ('asana_workspace', 'jira_project')`,
          }),
          new TableCheck({
            name: 'CHK_synced_task_scopes_parent_scope_pair',
            expression:
              '(parent_scope_type IS NULL AND parent_scope_id IS NULL AND parent_scope_name IS NULL) OR (parent_scope_type IS NOT NULL AND parent_scope_id IS NOT NULL AND parent_scope_name IS NOT NULL)',
          }),
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'task_scope_repository_defaults',
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
            name: 'repository_id',
            type: 'uuid',
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
            name: 'IDX_task_scope_repo_defaults_user_provider',
            columnNames: ['user_id', 'provider'],
          }),
          new TableIndex({
            name: 'UQ_task_scope_repo_defaults_provider_default',
            columnNames: ['user_id', 'provider'],
            isUnique: true,
            where: `"scope_type" IS NULL AND "scope_id" IS NULL`,
          }),
          new TableIndex({
            name: 'UQ_task_scope_repository_defaults_user_provider_scope',
            columnNames: ['user_id', 'provider', 'scope_type', 'scope_id'],
            isUnique: true,
            where: `"scope_type" IS NOT NULL AND "scope_id" IS NOT NULL`,
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_task_scope_repo_defaults_provider',
            expression: `provider IN ('asana', 'jira')`,
          }),
          new TableCheck({
            name: 'CHK_task_scope_repo_defaults_scope_type',
            expression: `scope_type IS NULL OR scope_type IN ('asana_workspace', 'asana_project', 'jira_project')`,
          }),
          new TableCheck({
            name: 'CHK_task_scope_repo_defaults_scope_pair',
            expression:
              '(scope_type IS NULL AND scope_id IS NULL) OR (scope_type IS NOT NULL AND scope_id IS NOT NULL)',
          }),
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'task_sync_runs',
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
            name: 'status',
            type: 'varchar',
            length: '16',
          },
          {
            name: 'connections_total',
            type: 'integer',
            default: 0,
          },
          {
            name: 'connections_done',
            type: 'integer',
            default: 0,
          },
          {
            name: 'tasks_upserted',
            type: 'integer',
            default: 0,
          },
          {
            name: 'tasks_deleted',
            type: 'integer',
            default: 0,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'finished_at',
            type: 'timestamptz',
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
        ],
        indices: [
          new TableIndex({
            name: 'IDX_task_sync_runs_user_id',
            columnNames: ['user_id'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_task_sync_runs_status',
            expression: `status IN ('queued', 'running', 'completed', 'failed')`,
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('task_sync_runs', true);
    await queryRunner.dropTable('task_scope_repository_defaults', true);
    await queryRunner.dropTable('synced_task_scopes', true);
    await queryRunner.dropTable('synced_tasks', true);

    await queryRunner.dropColumns('task_manager_connections', [
      'last_sync_error',
      'last_sync_status',
      'last_synced_at',
    ]);
  }
}
