import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTimestampColumnType } from '../../common/utils/database-column.utils';

export class AddSuppressedAtToTaskAutomationControls1742558500000
  implements MigrationInterface
{
  name = 'AddSuppressedAtToTaskAutomationControls1742558500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'task_automation_controls',
      'suppressed_at',
    );
    if (hasColumn) {
      return;
    }

    const timestampType = getTimestampColumnType();

    await queryRunner.addColumn(
      'task_automation_controls',
      new TableColumn({
        name: 'suppressed_at',
        type: timestampType,
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'task_automation_controls',
      'suppressed_at',
    );
    if (hasColumn) {
      await queryRunner.dropColumn(
        'task_automation_controls',
        'suppressed_at',
      );
    }
  }
}
