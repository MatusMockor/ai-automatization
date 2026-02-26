import { faker } from '@faker-js/faker';
import { execFile } from 'child_process';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { DataSource } from 'typeorm';
import { ManagedRepository } from '../../src/repositories/entities/repository.entity';

const execFileAsync = promisify(execFile);
const TEST_GIT_USER_EMAIL = 'test@example.com';
const TEST_GIT_USER_NAME = 'Test User';

type CreateRepositoryInput = {
  userId: string;
  fullName?: string;
  cloneUrl?: string;
  defaultBranch?: string;
  localPath?: string;
  isCloned?: boolean;
};

type RemoteRepository = {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  remotePath: string;
};

type ExecFileError = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
};

export class RepositoryFactory {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repositoriesBasePath: string,
  ) {}

  async resetWorkspace(): Promise<void> {
    await rm(this.repositoriesBasePath, { recursive: true, force: true });
    await mkdir(this.repositoriesBasePath, { recursive: true });
    await mkdir(this.getRemotesRoot(), { recursive: true });
    await mkdir(this.getWorkingRoot(), { recursive: true });
  }

  async create(input: CreateRepositoryInput): Promise<ManagedRepository> {
    const fullName = input.fullName ?? this.generateFullName();
    const localPath =
      input.localPath ?? this.buildLocalPath(input.userId, fullName);

    const repository = this.dataSource.getRepository(ManagedRepository).create({
      userId: input.userId,
      fullName,
      cloneUrl: input.cloneUrl ?? this.buildDefaultCloneUrl(fullName),
      defaultBranch: input.defaultBranch ?? 'main',
      localPath,
      isCloned: input.isCloned ?? true,
    });

    return this.dataSource.getRepository(ManagedRepository).save(repository);
  }

  async createRemoteRepository(fullName?: string): Promise<RemoteRepository> {
    const normalizedFullName = (
      fullName ?? this.generateFullName()
    ).toLowerCase();
    const [owner, repositoryName] = normalizedFullName.split('/');
    const fixtureName = `${owner}__${repositoryName}`;

    const remotePath = join(this.getRemotesRoot(), `${fixtureName}.git`);
    const seedPath = join(
      this.getWorkingRoot(),
      `${fixtureName}-seed-${Date.now()}-${faker.string.alphanumeric(6).toLowerCase()}`,
    );

    await mkdir(seedPath, { recursive: true });
    await this.runGit(['init', '--bare', remotePath]);
    await this.runGit(['init', '-b', 'main'], seedPath);
    await writeFile(
      join(seedPath, 'README.md'),
      `# ${normalizedFullName}\n`,
      'utf8',
    );
    await this.runGit(['add', '.'], seedPath);
    await this.runGitCommit(seedPath, 'Initial commit');
    await this.runGit(['remote', 'add', 'origin', remotePath], seedPath);
    await this.runGit(['push', '-u', 'origin', 'main'], seedPath);
    await this.runGit([
      '--git-dir',
      remotePath,
      'symbolic-ref',
      'HEAD',
      'refs/heads/main',
    ]);
    await rm(seedPath, { recursive: true, force: true });

    return {
      fullName: normalizedFullName,
      cloneUrl: remotePath,
      defaultBranch: 'main',
      remotePath,
    };
  }

  async addCommitToRemote(
    remotePath: string,
    defaultBranch = 'main',
  ): Promise<string> {
    const updateFolderName = `update-${Date.now()}-${faker.string.alphanumeric(6).toLowerCase()}`;
    const updatePath = join(this.getWorkingRoot(), updateFolderName);

    await this.runGit([
      'clone',
      '--branch',
      defaultBranch,
      '--single-branch',
      remotePath,
      updatePath,
    ]);

    const fileName = `update-${faker.string.alphanumeric(8).toLowerCase()}.txt`;
    await writeFile(join(updatePath, fileName), faker.lorem.sentence(), 'utf8');
    await this.runGit(['add', '.'], updatePath);
    await this.runGitCommit(updatePath, 'Update remote repository');
    await this.runGit(
      ['push', 'origin', `HEAD:refs/heads/${defaultBranch}`],
      updatePath,
    );
    await rm(updatePath, { recursive: true, force: true });

    return fileName;
  }

  buildLocalPath(userId: string, fullName: string): string {
    const segments = fullName.split('/');
    if (
      segments.length !== 2 ||
      segments[0]?.trim().length === 0 ||
      segments[1]?.trim().length === 0
    ) {
      throw new Error('Invalid repository fullName');
    }

    const [owner, repositoryName] = segments;
    const safeOwner = this.sanitizeSegment(owner);
    const safeRepositoryName = this.sanitizeSegment(repositoryName);
    if (safeOwner.length === 0 || safeRepositoryName.length === 0) {
      throw new Error('Invalid repository fullName');
    }

    return join(
      this.repositoriesBasePath,
      userId,
      `${safeOwner}__${safeRepositoryName}`,
    );
  }

  private buildDefaultCloneUrl(fullName: string): string {
    return `https://github.com/${fullName}.git`;
  }

  private generateFullName(): string {
    const owner = faker.internet
      .userName()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    const repositoryName = faker.word
      .sample()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    return `${owner || 'owner'}-${faker.string.alphanumeric(4).toLowerCase()}/${repositoryName || 'repo'}-${faker.string.alphanumeric(4).toLowerCase()}`;
  }

  private async runGit(args: string[], cwd?: string): Promise<void> {
    try {
      await execFileAsync('git', args, {
        cwd,
        timeout: 20000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
    } catch (error) {
      const execError = error as ExecFileError;
      const output = [execError.stdout, execError.stderr]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .join('\n');

      throw new Error(
        `git ${args.join(' ')} failed${output ? `\n${output}` : ''}`,
      );
    }
  }

  private sanitizeSegment(value: string | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async runGitCommit(cwd: string, message: string): Promise<void> {
    await this.runGit(
      [
        '-c',
        `user.email=${TEST_GIT_USER_EMAIL}`,
        '-c',
        `user.name=${TEST_GIT_USER_NAME}`,
        'commit',
        '-m',
        message,
      ],
      cwd,
    );
  }

  private getRemotesRoot(): string {
    return join(this.repositoriesBasePath, '__fixtures', 'remotes');
  }

  private getWorkingRoot(): string {
    return join(this.repositoriesBasePath, '__fixtures', 'work');
  }
}
