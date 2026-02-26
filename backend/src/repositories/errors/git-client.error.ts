export class GitClientError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitClientError';
  }
}
