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
        isNullable: false,
      }),
      new TableColumn({
        name: 'implementation_attempts',
        type: 'integer',
        default: '1',
        isNullable: false,
      }),
    ]);

    await queryRunner.query(
      `ALTER TABLE "executions" ADD CONSTRAINT "chk_executions_implementation_attempts_min_1" CHECK ("implementation_attempts" >= 1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "executions" DROP CONSTRAINT IF EXISTS "chk_executions_implementation_attempts_min_1"`,
    );
    await queryRunner.dropColumns('executions', [
      'require_code_changes',
      'implementation_attempts',
    ]);
  }
}
