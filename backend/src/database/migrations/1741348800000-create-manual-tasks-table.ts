import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateManualTasksTable1741348800000 implements MigrationInterface {
  name = 'CreateManualTasksTable1741348800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'manual_tasks',
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
            name: 'IDX_manual_tasks_user_id',
            columnNames: ['user_id'],
          }),
        ],
      }),
      true,
    );

    await this.replaceExecutionsTaskSourceCheck(queryRunner, [
      'asana',
      'jira',
      'manual',
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "executions" WHERE "task_source" = 'manual'`,
    );
    await this.replaceExecutionsTaskSourceCheck(queryRunner, ['asana', 'jira']);
    await queryRunner.dropTable('manual_tasks', true);
  }

  private async replaceExecutionsTaskSourceCheck(
    queryRunner: QueryRunner,
    allowedSources: string[],
  ): Promise<void> {
    const executionsTable = await queryRunner.getTable('executions');
    if (!executionsTable) {
      throw new Error('Table "executions" was not found');
    }

    const sourceChecks = (executionsTable.checks ?? []).filter((check) => {
      const expression = (check.expression ?? '').toLowerCase();
      return (
        expression.includes('task_source') ||
        check.name === 'CHK_executions_task_source'
      );
    });

    for (const check of sourceChecks) {
      await queryRunner.dropCheckConstraint('executions', check);
    }

    const allowedSourcesExpression = allowedSources
      .map((source) => `'${source}'`)
      .join(', ');

    await queryRunner.createCheckConstraint(
      'executions',
      new TableCheck({
        name: 'CHK_executions_task_source',
        expression: `task_source IN (${allowedSourcesExpression})`,
      }),
    );
  }
}
