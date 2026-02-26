import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';

type CreateUserInput = {
  name?: string;
  email?: string;
  password?: string;
};

type CreatedUser = {
  user: User;
  plainPassword: string;
};

export class UserFactory {
  constructor(private readonly dataSource: DataSource) {}

  buildCreateInput(input: CreateUserInput = {}): Required<CreateUserInput> {
    return {
      name: input.name ?? faker.person.fullName(),
      email: input.email ?? faker.internet.email().toLowerCase(),
      password: input.password ?? UserFactory.generateStrongPassword(),
    };
  }

  async create(input: CreateUserInput = {}): Promise<CreatedUser> {
    const generatedInput = this.buildCreateInput(input);
    const plainPassword = generatedInput.password;
    const passwordHash = await bcrypt.hash(plainPassword, 4);

    const repository = this.dataSource.getRepository(User);
    const user = repository.create({
      name: generatedInput.name,
      email: generatedInput.email,
      passwordHash,
    });

    return {
      user: await repository.save(user),
      plainPassword,
    };
  }

  private static generateStrongPassword(): string {
    return `Aa1!${faker.string.alphanumeric(12)}`;
  }
}
