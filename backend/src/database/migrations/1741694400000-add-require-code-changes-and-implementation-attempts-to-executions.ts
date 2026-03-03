import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRequireCodeChangesAndImplementationAttemptsToExecutions1741694400000 implements MigrationInterface {
  name =
    'AddRequireCodeChangesAndImplementationAttemptsToExecutions1741694400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('executions', [
      new TableColumn({
        name: 'require_code_changes',
        type: 'boolean',
        default: 'true',
      }),
      new TableColumn({
        name: 'implementation_attempts',
        type: 'integer',
        default: '1',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('executions', [
      'require_code_changes',
      'implementation_attempts',
    ]);
  }
}
