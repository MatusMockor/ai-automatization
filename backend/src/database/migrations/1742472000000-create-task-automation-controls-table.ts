import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';
import { getTimestampColumnType } from '../../common/utils/database-column.utils';

export class CreateTaskAutomationControlsTable1742472000000 implements MigrationInterface {
  name = 'CreateTaskAutomationControlsTable1742472000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('task_automation_controls');
    if (hasTable) {
      return;
    }

    const timestampType = getTimestampColumnType();
    const uuidDefault =
      queryRunner.connection.options.type === 'postgres'
        ? 'uuid_generate_v4()'
        : undefined;

    await queryRunner.createTable(
      new Table({
        name: 'task_automation_controls',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            ...(uuidDefault ? { default: uuidDefault } : {}),
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'task_key',
            type: 'varchar',
            length: '512',
          },
          {
            name: 'control_type',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'until_at',
            type: timestampType,
            isNullable: true,
          },
          {
            name: 'source_version',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'restored_at',
            type: timestampType,
            isNullable: true,
          },
          {
            name: 'created_at',
            type: timestampType,
            default: this.nowDefault(queryRunner),
          },
          {
            name: 'updated_at',
            type: timestampType,
            default: this.nowDefault(queryRunner),
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
            name: 'UQ_task_automation_controls_user_task_key',
            columnNames: ['user_id', 'task_key'],
            isUnique: true,
          }),
          new TableIndex({
            name: 'IDX_task_automation_controls_user_active',
            columnNames: ['user_id', 'is_active'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_task_automation_controls_type',
            expression: `control_type IN ('snooze', 'dismiss_until_change')`,
          }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('task_automation_controls');
    if (hasTable) {
      await queryRunner.dropTable('task_automation_controls');
    }
  }

  private nowDefault(queryRunner: QueryRunner): string {
    return queryRunner.connection.options.type === 'sqljs'
      ? "datetime('now')"
      : 'now()';
  }
}
