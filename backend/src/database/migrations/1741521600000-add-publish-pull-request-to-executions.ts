import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPublishPullRequestToExecutions1741521600000 implements MigrationInterface {
  name = 'AddPublishPullRequestToExecutions1741521600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'executions',
      new TableColumn({
        name: 'publish_pull_request',
        type: 'boolean',
        default: 'true',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('executions', 'publish_pull_request');
  }
}
