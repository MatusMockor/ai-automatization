export type CreatePullRequestInput = {
  fullName: string;
  head: string;
  base: string;
  title: string;
  body: string;
  accessToken: string;
};

export type CreatedPullRequest = {
  number: number;
  url: string;
  title: string;
};

export interface GithubPullRequestsGateway {
  createPullRequest(input: CreatePullRequestInput): Promise<CreatedPullRequest>;
}
