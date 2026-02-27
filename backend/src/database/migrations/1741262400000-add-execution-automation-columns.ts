import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
} from 'typeorm';

export class AddExecutionAutomationColumns1741262400000 implements MigrationInterface {
  name = 'AddExecutionAutomationColumns1741262400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('executions', [
      new TableColumn({
        name: 'automation_status',
        type: 'varchar',
        length: '24',
        default: "'pending'",
      }),
      new TableColumn({
        name: 'automation_attempts',
        type: 'integer',
        default: '0',
      }),
      new TableColumn({
        name: 'branch_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'commit_sha',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'pull_request_number',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'pull_request_url',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'pull_request_title',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'automation_error_message',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'automation_completed_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    ]);

    await queryRunner.createCheckConstraint(
      'executions',
      new TableCheck({
        name: 'CHK_executions_automation_status',
        expression:
          "automation_status IN ('not_applicable', 'pending', 'publishing', 'no_changes', 'published', 'failed')",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropCheckConstraint(
      'executions',
      'CHK_executions_automation_status',
    );

    await queryRunner.dropColumns('executions', [
      'automation_status',
      'automation_attempts',
      'branch_name',
      'commit_sha',
      'pull_request_number',
      'pull_request_url',
      'pull_request_title',
      'automation_error_message',
      'automation_completed_at',
    ]);
  }
}
