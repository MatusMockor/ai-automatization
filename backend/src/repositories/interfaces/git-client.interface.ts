export interface GitClient {
  clone(cloneUrl: string, localPath: string): Promise<void>;
  isGitRepository(localPath: string): Promise<boolean>;
  isWorkingTreeClean(localPath: string): Promise<boolean>;
  pull(localPath: string, branch: string): Promise<void>;
}
