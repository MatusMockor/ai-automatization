import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { access, rm } from 'fs/promises';
import { QueryFailedError, Repository } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import {
  GIT_CLIENT,
  GITHUB_REPOSITORIES_GATEWAY,
} from './constants/repositories.tokens';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { RepositoryResponseDto } from './dto/repository-response.dto';
import { ManagedRepository } from './entities/repository.entity';
import {
  GithubAuthorizationError,
  GithubGatewayError,
  GithubRepositoryNotFoundError,
} from './errors/github-repositories.errors';
import { GitClientError } from './errors/git-client.error';
import type {
  GithubRepositoriesGateway,
  GithubRepositoryMetadata,
} from './interfaces/github-repositories-gateway.interface';
import type { GitClient } from './interfaces/git-client.interface';
import { RepositoryPathService } from './repository-path.service';

type DatabaseError = {
  code?: string;
  message?: string;
  driverError?: {
    code?: string;
    errno?: number;
    message?: string;
  };
};

@Injectable()
export class RepositoriesService {
  constructor(
    @InjectRepository(ManagedRepository)
    private readonly repositoriesRepository: Repository<ManagedRepository>,
    private readonly settingsService: SettingsService,
    private readonly repositoryPathService: RepositoryPathService,
    @Inject(GITHUB_REPOSITORIES_GATEWAY)
    private readonly githubRepositoriesGateway: GithubRepositoriesGateway,
    @Inject(GIT_CLIENT)
    private readonly gitClient: GitClient,
  ) {}

  async listForUser(userId: string): Promise<RepositoryResponseDto[]> {
    const repositories = await this.repositoriesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return repositories.map((repository) => this.mapToResponse(repository));
  }

