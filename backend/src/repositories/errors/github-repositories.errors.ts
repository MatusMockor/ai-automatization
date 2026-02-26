export class GithubAuthorizationError extends Error {
  constructor(message = 'GitHub authorization failed') {
    super(message);
    this.name = 'GithubAuthorizationError';
  }
}

export class GithubRepositoryNotFoundError extends Error {
  constructor(message = 'GitHub repository not found') {
    super(message);
    this.name = 'GithubRepositoryNotFoundError';
  }
}

export class GithubGatewayError extends Error {
  constructor(
    message = 'GitHub API request failed',
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GithubGatewayError';
  }
}
