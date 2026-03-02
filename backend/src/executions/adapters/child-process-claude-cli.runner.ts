import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams, execFile } from 'child_process';
import { promisify } from 'util';
import type {
  ClaudeCliProcess,
  ClaudeCliRunner,
  ClaudeCliStartOptions,
} from '../interfaces/claude-cli-runner.interface';

const execFileAsync = promisify(execFile);

class ChildProcessClaudeCliProcess implements ClaudeCliProcess {
  constructor(private readonly process: ChildProcessWithoutNullStreams) {}

  get pid(): number | null {
    return this.process.pid ?? null;
  }

  onStdout(listener: (chunk: string) => void): void {
    this.process.stdout.on('data', (chunk: Buffer | string) =>
      listener(chunk.toString()),
    );
  }

  onStderr(listener: (chunk: string) => void): void {
    this.process.stderr.on('data', (chunk: Buffer | string) =>
      listener(chunk.toString()),
    );
  }

  onError(listener: (error: Error) => void): void {
    this.process.on('error', listener);
  }

  onExit(
    listener: (info: {
      code: number | null;
      signal: NodeJS.Signals | null;
    }) => void,
  ): void {
    this.process.on('exit', (code, signal) => {
      listener({ code, signal });
    });
  }

  kill(signal: NodeJS.Signals): void {
    this.process.kill(signal);
  }
}

@Injectable()
export class ChildProcessClaudeCliRunner implements ClaudeCliRunner {
  private readonly logger = new Logger(ChildProcessClaudeCliRunner.name);

  async ensureAvailable(): Promise<void> {
    await execFileAsync('claude', ['--version'], {
      timeout: 5000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
  }

  async start(options: ClaudeCliStartOptions): Promise<ClaudeCliProcess> {
    const args = this.buildArgs(options.action, options.prompt);
    return new Promise<ClaudeCliProcess>((resolve, reject) => {
      const {
        ANTHROPIC_API_KEY: _ignoredAnthropicApiKey,
        ANTHROPIC_AUTH_TOKEN: _ignoredAnthropicAuthToken,
        CLAUDE_CODE_OAUTH_TOKEN: _ignoredClaudeOauthToken,
        ...baseEnv
      } = process.env;

      const childProcess = spawn('claude', args, {
        cwd: options.cwd,
        env: {
          ...baseEnv,
          CLAUDE_CODE_OAUTH_TOKEN: options.anthropicAuthToken,
          GIT_TERMINAL_PROMPT: '0',
        },
        stdio: 'pipe',
      });

      let settled = false;

      const settleResolve = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        this.closeProcessStdin(childProcess);

        const processWrapper = new ChildProcessClaudeCliProcess(childProcess);
        processWrapper.onError(() => {
          // Keep child-process errors observed after spawn to avoid unhandled emitter errors.
        });
        resolve(processWrapper);
      };

      const settleReject = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      const cleanup = (): void => {
        childProcess.removeListener('error', handleError);
        childProcess.removeListener('spawn', handleSpawn);
      };

      function handleSpawn(): void {
        settleResolve();
      }

      function handleError(error: Error): void {
        settleReject(error);
      }

      childProcess.once('error', handleError);
      childProcess.once('spawn', handleSpawn);
    });
  }

  private closeProcessStdin(process: ChildProcessWithoutNullStreams): void {
    if (process.stdin.destroyed || process.stdin.writableEnded) {
      return;
    }

    try {
      process.stdin.end();
    } catch (error) {
      this.logger.warn(
        `Failed to close Claude process stdin: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildArgs(
    action: ClaudeCliStartOptions['action'],
    prompt: string,
  ): string[] {
    const args = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--allowedTools',
      'Bash,Read,Edit,Glob,Grep',
    ];

    if (action === 'plan') {
      args.push('--permission-mode', 'plan');
    }

    return args;
  }
}
