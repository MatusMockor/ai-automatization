import { Injectable } from '@nestjs/common';
import { GithubPullRequestError } from '../errors/execution-publication.errors';
import type {
  CreatePullRequestInput,
  CreatedPullRequest,
  GithubPullRequestsGateway,
} from '../interfaces/github-pull-requests-gateway.interface';

type CreatePullRequestResponse = {
  number?: number;
  html_url?: string;
  title?: string;
};

@Injectable()
export class GithubApiPullRequestsGateway implements GithubPullRequestsGateway {
  private static readonly REQUEST_TIMEOUT_MS = 10000;

  async createPullRequest(
    input: CreatePullRequestInput,
  ): Promise<CreatedPullRequest> {
    const encodedFullName = input.fullName
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GithubApiPullRequestsGateway.REQUEST_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(
        `https://api.github.com/repos/${encodedFullName}/pulls`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'ai-automation-backend',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            title: input.title,
            body: input.body,
            head: input.head,
            base: input.base,
            draft: false,
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GithubPullRequestError(
          'GitHub pull request request timed out',
        );
      }

      throw new GithubPullRequestError('Unable to reach GitHub API');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 || response.status === 403) {
      throw new GithubPullRequestError(
        'GitHub token is invalid or lacks pull request permissions',
        response.status,
      );
    }

    if (response.status === 404) {
      throw new GithubPullRequestError(
        'GitHub repository not found for pull request creation',
        response.status,
      );
    }

    if (!response.ok) {
      const responseText = await this.tryReadResponseText(response);
      throw new GithubPullRequestError(
        `GitHub pull request request failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
        response.status,
      );
    }

    let body: CreatePullRequestResponse;
    try {
      body = (await response.json()) as CreatePullRequestResponse;
    } catch {
      throw new GithubPullRequestError(
        'GitHub API returned invalid pull request payload',
      );
    }

    if (!body.number || !body.html_url || !body.title) {
      throw new GithubPullRequestError(
        'GitHub API returned incomplete pull request response',
      );
    }

    return {
      number: body.number,
      url: body.html_url,
      title: body.title,
    };
  }

  private async tryReadResponseText(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.trim().slice(0, 500);
    } catch {
      return '';
    }
  }
}
