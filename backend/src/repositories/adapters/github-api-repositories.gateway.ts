import { Injectable } from '@nestjs/common';
import {
  GithubAuthorizationError,
  GithubGatewayError,
  GithubRepositoryNotFoundError,
} from '../errors/github-repositories.errors';
import {
  GithubRepositoriesGateway,
  GithubRepositoryMetadata,
} from '../interfaces/github-repositories-gateway.interface';

type GithubRepositoryResponse = {
  full_name?: string;
  clone_url?: string;
  default_branch?: string;
};

@Injectable()
export class GithubApiRepositoriesGateway implements GithubRepositoriesGateway {
  async getRepository(
    fullName: string,
    accessToken: string,
  ): Promise<GithubRepositoryMetadata> {
    const encodedFullName = fullName
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    let response: Response;
    try {
      response = await fetch(
        `https://api.github.com/repos/${encodedFullName}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'ai-automation-backend',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    } catch {
      throw new GithubGatewayError('Unable to reach GitHub API');
    }

    if (response.status === 401 || response.status === 403) {
      throw new GithubAuthorizationError(
        'GitHub token is invalid or lacks repository access',
      );
    }

    if (response.status === 404) {
      throw new GithubRepositoryNotFoundError(
        'GitHub repository was not found',
      );
    }

    if (!response.ok) {
      throw new GithubGatewayError(
        `GitHub API request failed with status ${response.status}`,
        response.status,
      );
    }

    const body = (await response.json()) as GithubRepositoryResponse;
    if (!body.full_name || !body.clone_url || !body.default_branch) {
      throw new GithubGatewayError('GitHub API returned an invalid repository');
    }

    return {
      fullName: body.full_name.toLowerCase(),
      cloneUrl: body.clone_url,
      defaultBranch: body.default_branch,
    };
  }
}
