export type GithubRepositoryMetadata = {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
};

export interface GithubRepositoriesGateway {
  getRepository(
    fullName: string,
    accessToken: string,
  ): Promise<GithubRepositoryMetadata>;
}
