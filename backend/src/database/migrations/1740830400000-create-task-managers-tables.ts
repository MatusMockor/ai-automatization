import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateTaskManagersTables1740830400000 implements MigrationInterface {
  name = 'CreateTaskManagersTables1740830400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'task_manager_connections',
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
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'scope_key',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'base_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'workspace_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'project_id',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'project_key',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'auth_mode',
            type: 'varchar',
            length: '16',
            isNullable: true,
          },
          {
            name: 'email_encrypted',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'secret_encrypted',
            type: 'text',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'connected'",
          },
          {
            name: 'last_validated_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_task_manager_connections_user_provider_scope',
            columnNames: ['user_id', 'provider', 'scope_key'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_task_manager_connections_user_id',
            columnNames: ['user_id'],
          }),
        ],
      }),
      true,
    );

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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('task_prefixes', true);
    await queryRunner.dropTable('task_manager_connections', true);
  }
}
