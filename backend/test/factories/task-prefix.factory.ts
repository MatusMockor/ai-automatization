import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { TaskPrefix } from '../../src/task-managers/entities/task-prefix.entity';

type CreateTaskPrefixInput = {
  connectionId: string;
  value?: string;
};

export class TaskPrefixFactory {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateTaskPrefixInput): Promise<TaskPrefix> {
    const value =
      input.value ??
      `${faker.hacker.verb()}-${faker.string.alphanumeric(8).toLowerCase()}/`;

    const prefix = this.dataSource.getRepository(TaskPrefix).create({
      connectionId: input.connectionId,
      value,
      normalizedValue: value.trim().toLowerCase(),
    });

    return this.dataSource.getRepository(TaskPrefix).save(prefix);
  }
}
