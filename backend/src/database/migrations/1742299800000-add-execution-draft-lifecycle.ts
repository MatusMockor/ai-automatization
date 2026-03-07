import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddExecutionDraftLifecycle1742299800000 implements MigrationInterface {
  name = 'AddExecutionDraftLifecycle1742299800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('executions');
    if (!table) {
      return;
    }

    const columnsToAdd = [
      !table.findColumnByName('trigger_type') &&
        new TableColumn({
          name: 'trigger_type',
          type: 'varchar',
          length: '32',
          default: "'manual'",
        }),
      !table.findColumnByName('origin_rule_id') &&
        new TableColumn({
          name: 'origin_rule_id',
          type: 'uuid',
          isNullable: true,
        }),
      !table.findColumnByName('source_task_snapshot_updated_at') &&
        new TableColumn({
          name: 'source_task_snapshot_updated_at',
          type: 'timestamptz',
          isNullable: true,
        }),
      !table.findColumnByName('is_draft') &&
        new TableColumn({
          name: 'is_draft',
          type: 'boolean',
          default: false,
        }),
      !table.findColumnByName('draft_status') &&
        new TableColumn({
          name: 'draft_status',
          type: 'varchar',
          length: '16',
          isNullable: true,
        }),
    ].filter((column): column is TableColumn => Boolean(column));

    if (columnsToAdd.length > 0) {
      await queryRunner.addColumns('executions', columnsToAdd);
    }

    const refreshedTable = await queryRunner.getTable('executions');
    if (!refreshedTable) {
      return;
    }

    if (
      !refreshedTable.indices.find(
        (index) => index.name === 'IDX_executions_user_task_draft',
      )
    ) {
      await queryRunner.createIndex(
        'executions',
        new TableIndex({
          name: 'IDX_executions_user_task_draft',
          columnNames: ['user_id', 'task_id', 'is_draft'],
        }),
      );
    }

    if (
      !refreshedTable.checks.find(
        (check) => check.name === 'CHK_executions_trigger_type',
      )
    ) {
      await queryRunner.createCheckConstraint(
        'executions',
        new TableCheck({
          name: 'CHK_executions_trigger_type',
          expression: `trigger_type IN ('manual', 'automation_rule', 'schedule')`,
        }),
      );
    }

    if (
      !refreshedTable.checks.find(
        (check) => check.name === 'CHK_executions_draft_status',
      )
    ) {
      await queryRunner.createCheckConstraint(
        'executions',
        new TableCheck({
          name: 'CHK_executions_draft_status',
          expression: `draft_status IS NULL OR draft_status IN ('ready', 'superseded')`,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('executions');
    if (!table) {
      return;
    }

    if (
      table.checks.find((check) => check.name === 'CHK_executions_draft_status')
    ) {
      await queryRunner.dropCheckConstraint(
        'executions',
        'CHK_executions_draft_status',
      );
    }

    if (
      table.checks.find((check) => check.name === 'CHK_executions_trigger_type')
    ) {
      await queryRunner.dropCheckConstraint(
        'executions',
        'CHK_executions_trigger_type',
      );
    }

    if (
      table.indices.find(
        (index) => index.name === 'IDX_executions_user_task_draft',
      )
    ) {
      await queryRunner.dropIndex(
        'executions',
        'IDX_executions_user_task_draft',
      );
    }

    if (table.findColumnByName('draft_status')) {
      await queryRunner.dropColumn('executions', 'draft_status');
    }
    if (table.findColumnByName('is_draft')) {
      await queryRunner.dropColumn('executions', 'is_draft');
    }
    if (table.findColumnByName('source_task_snapshot_updated_at')) {
      await queryRunner.dropColumn(
        'executions',
        'source_task_snapshot_updated_at',
      );
    }
    if (table.findColumnByName('origin_rule_id')) {
      await queryRunner.dropColumn('executions', 'origin_rule_id');
    }
    if (table.findColumnByName('trigger_type')) {
      await queryRunner.dropColumn('executions', 'trigger_type');
    }
  }
}
