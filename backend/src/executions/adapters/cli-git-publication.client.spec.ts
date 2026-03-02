import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { ExecutionPublicationError } from '../errors/execution-publication.errors';
import { CliGitPublicationClient } from './cli-git-publication.client';

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawn: jest.fn(),
  };
});

type FakeChildProcess = ChildProcessWithoutNullStreams & EventEmitter;

const createFakeChildProcess = (
  output: { stdout?: string; stderr?: string; code?: number | null } = {},
): FakeChildProcess => {
  const process = new EventEmitter() as FakeChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  Object.assign(process, {
    stdout,
    stderr,
    stdin: new EventEmitter(),
    kill: jest.fn(),
    exitCode: null,
    signalCode: null,
  });

  setImmediate(() => {
    if (output.stdout) {
      stdout.emit('data', Buffer.from(output.stdout, 'utf8'));
    }

    if (output.stderr) {
      stderr.emit('data', Buffer.from(output.stderr, 'utf8'));
    }

    process.emit('close', output.code ?? 0);
  });

  return process;
};

describe('CliGitPublicationClient', () => {
  const spawnMock = spawn as jest.MockedFunction<typeof spawn>;
  const cloneUrl = 'https://github.com/MatusMockor/termio.git';
  const accessToken = 'ghp_testToken123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use Basic auth extraheader for branchExistsRemote', async () => {
    spawnMock.mockReturnValue(
      createFakeChildProcess({ stdout: 'refs/heads/main\n' }),
    );
    const client = new CliGitPublicationClient(new ConfigService({}));

    const exists = await client.branchExistsRemote(
      '/tmp/repo',
      'feature/test',
      cloneUrl,
      accessToken,
    );

    expect(exists).toBe(true);
    const gitArgs = spawnMock.mock.calls[0]?.[1] as string[];
    expect(gitArgs).toEqual(
      expect.arrayContaining(['ls-remote', '--heads', 'origin']),
    );

    const headerArg = gitArgs.find((arg) =>
      arg.startsWith(
        'http.https://github.com/.extraheader=Authorization: Basic ',
      ),
    );
    expect(headerArg).toBeDefined();

    const encoded = headerArg?.split('Authorization: Basic ')[1] ?? '';
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(
      `x-access-token:${accessToken}`,
    );
  });

  it('should use Basic auth extraheader for push', async () => {
    spawnMock.mockReturnValue(createFakeChildProcess());
    const client = new CliGitPublicationClient(new ConfigService({}));

    await client.push({
      localPath: '/tmp/repo',
      branchName: 'feature/test',
      cloneUrl,
      accessToken,
    });

    const gitArgs = spawnMock.mock.calls[0]?.[1] as string[];
    expect(gitArgs).toEqual(
      expect.arrayContaining([
        'push',
        '-u',
        'origin',
        'HEAD:refs/heads/feature/test',
      ]),
    );

    const headerArg = gitArgs.find((arg) =>
      arg.startsWith(
        'http.https://github.com/.extraheader=Authorization: Basic ',
      ),
    );
    expect(headerArg).toBeDefined();

    const encoded = headerArg?.split('Authorization: Basic ')[1] ?? '';
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(
      `x-access-token:${accessToken}`,
    );
  });

  it('should throw descriptive error for invalid clone URL', async () => {
    const client = new CliGitPublicationClient(new ConfigService({}));

    await expect(
      client.branchExistsRemote(
        '/tmp/repo',
        'feature/test',
        'not-a-valid-url',
        accessToken,
      ),
    ).rejects.toThrow(ExecutionPublicationError);

    await expect(
      client.branchExistsRemote(
        '/tmp/repo',
        'feature/test',
        'not-a-valid-url',
        accessToken,
      ),
    ).rejects.toThrow(
      'Invalid clone URL format for authenticated git operation',
    );

    expect(spawnMock).not.toHaveBeenCalled();
  });
});
