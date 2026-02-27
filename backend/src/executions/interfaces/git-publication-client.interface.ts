export type GitPushOptions = {
  localPath: string;
  branchName: string;
  cloneUrl: string;
  accessToken: string;
};

export type GitCheckCommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

export interface GitPublicationClient {
  branchExistsRemote(
    localPath: string,
    branchName: string,
    cloneUrl: string,
    accessToken: string,
  ): Promise<boolean>;
  checkoutNewBranch(localPath: string, branchName: string): Promise<void>;
  hasChanges(localPath: string): Promise<boolean>;
  addAll(localPath: string): Promise<void>;
  commit(
    localPath: string,
    message: string,
    authorName: string,
    authorEmail: string,
  ): Promise<void>;
  getHeadSha(localPath: string): Promise<string>;
  push(options: GitPushOptions): Promise<void>;
  runCheckCommand(
    localPath: string,
    command: string,
  ): Promise<GitCheckCommandResult>;
  checkoutDefaultAndClean(
    localPath: string,
    defaultBranch: string,
    cloneUrl: string,
    accessToken: string,
  ): Promise<void>;
  deleteLocalBranch(localPath: string, branchName: string): Promise<void>;
}
