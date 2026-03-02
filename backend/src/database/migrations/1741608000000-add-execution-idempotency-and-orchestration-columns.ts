import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddExecutionIdempotencyAndOrchestrationColumns1741608000000 implements MigrationInterface {
  name = 'AddExecutionIdempotencyAndOrchestrationColumns1741608000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('executions', [
      new TableColumn({
        name: 'idempotency_key',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'request_hash',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'orchestration_state',
        type: 'varchar',
        length: '16',
        default: "'queued'",
      }),
    ]);

    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        'CREATE INDEX "IDX_executions_user_created_at_desc" ON "executions" ("user_id", "created_at" DESC)',
      );
      await queryRunner.query(
        'CREATE UNIQUE INDEX "UQ_executions_user_idempotency_key" ON "executions" ("user_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        'DROP INDEX IF EXISTS "IDX_executions_user_created_at_desc"',
      );
      await queryRunner.query(
        'DROP INDEX IF EXISTS "UQ_executions_user_idempotency_key"',
      );
    }

    await queryRunner.dropColumns('executions', [
      'idempotency_key',
      'request_hash',
      'orchestration_state',
    ]);
  }
}
