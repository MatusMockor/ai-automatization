import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { access, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { UserSettingsFactory } from './factories/user-settings.factory';
import { RepositoryFactory } from './factories/repository.factory';
import { UserFactory } from './factories/user.factory';
import { createTestApp } from './helpers/test-app.factory';
import { GITHUB_REPOSITORIES_GATEWAY } from '../src/repositories/constants/repositories.tokens';
import { ManagedRepository } from '../src/repositories/entities/repository.entity';
import {
  GithubAuthorizationError,
  GithubRepositoryNotFoundError,
} from '../src/repositories/errors/github-repositories.errors';
import {
  GithubRepositoriesGateway,
  GithubRepositoryMetadata,
} from '../src/repositories/interfaces/github-repositories-gateway.interface';

type LoginSession = {
  accessToken: string;
  userId: string;
};

const TEST_REPOSITORIES_BASE_PATH = `/tmp/ai-automation-repositories-test-repositories-${process.env.JEST_WORKER_ID ?? '0'}-${process.pid}`;

class FakeGithubRepositoriesGateway implements GithubRepositoriesGateway {
  private readonly repositories = new Map<string, GithubRepositoryMetadata>();

  registerRepository(repository: GithubRepositoryMetadata): void {
    this.repositories.set(repository.fullName.toLowerCase(), repository);
  }

  reset(): void {
    this.repositories.clear();
  }

  async getRepository(
    fullName: string,
    accessToken: string,
  ): Promise<GithubRepositoryMetadata> {
    if (accessToken.startsWith('invalid')) {
      throw new GithubAuthorizationError();
    }

    const repository = this.repositories.get(fullName.toLowerCase());
    if (!repository) {
      throw new GithubRepositoryNotFoundError();
    }

    return repository;
  }
}

describe('Repositories (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let userSettingsFactory: UserSettingsFactory;
  let repositoryFactory: RepositoryFactory;
  let githubGateway: FakeGithubRepositoriesGateway;

  beforeAll(async () => {
    githubGateway = new FakeGithubRepositoriesGateway();

    const context = await createTestApp({
      env: {
        REPOSITORIES_BASE_PATH: TEST_REPOSITORIES_BASE_PATH,
        GIT_COMMAND_TIMEOUT_MS: '20000',
      },
      providerOverrides: [
        {
          token: GITHUB_REPOSITORIES_GATEWAY,
          value: githubGateway,
        },
      ],
    });

    app = context.app;
    dataSource = context.dataSource;
    userFactory = new UserFactory(dataSource);
    userSettingsFactory = new UserSettingsFactory(
      dataSource,
      app.get(EncryptionService),
    );
    repositoryFactory = new RepositoryFactory(
      dataSource,
      TEST_REPOSITORIES_BASE_PATH,
    );
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    await repositoryFactory.resetWorkspace();
    githubGateway.reset();
  });

  afterAll(async () => {
    await rm(TEST_REPOSITORIES_BASE_PATH, { recursive: true, force: true });
    await app.close();
  });

  it('GET /api/repositories should return 401 when missing token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/repositories',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/repositories should return repositories only for authenticated user', async () => {
    const userOneSession = await createLoginSession();
    const userTwoSession = await createLoginSession();

    await repositoryFactory.create({
      userId: userOneSession.userId,
      fullName: 'owner-one/repo-one',
      localPath: repositoryFactory.buildLocalPath(
        userOneSession.userId,
        'owner-one/repo-one',
      ),
    });
    await repositoryFactory.create({
      userId: userTwoSession.userId,
      fullName: 'owner-two/repo-two',
      localPath: repositoryFactory.buildLocalPath(
        userTwoSession.userId,
        'owner-two/repo-two',
      ),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${userOneSession.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<Array<{ fullName: string }>>().map((item) => item.fullName),
    ).toEqual(['owner-one/repo-one']);
  });

  it('POST /api/repositories should create repository and clone it locally', async () => {
    const session = await createLoginSession();
    await setGithubToken(
      session.userId,
      `ghp_${faker.string.alphanumeric(36)}`,
    );
    const remoteRepository = await repositoryFactory.createRemoteRepository();
    githubGateway.registerRepository(remoteRepository);

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      id: string;
      fullName: string;
      cloneUrl: string;
      defaultBranch: string;
      isCloned: boolean;
    }>();

    expect(body.fullName).toBe(remoteRepository.fullName);
    expect(body.cloneUrl).toBe(remoteRepository.cloneUrl);
    expect(body.defaultBranch).toBe(remoteRepository.defaultBranch);
    expect(body.isCloned).toBe(true);

    const storedRepository = await dataSource
      .getRepository(ManagedRepository)
      .findOneBy({ id: body.id, userId: session.userId });

    expect(storedRepository).not.toBeNull();
    expect(storedRepository?.isCloned).toBe(true);
    await expect(
      access(storedRepository?.localPath ?? ''),
    ).resolves.toBeUndefined();
    await expect(
      access(join(storedRepository?.localPath ?? '', '.git')),
    ).resolves.toBeUndefined();
  });

  it('POST /api/repositories should reject duplicate repository for same user', async () => {
    const session = await createLoginSession();
    await setGithubToken(
      session.userId,
      `ghp_${faker.string.alphanumeric(36)}`,
    );
    const remoteRepository = await repositoryFactory.createRemoteRepository();
    githubGateway.registerRepository(remoteRepository);

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName,
      },
    });

    expect(firstResponse.statusCode).toBe(201);

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName.toUpperCase(),
      },
    });

    expect(duplicateResponse.statusCode).toBe(409);
  });

  it('POST /api/repositories should return 400 when github token is missing', async () => {
    const session = await createLoginSession();
    const remoteRepository = await repositoryFactory.createRemoteRepository();
    githubGateway.registerRepository(remoteRepository);

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /api/repositories should return 404 when github repository does not exist', async () => {
    const session = await createLoginSession();
    await setGithubToken(
      session.userId,
      `ghp_${faker.string.alphanumeric(36)}`,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: 'missing-owner/missing-repo',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('DELETE /api/repositories/:id should remove repository record and local clone', async () => {
    const session = await createLoginSession();
    await setGithubToken(
      session.userId,
      `ghp_${faker.string.alphanumeric(36)}`,
    );
    const remoteRepository = await repositoryFactory.createRemoteRepository();
    githubGateway.registerRepository(remoteRepository);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdRepository = createResponse.json<{ id: string }>();

    const storedRepository = await dataSource
      .getRepository(ManagedRepository)
      .findOneBy({ id: createdRepository.id });
    expect(storedRepository).not.toBeNull();

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/repositories/${createdRepository.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(204);

    const deletedRecord = await dataSource
      .getRepository(ManagedRepository)
      .findOneBy({
        id: createdRepository.id,
      });
    expect(deletedRecord).toBeNull();

    await expect(
      access(storedRepository?.localPath ?? ''),
    ).rejects.toBeDefined();
  });

  it('DELETE /api/repositories/:id should return 404 for repository owned by another user', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();

    await setGithubToken(
      ownerSession.userId,
      `ghp_${faker.string.alphanumeric(36)}`,
    );
    const remoteRepository = await repositoryFactory.createRemoteRepository();
    githubGateway.registerRepository(remoteRepository);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName,
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const createdRepository = createResponse.json<{ id: string }>();
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/repositories/${createdRepository.id}`,
      headers: {
        authorization: `Bearer ${attackerSession.accessToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(404);
  });

  it('POST /api/repositories/:id/sync should pull remote changes on clean repository', async () => {
    const session = await createLoginSession();
    await setGithubToken(
      session.userId,
      `ghp_${faker.string.alphanumeric(36)}`,
    );
    const remoteRepository = await repositoryFactory.createRemoteRepository();
    githubGateway.registerRepository(remoteRepository);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdRepository = createResponse.json<{ id: string }>();

    const syncedFile = await repositoryFactory.addCommitToRemote(
      remoteRepository.remotePath,
      remoteRepository.defaultBranch,
    );

    const syncResponse = await app.inject({
      method: 'POST',
      url: `/api/repositories/${createdRepository.id}/sync`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(syncResponse.statusCode).toBe(200);

    const storedRepository = await dataSource
      .getRepository(ManagedRepository)
      .findOneBy({ id: createdRepository.id });
    expect(storedRepository).not.toBeNull();

    const syncedFileContent = await readFile(
      join(storedRepository?.localPath ?? '', syncedFile),
      'utf8',
    );
    expect(syncedFileContent.length).toBeGreaterThan(0);
  });

  it('POST /api/repositories/:id/sync should return 409 for dirty local repository', async () => {
    const session = await createLoginSession();
    await setGithubToken(
      session.userId,
      `ghp_${faker.string.alphanumeric(36)}`,
    );
    const remoteRepository = await repositoryFactory.createRemoteRepository();
    githubGateway.registerRepository(remoteRepository);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        fullName: remoteRepository.fullName,
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const createdRepository = createResponse.json<{ id: string }>();
    const storedRepository = await dataSource
      .getRepository(ManagedRepository)
      .findOneBy({ id: createdRepository.id });

    await writeFile(
      join(storedRepository?.localPath ?? '', 'untracked.txt'),
      'dirty changes',
      'utf8',
    );

    const syncResponse = await app.inject({
      method: 'POST',
      url: `/api/repositories/${createdRepository.id}/sync`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(syncResponse.statusCode).toBe(409);
  });

  const createLoginSession = async (): Promise<LoginSession> => {
    const { user, plainPassword } = await userFactory.create();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: user.email,
        password: plainPassword,
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json<{ accessToken: string }>();

    return {
      accessToken: loginBody.accessToken,
      userId: user.id,
    };
  };

  const setGithubToken = async (
    userId: string,
    githubToken: string,
  ): Promise<void> => {
    await userSettingsFactory.create(userId, {
      githubToken,
      claudeOauthToken: null,
    });
  };
});
