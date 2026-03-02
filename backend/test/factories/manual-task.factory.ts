import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { ManualTask } from '../../src/manual-tasks/entities/manual-task.entity';

type CreateManualTaskInput = {
  userId: string;
  title?: string;
  description?: string | null;
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
    });

    return manualTaskRepository.save(manualTask);
  }
}
