import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { CliGitClient } from './adapters/cli-git.client';
import { GithubApiRepositoriesGateway } from './adapters/github-api-repositories.gateway';
import {
  GIT_CLIENT,
  GITHUB_REPOSITORIES_GATEWAY,
} from './constants/repositories.tokens';
import { ManagedRepository } from './entities/repository.entity';
import { RepositoriesController } from './repositories.controller';
import { RepositoryPathService } from './repository-path.service';
import { RepositoriesService } from './repositories.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManagedRepository]), SettingsModule],
  controllers: [RepositoriesController],
  providers: [
    RepositoriesService,
    RepositoryPathService,
    {
      provide: GITHUB_REPOSITORIES_GATEWAY,
      useClass: GithubApiRepositoriesGateway,
    },
    {
      provide: GIT_CLIENT,
      useClass: CliGitClient,
    },
  ],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
