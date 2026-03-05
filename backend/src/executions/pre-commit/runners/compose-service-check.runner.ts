import { Injectable } from '@nestjs/common';
import { GIT_PUBLICATION_CLIENT } from '../../constants/executions.tokens';
import type {
  GitCheckCommandResult,
  GitPublicationClient,
} from '../../interfaces/git-publication-client.interface';
import { Inject } from '@nestjs/common';
import type { CheckRunner } from './check-runner.interface';

@Injectable()
export class ComposeServiceCheckRunner implements CheckRunner {
  constructor(
    @Inject(GIT_PUBLICATION_CLIENT)
    private readonly gitPublicationClient: GitPublicationClient,
  ) {}

  run(
    localPath: string,
    command: string,
    options: {
      service: string;
    },
  ): Promise<GitCheckCommandResult> {
    const composeCommand = `docker compose run --rm -T ${options.service} ${command}`;

    return this.gitPublicationClient.runCheckCommand(localPath, composeCommand);
  }
}
