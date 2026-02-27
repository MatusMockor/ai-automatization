import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddExecutionTimeoutToUserSettings1741089600000 implements MigrationInterface {
  name = 'AddExecutionTimeoutToUserSettings1741089600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user_settings',
      new TableColumn({
        name: 'execution_timeout_ms',
        type: 'integer',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('user_settings', 'execution_timeout_ms');
  }
}
