export class ExecutionPublicationError extends Error {
  constructor(
    message: string,
    readonly causeDetails?: string,
  ) {
    super(message);
    this.name = 'ExecutionPublicationError';
  }
}

export class GithubPullRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GithubPullRequestError';
  }
}
