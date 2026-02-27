import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateExecutionsTable1741176000000 implements MigrationInterface {
  name = 'CreateExecutionsTable1741176000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'executions',
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
            name: 'repository_id',
            type: 'uuid',
          },
          {
            name: 'task_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'task_external_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'task_title',
            type: 'text',
          },
          {
            name: 'task_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'task_source',
            type: 'varchar',
            length: '16',
          },
          {
            name: 'action',
            type: 'varchar',
            length: '16',
          },
          {
            name: 'prompt',
            type: 'text',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'pending'",
          },
          {
            name: 'output',
            type: 'text',
            default: "''",
          },
          {
            name: 'output_truncated',
            type: 'boolean',
            default: 'false',
          },
          {
            name: 'pid',
            type: 'integer',
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
            name: 'exit_code',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
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
            name: 'IDX_executions_user_created_at',
            columnNames: ['user_id', 'created_at'],
          }),
          new TableIndex({
            name: 'IDX_executions_user_status',
            columnNames: ['user_id', 'status'],
          }),
          new TableIndex({
            name: 'IDX_executions_repository_id',
            columnNames: ['repository_id'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_executions_task_source',
            expression: `task_source IN ('asana', 'jira')`,
          }),
          new TableCheck({
            name: 'CHK_executions_action',
            expression: `action IN ('fix', 'feature', 'plan')`,
          }),
          new TableCheck({
            name: 'CHK_executions_status',
            expression: `status IN ('pending', 'running', 'completed', 'failed', 'cancelled')`,
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('executions', true);
  }
}
