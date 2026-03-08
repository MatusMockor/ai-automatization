import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
} from 'typeorm';

export class AddManualTaskAutomationSupport1742386200000 implements MigrationInterface {
  name = 'AddManualTaskAutomationSupport1742386200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const timestampType =
      process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';
    const manualTasksTable = await queryRunner.getTable('manual_tasks');
    if (
      manualTasksTable &&
      !manualTasksTable.findColumnByName('workflow_state')
    ) {
      await queryRunner.addColumn(
        'manual_tasks',
        new TableColumn({
          name: 'workflow_state',
          type: 'varchar',
          length: '32',
          default: "'inbox'",
          isNullable: false,
        }),
      );
    }

    let refreshedManualTasksTable = await queryRunner.getTable('manual_tasks');
    const workflowStateColumn =
      refreshedManualTasksTable?.findColumnByName('workflow_state');
    if (workflowStateColumn) {
      await queryRunner.query(
        `UPDATE "manual_tasks" SET "workflow_state" = 'inbox' WHERE "workflow_state" IS NULL`,
      );

      if (workflowStateColumn.isNullable) {
        await queryRunner.changeColumn(
          'manual_tasks',
          workflowStateColumn,
          new TableColumn({
            name: 'workflow_state',
            type: 'varchar',
            length: '32',
            default: "'inbox'",
            isNullable: false,
          }),
        );
        refreshedManualTasksTable = await queryRunner.getTable('manual_tasks');
      }
    }

    if (
      refreshedManualTasksTable &&
      !refreshedManualTasksTable.findColumnByName('content_updated_at')
    ) {
      await queryRunner.addColumn(
        'manual_tasks',
        new TableColumn({
          name: 'content_updated_at',
          type: timestampType,
          isNullable: true,
        }),
      );
      refreshedManualTasksTable = await queryRunner.getTable('manual_tasks');
    }

    const contentUpdatedAtColumn =
      refreshedManualTasksTable?.findColumnByName('content_updated_at');
    if (contentUpdatedAtColumn) {
      await queryRunner.query(
        `UPDATE "manual_tasks" SET "content_updated_at" = COALESCE("content_updated_at", "updated_at", "created_at", CURRENT_TIMESTAMP) WHERE "content_updated_at" IS NULL`,
      );

      if (contentUpdatedAtColumn.isNullable) {
        await queryRunner.changeColumn(
          'manual_tasks',
          contentUpdatedAtColumn,
          new TableColumn({
            name: 'content_updated_at',
            type: timestampType,
            isNullable: false,
          }),
        );
        refreshedManualTasksTable = await queryRunner.getTable('manual_tasks');
      }
    }

    if (
      refreshedManualTasksTable &&
      !refreshedManualTasksTable.checks.find(
        (check) => check.name === 'CHK_manual_tasks_workflow_state',
      )
    ) {
      await queryRunner.createCheckConstraint(
        'manual_tasks',
        new TableCheck({
          name: 'CHK_manual_tasks_workflow_state',
          expression:
            "workflow_state IS NOT NULL AND workflow_state IN ('inbox', 'drafted', 'in_progress', 'blocked', 'done', 'archived')",
        }),
      );
    }

    await this.replaceCheckConstraint(
      queryRunner,
      'automation_rules',
      'CHK_automation_rules_provider',
      `provider IN ('asana', 'jira', 'manual')`,
    );
    await this.replaceCheckConstraint(
      queryRunner,
      'automation_rules',
      'CHK_automation_rules_provider_scope_compat',
      "scope_type IS NULL OR (provider = 'asana' AND scope_type IN ('asana_workspace', 'asana_project')) OR (provider = 'jira' AND scope_type = 'jira_project')",
    );

    await this.replaceCheckConstraint(
      queryRunner,
      'task_scope_repository_defaults',
      'CHK_task_scope_repo_defaults_provider',
      `provider IN ('asana', 'jira', 'manual')`,
    );
    await this.replaceCheckConstraint(
      queryRunner,
      'task_scope_repository_defaults',
      'CHK_task_scope_repo_defaults_provider_scope_compat',
      "scope_type IS NULL OR (provider = 'asana' AND scope_type IN ('asana_workspace', 'asana_project')) OR (provider = 'jira' AND scope_type = 'jira_project')",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "automation_rules" WHERE "provider" = 'manual'`,
    );
    await queryRunner.query(
      `DELETE FROM "task_scope_repository_defaults" WHERE "provider" = 'manual'`,
    );

    await this.replaceCheckConstraint(
      queryRunner,
      'task_scope_repository_defaults',
      'CHK_task_scope_repo_defaults_provider_scope_compat',
      "scope_type IS NULL OR (provider = 'asana' AND scope_type IN ('asana_workspace', 'asana_project')) OR (provider = 'jira' AND scope_type = 'jira_project')",
    );
    await this.replaceCheckConstraint(
      queryRunner,
      'task_scope_repository_defaults',
      'CHK_task_scope_repo_defaults_provider',
      `provider IN ('asana', 'jira')`,
    );

    await this.replaceCheckConstraint(
      queryRunner,
      'automation_rules',
      'CHK_automation_rules_provider_scope_compat',
      "scope_type IS NULL OR (provider = 'asana' AND scope_type IN ('asana_workspace', 'asana_project')) OR (provider = 'jira' AND scope_type = 'jira_project')",
    );
    await this.replaceCheckConstraint(
      queryRunner,
      'automation_rules',
      'CHK_automation_rules_provider',
      `provider IN ('asana', 'jira')`,
    );

    const manualTasksTable = await queryRunner.getTable('manual_tasks');
    if (!manualTasksTable) {
      return;
    }

    if (
      manualTasksTable.checks.find(
        (check) => check.name === 'CHK_manual_tasks_workflow_state',
      )
    ) {
      await queryRunner.dropCheckConstraint(
        'manual_tasks',
        'CHK_manual_tasks_workflow_state',
      );
    }

    if (manualTasksTable.findColumnByName('workflow_state')) {
      await queryRunner.dropColumn('manual_tasks', 'workflow_state');
    }
    if (manualTasksTable.findColumnByName('content_updated_at')) {
      await queryRunner.dropColumn('manual_tasks', 'content_updated_at');
    }
  }

  private async replaceCheckConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    checkName: string,
    expression: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }

    if (table.checks.find((check) => check.name === checkName)) {
      await queryRunner.dropCheckConstraint(tableName, checkName);
    }

    await queryRunner.createCheckConstraint(
      tableName,
      new TableCheck({
        name: checkName,
        expression,
      }),
    );
  }
}
