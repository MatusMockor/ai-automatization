import { Injectable } from '@nestjs/common';
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
      const childProcess = spawn('claude', args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: options.anthropicApiKey,
          GIT_TERMINAL_PROMPT: '0',
        },
        stdio: 'pipe',
      });

      function handleSpawn(): void {
        childProcess.removeListener('error', handleError);
        const processWrapper = new ChildProcessClaudeCliProcess(childProcess);
        processWrapper.onError(() => {
          // Keep child-process errors observed after spawn to avoid unhandled emitter errors.
        });
        resolve(processWrapper);
      }

      function handleError(error: Error): void {
        childProcess.removeListener('spawn', handleSpawn);
        reject(error);
      }

      childProcess.once('error', handleError);
      childProcess.once('spawn', handleSpawn);
    });
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
