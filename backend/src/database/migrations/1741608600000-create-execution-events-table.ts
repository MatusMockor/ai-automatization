import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateExecutionEventsTable1741608600000 implements MigrationInterface {
  name = 'CreateExecutionEventsTable1741608600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'execution_events',
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
            name: 'execution_id',
            type: 'uuid',
          },
          {
            name: 'sequence',
            type: 'integer',
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'payload_json',
            type: 'text',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['execution_id'],
            referencedTableName: 'executions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_execution_events_execution_created_at',
            columnNames: ['execution_id', 'created_at'],
          }),
          new TableIndex({
            name: 'IDX_execution_events_created_at',
            columnNames: ['created_at'],
          }),
          new TableIndex({
            name: 'UQ_execution_events_execution_sequence',
            columnNames: ['execution_id', 'sequence'],
            isUnique: true,
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('execution_events', true);
  }
}
