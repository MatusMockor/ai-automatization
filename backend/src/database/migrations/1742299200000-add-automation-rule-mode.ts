import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
} from 'typeorm';

export class AddAutomationRuleMode1742299200000 implements MigrationInterface {
  name = 'AddAutomationRuleMode1742299200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('automation_rules');
    if (!table) {
      return;
    }

    if (!table.findColumnByName('mode')) {
      await queryRunner.addColumn(
        'automation_rules',
        new TableColumn({
          name: 'mode',
          type: 'varchar',
          length: '16',
          default: "'suggest'",
        }),
      );
    }

    const refreshedTable = await queryRunner.getTable('automation_rules');
    if (!refreshedTable) {
      return;
    }

    if (
      !refreshedTable.checks.find(
        (check) => check.name === 'CHK_automation_rules_mode',
      )
    ) {
      await queryRunner.createCheckConstraint(
        'automation_rules',
        new TableCheck({
          name: 'CHK_automation_rules_mode',
          expression: `mode IN ('suggest', 'draft')`,
        }),
      );
    }

    if (
      !refreshedTable.checks.find(
        (check) => check.name === 'CHK_automation_rules_draft_action_required',
      )
    ) {
      await queryRunner.createCheckConstraint(
        'automation_rules',
        new TableCheck({
          name: 'CHK_automation_rules_draft_action_required',
          expression: `mode <> 'draft' OR suggested_action IS NOT NULL`,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('automation_rules');
    if (!table) {
      return;
    }

    if (
      table.checks.find(
        (check) => check.name === 'CHK_automation_rules_draft_action_required',
      )
    ) {
      await queryRunner.dropCheckConstraint(
        'automation_rules',
        'CHK_automation_rules_draft_action_required',
      );
    }

    if (
      table.checks.find((check) => check.name === 'CHK_automation_rules_mode')
    ) {
      await queryRunner.dropCheckConstraint(
        'automation_rules',
        'CHK_automation_rules_mode',
      );
    }

    if (table.findColumnByName('mode')) {
      await queryRunner.dropColumn('automation_rules', 'mode');
    }
  }
}
