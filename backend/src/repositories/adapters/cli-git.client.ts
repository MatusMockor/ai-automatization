import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { GitClientError } from '../errors/git-client.error';
import { GitClient } from '../interfaces/git-client.interface';

const DEFAULT_GIT_TIMEOUT_MS = 120000;

@Injectable()
export class CliGitClient implements GitClient {
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const configuredTimeout = parseInt(
      this.configService.get('GIT_COMMAND_TIMEOUT_MS', '120000'),
      10,
    );

    this.timeoutMs = Number.isNaN(configuredTimeout)
      ? DEFAULT_GIT_TIMEOUT_MS
      : configuredTimeout;
  }

  async clone(cloneUrl: string, localPath: string): Promise<void> {
    await this.runGit(['clone', '--depth', '1', cloneUrl, localPath]);
  }

  async isGitRepository(localPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.runGit(
        ['rev-parse', '--is-inside-work-tree'],
        localPath,
      );
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  async isWorkingTreeClean(localPath: string): Promise<boolean> {
    const { stdout } = await this.runGit(['status', '--porcelain'], localPath);
    return stdout.trim().length === 0;
  }

  async pull(localPath: string, branch: string): Promise<void> {
    await this.runGit(['pull', '--ff-only', 'origin', branch], localPath);
  }

  private runGit(
    args: string[],
    cwd?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const command = `git ${args.join(' ')}`;
      const childProcess = spawn('git', args, {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      let stdout = '';
      let stderr = '';
      let didTimeout = false;

      const timeout = setTimeout(() => {
        didTimeout = true;
        childProcess.kill('SIGTERM');
      }, this.timeoutMs);

      childProcess.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      childProcess.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new GitClientError(error.message, command, stdout, stderr));
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeout);

        if (didTimeout) {
          reject(
            new GitClientError(
              'Git command timed out',
              command,
              stdout,
              stderr,
            ),
          );
          return;
        }

        if (code !== 0) {
          reject(
            new GitClientError(
              `Git command failed with exit code ${code}`,
              command,
              stdout,
              stderr,
            ),
          );
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  }
}
