import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddExecutionReviewGate1742040000000 implements MigrationInterface {
  name = 'AddExecutionReviewGate1742040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const timestampType = isPostgres ? 'timestamptz' : 'datetime';
    const uuidType = isPostgres ? 'uuid' : 'varchar';
    const nowDefault = isPostgres ? 'now()' : "datetime('now')";
    const uuidDefault = isPostgres ? 'uuid_generate_v4()' : undefined;

    if (isPostgres) {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    }

    const userSettingsTable = await queryRunner.getTable('user_settings');
    if (!userSettingsTable?.findColumnByName('ai_review_enabled')) {
      await queryRunner.addColumn(
        'user_settings',
        new TableColumn({
          name: 'ai_review_enabled',
          type: 'boolean',
          default: true,
        }),
      );
    }

    const executionsTable = await queryRunner.getTable('executions');
    if (!executionsTable?.findColumnByName('execution_role')) {
      await queryRunner.addColumn(
        'executions',
        new TableColumn({
          name: 'execution_role',
          type: 'varchar',
          length: '16',
          default: "'implementation'",
        }),
      );
    }

    if (!executionsTable?.findColumnByName('parent_execution_id')) {
      await queryRunner.addColumn(
        'executions',
        new TableColumn({
          name: 'parent_execution_id',
          type: uuidType,
          isNullable: true,
        }),
      );
    }

    if (!executionsTable?.findColumnByName('root_execution_id')) {
      await queryRunner.addColumn(
        'executions',
        new TableColumn({
          name: 'root_execution_id',
          type: uuidType,
          isNullable: true,
        }),
      );
      await queryRunner.query(
        'UPDATE executions SET root_execution_id = id WHERE root_execution_id IS NULL',
      );
      await queryRunner.changeColumn(
        'executions',
        'root_execution_id',
        new TableColumn({
          name: 'root_execution_id',
          type: uuidType,
          isNullable: false,
        }),
      );
    }

    if (!executionsTable?.findColumnByName('review_gate_status')) {
      await queryRunner.addColumn(
        'executions',
        new TableColumn({
          name: 'review_gate_status',
          type: 'varchar',
          length: '32',
          default: "'not_applicable'",
        }),
      );
    }

    if (!executionsTable?.findColumnByName('review_pending_decision_until')) {
      await queryRunner.addColumn(
        'executions',
        new TableColumn({
          name: 'review_pending_decision_until',
          type: timestampType,
          isNullable: true,
        }),
      );
    }

    const executionReviewsExists =
      await queryRunner.hasTable('execution_reviews');
    if (!executionReviewsExists) {
      await queryRunner.createTable(
        new Table({
          name: 'execution_reviews',
          columns: [
            {
              name: 'id',
              type: uuidType,
              isPrimary: true,
              isGenerated: isPostgres,
              generationStrategy: isPostgres ? 'uuid' : undefined,
              default: uuidDefault,
            },
            {
              name: 'root_execution_id',
              type: uuidType,
            },
            {
              name: 'parent_execution_id',
              type: uuidType,
            },
            {
              name: 'cycle',
              type: 'integer',
            },
            {
              name: 'review_execution_id',
              type: uuidType,
            },
            {
              name: 'remediation_execution_id',
              type: uuidType,
              isNullable: true,
            },
            {
              name: 'verdict',
              type: 'varchar',
              length: '16',
              isNullable: true,
            },
            {
              name: 'findings_markdown',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'status',
              type: 'varchar',
              length: '32',
            },
            {
              name: 'decision',
              type: 'varchar',
              length: '16',
              isNullable: true,
            },
            {
              name: 'decided_by_user_id',
              type: uuidType,
              isNullable: true,
            },
            {
              name: 'decided_at',
              type: timestampType,
              isNullable: true,
            },
            {
              name: 'pending_decision_until',
              type: timestampType,
              isNullable: true,
            },
            {
              name: 'created_at',
              type: timestampType,
              default: nowDefault,
            },
            {
              name: 'updated_at',
              type: timestampType,
              default: nowDefault,
            },
          ],
        }),
      );
    }

    const executionReviewsTable =
      await queryRunner.getTable('execution_reviews');
    if (
      executionReviewsTable &&
      !executionReviewsTable.indices.some(
        (index) => index.name === 'IDX_execution_reviews_root_cycle',
      )
    ) {
      await queryRunner.createIndex(
        'execution_reviews',
        new TableIndex({
          name: 'IDX_execution_reviews_root_cycle',
          columnNames: ['root_execution_id', 'cycle'],
          isUnique: true,
        }),
      );
    }

    if (
      executionReviewsTable &&
      !executionReviewsTable.indices.some(
        (index) => index.name === 'IDX_execution_reviews_parent_cycle',
      )
    ) {
      await queryRunner.createIndex(
        'execution_reviews',
        new TableIndex({
          name: 'IDX_execution_reviews_parent_cycle',
          columnNames: ['parent_execution_id', 'cycle'],
          isUnique: true,
        }),
      );
    }

    const refreshedExecutionsTable = await queryRunner.getTable('executions');
    if (
      refreshedExecutionsTable &&
      !refreshedExecutionsTable.indices.some(
        (index) => index.name === 'IDX_executions_root_created_at',
      )
    ) {
      await queryRunner.createIndex(
        'executions',
        new TableIndex({
          name: 'IDX_executions_root_created_at',
          columnNames: ['root_execution_id', 'created_at'],
        }),
      );
    }

    if (
      refreshedExecutionsTable &&
      !refreshedExecutionsTable.indices.some(
        (index) => index.name === 'IDX_executions_parent_execution_id',
      )
    ) {
      await queryRunner.createIndex(
        'executions',
        new TableIndex({
          name: 'IDX_executions_parent_execution_id',
          columnNames: ['parent_execution_id'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const executionsTable = await queryRunner.getTable('executions');
    if (
      executionsTable?.indices.some(
        (i) => i.name === 'IDX_executions_parent_execution_id',
      )
    ) {
      await queryRunner.dropIndex(
        'executions',
        'IDX_executions_parent_execution_id',
      );
    }
    if (
      executionsTable?.indices.some(
        (i) => i.name === 'IDX_executions_root_created_at',
      )
    ) {
      await queryRunner.dropIndex(
        'executions',
        'IDX_executions_root_created_at',
      );
    }

    const hasExecutionReviews = await queryRunner.hasTable('execution_reviews');
    if (hasExecutionReviews) {
      const executionReviewsTable =
        await queryRunner.getTable('execution_reviews');
      if (
        executionReviewsTable?.indices.some(
          (i) => i.name === 'IDX_execution_reviews_parent_cycle',
        )
      ) {
        await queryRunner.dropIndex(
          'execution_reviews',
          'IDX_execution_reviews_parent_cycle',
        );
      }
      if (
        executionReviewsTable?.indices.some(
          (i) => i.name === 'IDX_execution_reviews_root_cycle',
        )
      ) {
        await queryRunner.dropIndex(
          'execution_reviews',
          'IDX_execution_reviews_root_cycle',
        );
      }
      await queryRunner.dropTable('execution_reviews');
    }

    const refreshedExecutionsTable = await queryRunner.getTable('executions');
    if (
      refreshedExecutionsTable?.findColumnByName(
        'review_pending_decision_until',
      )
    ) {
      await queryRunner.dropColumn(
        'executions',
        'review_pending_decision_until',
      );
    }
    if (refreshedExecutionsTable?.findColumnByName('review_gate_status')) {
      await queryRunner.dropColumn('executions', 'review_gate_status');
    }
    if (refreshedExecutionsTable?.findColumnByName('root_execution_id')) {
      await queryRunner.dropColumn('executions', 'root_execution_id');
    }
    if (refreshedExecutionsTable?.findColumnByName('parent_execution_id')) {
      await queryRunner.dropColumn('executions', 'parent_execution_id');
    }
    if (refreshedExecutionsTable?.findColumnByName('execution_role')) {
      await queryRunner.dropColumn('executions', 'execution_role');
    }

    const userSettingsTable = await queryRunner.getTable('user_settings');
    if (userSettingsTable?.findColumnByName('ai_review_enabled')) {
      await queryRunner.dropColumn('user_settings', 'ai_review_enabled');
    }
  }
}
