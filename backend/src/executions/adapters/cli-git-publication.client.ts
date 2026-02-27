import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { ExecutionPublicationError } from '../errors/execution-publication.errors';
import type {
  GitCheckCommandResult,
  GitPublicationClient,
  GitPushOptions,
} from '../interfaces/git-publication-client.interface';

const DEFAULT_GIT_TIMEOUT_MS = 120000;
const FORCE_KILL_DELAY_MS = 5000;

@Injectable()
export class CliGitPublicationClient implements GitPublicationClient {
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const configuredTimeout = Number.parseInt(
      this.configService.get<string>('GIT_COMMAND_TIMEOUT_MS', '120000'),
      10,
    );

    this.timeoutMs = Number.isNaN(configuredTimeout)
      ? DEFAULT_GIT_TIMEOUT_MS
      : configuredTimeout;
  }

  async branchExistsRemote(
    localPath: string,
    branchName: string,
    cloneUrl: string,
    accessToken: string,
  ): Promise<boolean> {
    const authConfig = this.buildAuthGitConfigs(cloneUrl, accessToken);
    const result = await this.runGit(
      [
        ...authConfig,
        'ls-remote',
        '--heads',
        'origin',
        `refs/heads/${branchName}`,
      ],
      localPath,
    );

    return result.stdout.trim().length > 0;
  }

  async checkoutNewBranch(
    localPath: string,
    branchName: string,
  ): Promise<void> {
    await this.runGit(['checkout', '-b', branchName], localPath);
  }

  async hasChanges(localPath: string): Promise<boolean> {
    const result = await this.runGit(['status', '--porcelain'], localPath);
    return result.stdout.trim().length > 0;
  }

  async addAll(localPath: string): Promise<void> {
    await this.runGit(['add', '-A'], localPath);
  }

  async commit(
    localPath: string,
    message: string,
    authorName: string,
    authorEmail: string,
  ): Promise<void> {
    await this.runGit(
      [
        '-c',
        `user.name=${authorName}`,
        '-c',
        `user.email=${authorEmail}`,
        'commit',
        '-m',
        message,
      ],
      localPath,
    );
  }

  async getHeadSha(localPath: string): Promise<string> {
    const result = await this.runGit(['rev-parse', 'HEAD'], localPath);
    const sha = result.stdout.trim();
    if (sha.length === 0) {
      throw new ExecutionPublicationError('Unable to resolve commit SHA');
    }

    return sha;
  }

  async push(options: GitPushOptions): Promise<void> {
    const authConfig = this.buildAuthGitConfigs(
      options.cloneUrl,
      options.accessToken,
    );
    await this.runGit(
      [
        ...authConfig,
        'push',
        '-u',
        'origin',
        `HEAD:refs/heads/${options.branchName}`,
      ],
      options.localPath,
    );
  }

  async runCheckCommand(
    localPath: string,
    command: string,
  ): Promise<GitCheckCommandResult> {
    if (command.trim().length === 0) {
      return {
        success: true,
        stdout: '',
        stderr: '',
      };
    }

    const result = await this.runProcess(
      '/bin/sh',
      ['-lc', command],
      localPath,
    );
    return {
      success: result.code === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async checkoutDefaultAndClean(
    localPath: string,
    defaultBranch: string,
    cloneUrl: string,
    accessToken: string,
  ): Promise<void> {
    const authConfig = this.buildAuthGitConfigs(cloneUrl, accessToken);

    await this.runGit(
      [...authConfig, 'fetch', 'origin', defaultBranch],
      localPath,
    );
    await this.runGit(['checkout', defaultBranch], localPath);
    await this.runGit(
      ['reset', '--hard', `origin/${defaultBranch}`],
      localPath,
    );
    await this.runGit(['clean', '-fd'], localPath);
  }

  async deleteLocalBranch(
    localPath: string,
    branchName: string,
  ): Promise<void> {
    await this.runGit(['branch', '-D', branchName], localPath);
  }

  private buildAuthGitConfigs(cloneUrl: string, accessToken: string): string[] {
    try {
      const url = new URL(cloneUrl);
      return [
        '-c',
        `http.https://${url.host}/.extraheader=AUTHORIZATION: Bearer ${accessToken}`,
      ];
    } catch {
      return [];
    }
  }

  private async runGit(
    args: string[],
    cwd: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const result = await this.runProcess('git', args, cwd);
    if (result.code !== 0) {
      throw new ExecutionPublicationError(
        `Git command failed with exit code ${result.code}`,
        this.formatOutput(result.stdout, result.stderr),
      );
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private runProcess(
    command: string,
    args: string[],
    cwd: string,
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      let stdout = '';
      let stderr = '';
      let didTimeout = false;
      let forceKillTimeout: NodeJS.Timeout | undefined;

      const timeout = setTimeout(() => {
        didTimeout = true;
        childProcess.kill('SIGTERM');

        forceKillTimeout = setTimeout(() => {
          if (
            childProcess.exitCode === null &&
            childProcess.signalCode === null
          ) {
            childProcess.kill('SIGKILL');
          }
        }, FORCE_KILL_DELAY_MS);
      }, this.timeoutMs);

      const clearTimers = () => {
        clearTimeout(timeout);
        if (forceKillTimeout) {
          clearTimeout(forceKillTimeout);
        }
      };

      childProcess.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      childProcess.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      childProcess.on('error', (error) => {
        clearTimers();
        reject(
          new ExecutionPublicationError(
            error.message,
            this.formatOutput(stdout, stderr),
          ),
        );
      });

      childProcess.on('close', (code) => {
        clearTimers();

        if (didTimeout) {
          reject(
            new ExecutionPublicationError(
              'Publication command timed out',
              this.formatOutput(stdout, stderr),
            ),
          );
          return;
        }

        resolve({
          stdout,
          stderr,
          code,
        });
      });
    });
  }

  private formatOutput(stdout: string, stderr: string): string {
    const trimmedOutput = [stdout, stderr]
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)
      .join('\n');

    return trimmedOutput.slice(0, 4000);
  }
}
