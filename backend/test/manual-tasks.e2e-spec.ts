import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { ManualTask } from '../src/manual-tasks/entities/manual-task.entity';
import { ManualTaskFactory } from './factories/manual-task.factory';
import { UserFactory } from './factories/user.factory';
import { createTestApp } from './helpers/test-app.factory';

type LoginSession = {
  accessToken: string;
  userId: string;
};

describe('Manual Tasks (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let manualTaskFactory: ManualTaskFactory;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    dataSource = context.dataSource;
    userFactory = new UserFactory(dataSource);
    manualTaskFactory = new ManualTaskFactory(dataSource);
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/manual-tasks should return 401 without JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/manual-tasks',
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /api/manual-tasks should create task with title and description', async () => {
    const session = await createLoginSession();
    const payload = {
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/manual-tasks',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      id: string;
      title: string;
      description: string | null;
      workflowState: string;
      latestDraftExecutionId: string | null;
      latestExecutionId: string | null;
    }>();

    expect(body.title).toBe(payload.title.trim());
    expect(body.description).toBe(payload.description.trim());
    expect(body.workflowState).toBe('inbox');
    expect(body.latestDraftExecutionId).toBeNull();
    expect(body.latestExecutionId).toBeNull();

    const storedTask = await dataSource.getRepository(ManualTask).findOneBy({
      id: body.id,
      userId: session.userId,
    });
    expect(storedTask).not.toBeNull();
  });

  it('POST /api/manual-tasks should allow description null', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'POST',
      url: '/api/manual-tasks',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        title: faker.lorem.sentence(),
        description: null,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ description: string | null }>().description).toBe(
      null,
    );
  });

  it('POST /api/manual-tasks should return 400 for invalid title', async () => {
    const session = await createLoginSession();

    const emptyTitleResponse = await app.inject({
      method: 'POST',
      url: '/api/manual-tasks',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        title: '',
      },
    });
    expect(emptyTitleResponse.statusCode).toBe(400);

    const tooLongTitleResponse = await app.inject({
      method: 'POST',
      url: '/api/manual-tasks',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        title: 'a'.repeat(4001),
      },
    });
    expect(tooLongTitleResponse.statusCode).toBe(400);
  });

  it('GET /api/manual-tasks should return only user tasks in createdAt DESC order', async () => {
    const ownerSession = await createLoginSession();
    const foreignSession = await createLoginSession();

    const olderTask = await manualTaskFactory.create({
      userId: ownerSession.userId,
      title: 'Older task',
    });
    const newerTask = await manualTaskFactory.create({
      userId: ownerSession.userId,
      title: 'Newer task',
    });
    await manualTaskFactory.create({
      userId: foreignSession.userId,
      title: 'Foreign task',
    });

    const olderDate = new Date(Date.now() - 60_000);
    const newerDate = new Date(Date.now() - 1_000);
    await dataSource
      .getRepository(ManualTask)
      .update({ id: olderTask.id }, { createdAt: olderDate });
    await dataSource
      .getRepository(ManualTask)
      .update({ id: newerTask.id }, { createdAt: newerDate });

    const response = await app.inject({
      method: 'GET',
      url: '/api/manual-tasks',
      headers: { authorization: `Bearer ${ownerSession.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body =
      response.json<
        Array<{ id: string; title: string; workflowState: string }>
      >();

    expect(body.map((item) => item.id)).toEqual([newerTask.id, olderTask.id]);
    expect(body.some((item) => item.title === 'Foreign task')).toBe(false);
    expect(body.every((item) => item.workflowState === 'inbox')).toBe(true);
  });

  it('PATCH /api/manual-tasks/:id should update title', async () => {
    const session = await createLoginSession();
    const task = await manualTaskFactory.create({
      userId: session.userId,
      title: 'Initial title',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/manual-tasks/${task.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        title: 'Updated title',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ title: string }>().title).toBe('Updated title');
  });

  it('PATCH /api/manual-tasks/:id should allow setting description to null', async () => {
    const session = await createLoginSession();
    const task = await manualTaskFactory.create({
      userId: session.userId,
      description: 'Has description',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/manual-tasks/${task.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        description: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ description: string | null }>().description).toBe(
      null,
    );
  });

  it('PATCH /api/manual-tasks/:id should return 400 for empty payload', async () => {
    const session = await createLoginSession();
    const task = await manualTaskFactory.create({
      userId: session.userId,
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/manual-tasks/${task.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('PATCH /api/manual-tasks/:id should return 404 for foreign task', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();
    const task = await manualTaskFactory.create({
      userId: ownerSession.userId,
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/manual-tasks/${task.id}`,
      headers: { authorization: `Bearer ${attackerSession.accessToken}` },
      payload: {
        title: 'Should not update',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('DELETE /api/manual-tasks/:id should delete owned task', async () => {
    const session = await createLoginSession();
    const task = await manualTaskFactory.create({
      userId: session.userId,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/manual-tasks/${task.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(204);

    const deletedTask = await dataSource.getRepository(ManualTask).findOneBy({
      id: task.id,
      userId: session.userId,
    });
    expect(deletedTask).toBeNull();
  });

  it('DELETE /api/manual-tasks/:id should return 404 for foreign task', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();
    const task = await manualTaskFactory.create({
      userId: ownerSession.userId,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/manual-tasks/${task.id}`,
      headers: { authorization: `Bearer ${attackerSession.accessToken}` },
    });

    expect(response.statusCode).toBe(404);
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

    return {
      accessToken: loginResponse.json<{ accessToken: string }>().accessToken,
      userId: user.id,
    };
  };
});
