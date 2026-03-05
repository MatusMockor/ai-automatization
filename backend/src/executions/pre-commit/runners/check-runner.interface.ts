import type { GitCheckCommandResult } from '../../interfaces/git-publication-client.interface';

export interface CheckRunner {
  run(
    localPath: string,
    command: string,
    options: {
      service: string;
    },
  ): Promise<GitCheckCommandResult>;
}
