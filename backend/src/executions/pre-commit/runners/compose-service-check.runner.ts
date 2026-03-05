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
  private static readonly COMPOSE_SERVICE_NAME_RE =
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

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
    const service = options.service.trim();
    if (!ComposeServiceCheckRunner.COMPOSE_SERVICE_NAME_RE.test(service)) {
      throw new Error(`Invalid compose service name: ${options.service}`);
    }

    const composeCommand = `docker compose run --rm -T ${service} ${command}`;

    return this.gitPublicationClient.runCheckCommand(localPath, composeCommand);
  }
}
