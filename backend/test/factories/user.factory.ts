import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';

type CreateUserInput = {
  email?: string;
  password?: string;
};

type CreatedUser = {
  user: User;
  plainPassword: string;
};

export class UserFactory {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateUserInput = {}): Promise<CreatedUser> {
    const plainPassword = input.password ?? 'Password123!';
    const passwordHash = await bcrypt.hash(plainPassword, 4);

    const repository = this.dataSource.getRepository(User);
    const user = repository.create({
      email: input.email ?? `${randomUUID()}@example.com`,
      passwordHash,
    });

    return {
      user: await repository.save(user),
      plainPassword,
    };
  }
}
