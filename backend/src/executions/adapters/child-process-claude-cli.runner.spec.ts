import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { ChildProcessClaudeCliRunner } from './child-process-claude-cli.runner';

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawn: jest.fn(),
  };
});

type FakeChildProcess = ChildProcessWithoutNullStreams & EventEmitter;

const createFakeChildProcess = (): {
  process: FakeChildProcess;
  stdinEnd: jest.Mock;
} => {
  const process = new EventEmitter() as FakeChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdinEnd = jest.fn();

  Object.assign(process, {
    pid: 1234,
    stdout,
    stderr,
    stdin: {
      destroyed: false,
      writableEnded: false,
      end: stdinEnd,
    },
    kill: jest.fn(),
  });

  return { process, stdinEnd };
};

describe('ChildProcessClaudeCliRunner', () => {
  const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EXECUTION_CLAUDE_MODEL;
    delete process.env.EXECUTION_CLAUDE_PERMISSION_MODE;
    delete process.env.EXECUTION_CLAUDE_ALLOWED_TOOLS;
  });

  it('should close stdin after spawn and include plan permission mode for plan action', async () => {
    const runner = new ChildProcessClaudeCliRunner();
    const fake = createFakeChildProcess();
    spawnMock.mockReturnValue(fake.process);
    process.env.TEST_EXECUTION_SECRET = 'super-secret-value';
    process.env.EXECUTION_CLAUDE_MODEL = '';

    try {
      const startedProcessPromise = runner.start({
        prompt: 'Create a plan',
        action: 'plan',
        cwd: '/tmp/repo',
        anthropicAuthToken: 'test-token',
      });

      fake.process.emit('spawn');
      const startedProcess = await startedProcessPromise;

      expect(startedProcess.pid).toBe(1234);
      expect(fake.stdinEnd).toHaveBeenCalledTimes(1);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(spawnMock.mock.calls[0]?.[0]).toBe('claude');
      expect(spawnMock.mock.calls[0]?.[1]).toEqual(
        expect.arrayContaining([
          '--model',
          '--allowedTools',
          'Bash,Read,Edit,Write,Glob,Grep',
          '--permission-mode',
          'plan',
        ]),
      );
      const modelArgIndex = spawnMock.mock.calls[0]?.[1].indexOf('--model');
      expect(modelArgIndex).toBeGreaterThanOrEqual(0);
      expect(
        spawnMock.mock.calls[0]?.[1][(modelArgIndex ?? 0) + 1],
      ).toBeTruthy();
      expect(spawnMock.mock.calls[0]?.[2]?.env).toEqual(
        expect.objectContaining({
          CLAUDE_CODE_OAUTH_TOKEN: 'test-token',
        }),
      );
      expect(spawnMock.mock.calls[0]?.[2]?.env?.ANTHROPIC_AUTH_TOKEN).toBe(
        undefined,
      );
      expect(spawnMock.mock.calls[0]?.[2]?.env?.ANTHROPIC_API_KEY).toBe(
        undefined,
      );
      expect(spawnMock.mock.calls[0]?.[2]?.env?.TEST_EXECUTION_SECRET).toBe(
        undefined,
      );
    } finally {
      delete process.env.TEST_EXECUTION_SECRET;
      delete process.env.EXECUTION_CLAUDE_MODEL;
    }
  });

  it('should include implementation permission mode for feature action and allow env overrides', async () => {
    const runner = new ChildProcessClaudeCliRunner();
    const fake = createFakeChildProcess();
    spawnMock.mockReturnValue(fake.process);
    process.env.EXECUTION_CLAUDE_MODEL = 'claude-opus-4-6-custom';
    process.env.EXECUTION_CLAUDE_PERMISSION_MODE = 'override-permission';
    process.env.EXECUTION_CLAUDE_ALLOWED_TOOLS = 'Read,Edit,Write';

    const startedProcessPromise = runner.start({
      prompt: 'Implement a fix',
      action: 'feature',
      cwd: '/tmp/repo',
      anthropicAuthToken: 'test-token',
    });

    fake.process.emit('spawn');
    await startedProcessPromise;

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        '--model',
        'claude-opus-4-6-custom',
        '--allowedTools',
        'Read,Edit,Write',
        '--permission-mode',
        'override-permission',
      ]),
    );
    expect(spawnMock.mock.calls[0]?.[1]).not.toEqual(
      expect.arrayContaining(['--permission-mode', 'plan']),
    );
  });

  it('should reject start when spawn emits error', async () => {
    const runner = new ChildProcessClaudeCliRunner();
    const fake = createFakeChildProcess();
    spawnMock.mockReturnValue(fake.process);

    const startedProcessPromise = runner.start({
      prompt: 'Create a plan',
      action: 'plan',
      cwd: '/tmp/repo',
      anthropicAuthToken: 'test-token',
    });

    fake.process.emit('error', new Error('spawn failed'));

    await expect(startedProcessPromise).rejects.toThrow('spawn failed');
    expect(fake.stdinEnd).not.toHaveBeenCalled();
  });
});