  async createForUser(
    userId: string,
    dto: CreateRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    const githubToken =
      await this.settingsService.getGithubTokenForUserOrNull(userId);
    if (!githubToken) {
      throw new BadRequestException(
        'GitHub token is not configured in user settings',
      );
    }

    const repositoryMetadata = await this.fetchRepositoryMetadata(
      dto.fullName,
      githubToken,
    );
    const localPath = this.repositoryPathService.buildLocalPath(
      userId,
      repositoryMetadata.fullName,
    );

    await this.assertPathDoesNotExist(localPath);
    await this.repositoryPathService.ensureParentDirectory(localPath);

    await this.cloneRepository(repositoryMetadata.cloneUrl, localPath);

    const repository = this.repositoriesRepository.create({
      userId,
      fullName: repositoryMetadata.fullName,
      cloneUrl: repositoryMetadata.cloneUrl,
      defaultBranch: repositoryMetadata.defaultBranch,
      localPath,
      isCloned: true,
    });

    try {
      const savedRepository =
        await this.repositoriesRepository.save(repository);
      return this.mapToResponse(savedRepository);
    } catch (error) {
      await this.removeLocalPathQuietly(localPath);

      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Repository already exists for this user');
      }

      throw error;
    }
  }

  async deleteForUser(userId: string, repositoryId: string): Promise<void> {
    const repository = await this.getOwnedRepository(repositoryId, userId);

    try {
      const deleteResult = await this.repositoriesRepository.delete({
        id: repository.id,
      });
      if ((deleteResult.affected ?? 0) === 0) {
        throw new InternalServerErrorException(
          'Failed to delete repository record',
        );
      }
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to delete repository record',
      );
    }

    try {
      await rm(repository.localPath, { recursive: true, force: true });
    } catch {
      throw new InternalServerErrorException(
        'Repository record deleted, but local repository directory cleanup failed',
      );
    }
  }

  async syncForUser(
    userId: string,
    repositoryId: string,
  ): Promise<RepositoryResponseDto> {
    const repository = await this.getOwnedRepository(repositoryId, userId);

    const isGitRepository = await this.gitClient.isGitRepository(
      repository.localPath,
    );
    if (!isGitRepository) {
      throw new InternalServerErrorException(
        'Local repository clone is missing or invalid',
      );
    }

    const isCleanWorkingTree = await this.gitClient.isWorkingTreeClean(
      repository.localPath,
    );
    if (!isCleanWorkingTree) {
      throw new ConflictException(
        'Repository has uncommitted local changes and cannot be synced',
      );
    }

    try {
      await this.gitClient.pull(repository.localPath, repository.defaultBranch);
    } catch (error) {
      if (error instanceof GitClientError) {
        throw new InternalServerErrorException(
          'Failed to sync repository with remote',
        );
      }

      throw error;
    }

    const updatedRepository =
      await this.repositoriesRepository.save(repository);
    return this.mapToResponse(updatedRepository);
  }

  async assertOwnedRepository(
    userId: string,
    repositoryId: string,
  ): Promise<void> {
    await this.getOwnedRepository(repositoryId, userId);
  }

  async getOwnedRepositoryForUser(
    userId: string,
    repositoryId: string,
  ): Promise<ManagedRepository> {
    return this.getOwnedRepository(repositoryId, userId);
  }

  private async getOwnedRepository(
    repositoryId: string,
    userId: string,
  ): Promise<ManagedRepository> {
    const repository = await this.repositoriesRepository.findOneBy({
      id: repositoryId,
      userId,
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    return repository;
  }

  private async fetchRepositoryMetadata(
    fullName: string,
    githubToken: string,
  ): Promise<GithubRepositoryMetadata> {
    try {
      return await this.githubRepositoriesGateway.getRepository(
        fullName,
        githubToken,
      );
    } catch (error) {
      if (error instanceof GithubAuthorizationError) {
        throw new BadRequestException(
          'GitHub token is invalid or lacks repository access',
        );
      }

      if (error instanceof GithubRepositoryNotFoundError) {
        throw new NotFoundException('GitHub repository not found');
      }

      if (error instanceof GithubGatewayError) {
        throw new InternalServerErrorException(
          'Unable to validate repository against GitHub',
        );
      }

      throw error;
    }
  }

  private async assertPathDoesNotExist(localPath: string): Promise<void> {
    try {
      await access(localPath);
      throw new ConflictException(
        'Local repository directory already exists for this repository',
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw new InternalServerErrorException(
          'Failed to validate repository directory',
        );
      }
    }
  }

  private async cloneRepository(
    cloneUrl: string,
    localPath: string,
  ): Promise<void> {
    try {
      await this.gitClient.clone(cloneUrl, localPath);
    } catch (error) {
      if (error instanceof GitClientError) {
        const combinedOutput = `${error.stdout}\n${error.stderr}`.toLowerCase();
        if (
          combinedOutput.includes('already exists') ||
          combinedOutput.includes('not an empty directory')
        ) {
          throw new ConflictException(
            'Local repository directory already exists and cannot be reused',
          );
        }

        throw new InternalServerErrorException('Failed to clone repository');
      }

      throw error;
    }
  }

  private mapToResponse(repository: ManagedRepository): RepositoryResponseDto {
    return {
      id: repository.id,
      fullName: repository.fullName,
      cloneUrl: repository.cloneUrl,
      defaultBranch: repository.defaultBranch,
      isCloned: repository.isCloned,
      createdAt: repository.createdAt,
      updatedAt: repository.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const databaseError = error as DatabaseError;
    const driverCode = databaseError.driverError?.code;
    const driverErrno = databaseError.driverError?.errno;
    const errorMessage = (
      databaseError.driverError?.message ??
      databaseError.message ??
      ''
    ).toLowerCase();

    return (
      databaseError.code === '23505' ||
      driverCode === '23505' ||
      databaseError.code === 'SQLITE_CONSTRAINT' ||
      driverCode === 'SQLITE_CONSTRAINT' ||
      driverErrno === 19 ||
      errorMessage.includes('unique constraint failed')
    );
  }

  private async removeLocalPathQuietly(localPath: string): Promise<void> {
    try {
      await rm(localPath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup only.
    }
  }
}
