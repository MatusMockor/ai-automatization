import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  private static readonly REQUEST_TIMEOUT_MS = 10000;
  private readonly githubApiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.githubApiBaseUrl = this.normalizeGithubApiBaseUrl(
      this.configService.get<string>('GITHUB_API_BASE_URL'),
    );
  }

  async getRepository(
    fullName: string,
    accessToken: string,
  ): Promise<GithubRepositoryMetadata> {
    const encodedFullName = fullName
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GithubApiRepositoriesGateway.REQUEST_TIMEOUT_MS,
    );
    try {
      response = await fetch(
        `${this.githubApiBaseUrl}/repos/${encodedFullName}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'ai-automation-backend',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GithubGatewayError('Request to GitHub timed out');
      }
      throw new GithubGatewayError('Unable to reach GitHub API');
    } finally {
      clearTimeout(timeout);
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

    let body: GithubRepositoryResponse;
    try {
      body = (await response.json()) as GithubRepositoryResponse;
    } catch (error) {
      const details =
        error instanceof Error ? `: ${error.message}` : ' for unknown reason';
      throw new GithubGatewayError(
        `GitHub API returned invalid JSON${details}`,
      );
    }

    if (!body.full_name || !body.clone_url || !body.default_branch) {
      throw new GithubGatewayError('GitHub API returned an invalid repository');
    }

    return {
      fullName: body.full_name.toLowerCase(),
      cloneUrl: body.clone_url,
      defaultBranch: body.default_branch,
    };
  }

  private normalizeGithubApiBaseUrl(value: string | undefined): string {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
      return 'https://api.github.com';
    }

    return trimmedValue.replace(/\/+$/, '');
  }
}
