import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import {
  ManualTask,
  ManualTaskWorkflowState,
} from '../../src/manual-tasks/entities/manual-task.entity';

type CreateManualTaskInput = {
  userId: string;
  title?: string;
  description?: string | null;
  contentUpdatedAt?: Date;
  workflowState?: ManualTaskWorkflowState;
};

export class ManualTaskFactory {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateManualTaskInput): Promise<ManualTask> {
    const manualTaskRepository = this.dataSource.getRepository(ManualTask);
    const manualTask = manualTaskRepository.create({
      userId: input.userId,
      title: input.title ?? faker.lorem.sentence(),
      description:
        input.description === undefined
          ? faker.lorem.paragraph({ min: 1, max: 2 })
          : input.description,
      contentUpdatedAt: input.contentUpdatedAt ?? new Date(),
      workflowState: input.workflowState ?? 'inbox',
    });

    return manualTaskRepository.save(manualTask);
  }
}
