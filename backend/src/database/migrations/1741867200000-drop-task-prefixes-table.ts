import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class DropTaskPrefixesTable1741867200000 implements MigrationInterface {
  name = 'DropTaskPrefixesTable1741867200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTaskPrefixesTable = await queryRunner.hasTable('task_prefixes');
    if (!hasTaskPrefixesTable) {
      return;
    }

    await queryRunner.dropTable('task_prefixes', true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTaskPrefixesTable = await queryRunner.hasTable('task_prefixes');
    if (hasTaskPrefixesTable) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'task_prefixes',
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
            name: 'connection_id',
            type: 'uuid',
          },
          {
            name: 'value',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'normalized_value',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_task_prefixes_connection_normalized',
            columnNames: ['connection_id', 'normalized_value'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['connection_id'],
            referencedTableName: 'task_manager_connections',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_task_prefixes_connection_id',
            columnNames: ['connection_id'],
          }),
        ],
      }),
      true,
    );
  }
}
