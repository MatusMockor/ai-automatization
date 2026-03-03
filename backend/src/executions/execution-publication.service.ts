import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedactionService } from '../common/security/redaction.service';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { MetricsService } from '../observability/metrics.service';
import { SettingsService } from '../settings/settings.service';
import {
  GITHUB_PULL_REQUESTS_GATEWAY,
  GIT_PUBLICATION_CLIENT,
} from './constants/executions.tokens';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';
import {
  ExecutionPublicationError,
  GithubPullRequestError,
} from './errors/execution-publication.errors';
import { Execution } from './entities/execution.entity';
import { ExecutionDispatchService } from './execution-dispatch.service';
import { ExecutionStreamHub } from './execution-stream.hub';
import type { GitPublicationClient } from './interfaces/git-publication-client.interface';
import type { GithubPullRequestsGateway } from './interfaces/github-pull-requests-gateway.interface';
import { BranchNameBuilder } from './publication/branch-name.builder';
import { ExecutionReportArtifactService } from './publication/execution-report-artifact.service';
import { PublicationContentResolver } from './publication/publication-content.resolver';
import { PullRequestTemplateResolver } from './publication/pull-request-template.resolver';

export type CompletedPublicationResult =
  | { outcome: 'published' }
  | { outcome: 'not_applicable' }
  | { outcome: 'failed' }
  | { outcome: 'requeued' }
  | { outcome: 'failed_no_changes' };

@Injectable()
export class ExecutionPublicationService {
  private readonly logger = new Logger(ExecutionPublicationService.name);
  private static readonly MAX_IMPLEMENTATION_ATTEMPTS = 3;
  private readonly retryCount: number;
  private readonly retryBackoffMs: number;
  private readonly branchPrefix: string;
  private readonly commitAuthorName: string;
  private readonly commitAuthorEmail: string;
  private readonly maxBranchAttempts = 50;

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly settingsService: SettingsService,
    @Inject(GIT_PUBLICATION_CLIENT)
    private readonly gitPublicationClient: GitPublicationClient,
    @Inject(GITHUB_PULL_REQUESTS_GATEWAY)
    private readonly githubPullRequestsGateway: GithubPullRequestsGateway,
    private readonly streamHub: ExecutionStreamHub,
    private readonly branchNameBuilder: BranchNameBuilder,
    private readonly executionReportArtifactService: ExecutionReportArtifactService,
    private readonly pullRequestTemplateResolver: PullRequestTemplateResolver,
    private readonly publicationContentResolver: PublicationContentResolver,
    private readonly redactionService: RedactionService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {
    this.retryCount = Math.min(
      10,
      Math.max(
        1,
        parsePositiveInteger(
          this.configService.get<string>('EXECUTION_AUTOPR_RETRY_COUNT', '3'),
          3,
        ),
      ),
    );
    this.retryBackoffMs = parsePositiveInteger(
      this.configService.get<string>(
        'EXECUTION_AUTOPR_RETRY_BACKOFF_MS',
        '2000',
      ),
      2000,
    );
    this.branchPrefix =
      this.configService.get<string>(
        'EXECUTION_AUTOPR_BRANCH_PREFIX',
        'feature/ai',
      ) ?? 'feature/ai';
    this.commitAuthorName =
      this.configService.get<string>(
        'EXECUTION_GIT_AUTHOR_NAME',
        'Automation Bot',
      ) ?? 'Automation Bot';
    this.commitAuthorEmail =
      this.configService.get<string>(
        'EXECUTION_GIT_AUTHOR_EMAIL',
        'automation@local',
      ) ?? 'automation@local';
  }

  async handleCompletedExecution(
    executionId: string,
  ): Promise<CompletedPublicationResult> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: {
        repository: true,
      },
    });

    if (!execution) {
      return { outcome: 'failed' };
    }

    if (!execution.publishPullRequest) {
      await this.updateAutomationState(execution.id, {
        automationStatus: 'not_applicable',
        automationCompletedAt: new Date(),
        automationErrorMessage:
          'Pull request publication disabled for this execution',
      });
      this.publishAutomationEvent(execution.id, {
        automationStatus: 'not_applicable',
        message: 'Pull request publication disabled for this execution',
      });
      return { outcome: 'not_applicable' };
    }

    if (!execution.repository) {
      await this.failAutomation(
        execution.id,
        'Execution repository is missing',
      );
      return { outcome: 'failed' };
    }

    const githubToken = await this.settingsService.getGithubTokenForUserOrNull(
      execution.userId,
    );
    if (!githubToken) {
      await this.failAutomation(execution.id, 'GitHub token missing');
      return { outcome: 'failed' };
    }

    await this.updateAutomationState(execution.id, {
      automationStatus: 'publishing',
      automationErrorMessage: null,
      automationCompletedAt: null,
    });
    this.publishAutomationEvent(execution.id, {
      automationStatus: 'publishing',
      message: 'Starting publication flow',
    });

    let branchName: string | null = null;
    let reportArtifactPath: string | null = null;
    let reportOnlyPublication = false;

    try {
      branchName = await this.resolveAvailableBranchName(
        execution,
        githubToken,
      );
      await this.gitPublicationClient.checkoutNewBranch(
        execution.repository.localPath,
        branchName,
      );

      if (execution.action === 'plan') {
        reportArtifactPath =
          await this.executionReportArtifactService.writeReport(execution);
        reportOnlyPublication = true;
        this.publishAutomationEvent(execution.id, {
          automationStatus: 'publishing',
          branchName,
          message: `Plan report artifact prepared at ${reportArtifactPath}`,
        });
      }

      const hasChanges = await this.gitPublicationClient.hasChanges(
        execution.repository.localPath,
      );
      if (!hasChanges) {
        if (this.isStrictCodeChangesMode(execution)) {
          return this.handleStrictNoDiff(execution, branchName);
        }

        if (!reportArtifactPath) {
          reportArtifactPath =
            await this.executionReportArtifactService.writeReport(execution);
        }
        reportOnlyPublication = true;
        this.publishAutomationEvent(execution.id, {
          automationStatus: 'publishing',
          branchName,
          message: `No code diff detected, report artifact prepared at ${reportArtifactPath}`,
        });
      }

      if (!reportOnlyPublication) {
        await this.assertPrePrChecks(execution.repository.localPath);
      }

      const templateBody = await this.pullRequestTemplateResolver.resolve(
        execution.repository.localPath,
      );
      const content = this.publicationContentResolver.resolve({
        taskTitle: execution.taskTitle,
        taskExternalId: execution.taskExternalId,
        taskSource: execution.taskSource,
        taskDescription: execution.taskDescription,
        executionOutput: execution.output,
        templateBody,
      });

      await this.gitPublicationClient.addAll(execution.repository.localPath);
      await this.gitPublicationClient.commit(
        execution.repository.localPath,
        content.commitMessage,
        this.commitAuthorName,
        this.commitAuthorEmail,
      );
      const commitSha = await this.gitPublicationClient.getHeadSha(
        execution.repository.localPath,
      );

      const publishedResult = await this.publishWithRetry({
        execution,
        branchName,
        githubToken,
        title: content.pullRequestTitle,
        body: content.pullRequestBody,
      });

      await this.updateAutomationState(execution.id, {
        automationStatus: 'published',
        automationAttempts: publishedResult.attempts,
        branchName,
        commitSha,
        pullRequestNumber: publishedResult.number,
        pullRequestUrl: publishedResult.url,
        pullRequestTitle: publishedResult.title,
        automationCompletedAt: new Date(),
        automationErrorMessage: null,
      });
      this.publishAutomationEvent(execution.id, {
        automationStatus: 'published',
        branchName,
        pullRequestUrl: publishedResult.url,
        message: 'Pull request created successfully',
      });
      return { outcome: 'published' };
    } catch (error) {
      this.logger.error(
        `Execution publication failed for execution ${execution.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      const message = this.resolveErrorMessage(error);
      await this.failAutomation(execution.id, message, branchName);
      return { outcome: 'failed' };
    } finally {
      await this.cleanupBranch(execution, githubToken, branchName);
    }
  }

  private isStrictCodeChangesMode(execution: Execution): boolean {
    if (!execution.requireCodeChanges) {
      return false;
    }

    return execution.action === 'feature' || execution.action === 'fix';
  }

  private async handleStrictNoDiff(
    execution: Execution,
    branchName: string,
  ): Promise<CompletedPublicationResult> {
    if (
      execution.implementationAttempts <
      ExecutionPublicationService.MAX_IMPLEMENTATION_ATTEMPTS
    ) {
      const nextAttempt = execution.implementationAttempts + 1;
      const maxAttempts =
        ExecutionPublicationService.MAX_IMPLEMENTATION_ATTEMPTS;
      await this.executionRepository.update(
        { id: execution.id },
        {
          implementationAttempts: nextAttempt,
          prompt: this.buildRetryPrompt(execution, nextAttempt, maxAttempts),
          status: 'pending',
          orchestrationState: 'queued',
          automationStatus: 'pending',
          automationAttempts: 0,
          branchName: null,
          commitSha: null,
          pullRequestNumber: null,
          pullRequestUrl: null,
          pullRequestTitle: null,
          automationErrorMessage: null,
          automationCompletedAt: null,
          output: '',
          outputTruncated: false,
          pid: null,
          startedAt: null,
          finishedAt: null,
          exitCode: null,
          errorMessage: null,
        },
      );
      this.publishAutomationEvent(execution.id, {
        automationStatus: 'publishing',
        branchName,
        message: `No code diff detected, retrying implementation attempt ${nextAttempt}/${maxAttempts}`,
      });

      try {
        const dispatchService = this.moduleRef.get(ExecutionDispatchService, {
          strict: false,
        });
        if (!dispatchService) {
          throw new ExecutionPublicationError(
            'Execution dispatch service is not available',
          );
        }
        await dispatchService.dispatch(execution.id);
      } catch (error) {
        const message = this.resolveErrorMessage(error);
        await this.failAutomation(
          execution.id,
          `Failed to requeue execution: ${message}`,
          null,
        );
        return { outcome: 'failed' };
      }

      return { outcome: 'requeued' };
    }

    const maxAttempts = ExecutionPublicationService.MAX_IMPLEMENTATION_ATTEMPTS;
    const failureMessage = `No code changes produced after ${maxAttempts} attempts`;
    this.metricsService.incrementExecutionPublicationFailed();
    await this.executionRepository.update(
      { id: execution.id },
      {
        status: 'failed',
        orchestrationState: 'failed',
        automationStatus: 'no_changes',
        automationCompletedAt: new Date(),
        automationErrorMessage: failureMessage,
        branchName: null,
        commitSha: null,
        pullRequestNumber: null,
        pullRequestUrl: null,
        pullRequestTitle: null,
        errorMessage: failureMessage,
      },
    );
    this.publishAutomationEvent(execution.id, {
      automationStatus: 'no_changes',
      message: `No code diff detected after ${maxAttempts} attempts; execution failed`,
    });
    return { outcome: 'failed_no_changes' };
  }

  private buildRetryPrompt(
    execution: Execution,
    nextAttempt: number,
    maxAttempts: number,
  ): string {
    const descriptionBlock = execution.taskDescription?.trim().length
      ? `Task description:\n${execution.taskDescription.trim()}\n`
      : '';

    return [
      execution.action === 'fix'
        ? 'Resolve the reported issue with a minimal safe fix.'
        : 'Implement the requested feature using maintainable backend architecture and tests.',
      `Task source: ${execution.taskSource}`,
      `Task external ID: ${execution.taskExternalId}`,
      `Task title: ${execution.taskTitle}`,
      `${descriptionBlock}`.trimEnd(),
      '',
      `Previous attempt produced no code diff. This is retry attempt ${nextAttempt}/${maxAttempts}.`,
      'Hard requirement: modify repository files and produce a real git diff.',
      'Do not output only analysis/report text.',
      'Implement concrete code changes and tests now.',
      'Provide a concise summary of what was implemented.',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private async resolveAvailableBranchName(
    execution: Execution,
    githubToken: string,
  ): Promise<string> {
    const baseBranchName = this.branchNameBuilder.buildBaseBranchName(
      this.branchPrefix,
      execution.taskExternalId,
    );

    for (let attempt = 1; attempt <= this.maxBranchAttempts; attempt += 1) {
      const candidate = this.branchNameBuilder.buildCandidate(
        baseBranchName,
        attempt,
      );
      const exists = await this.gitPublicationClient.branchExistsRemote(
        execution.repository.localPath,
        candidate,
        execution.repository.cloneUrl,
        githubToken,
      );

      if (!exists) {
        return candidate;
      }
    }

    throw new ExecutionPublicationError(
      'Unable to allocate a unique branch name',
    );
  }

  private async assertPrePrChecks(localPath: string): Promise<void> {
    const prePrCheckCommand =
      process.env.EXECUTION_PRE_PR_CHECK_COMMAND ??
      this.configService.get<string>('EXECUTION_PRE_PR_CHECK_COMMAND', '') ??
      '';
    if (prePrCheckCommand.trim().length === 0) {
      return;
    }

    const result = await this.gitPublicationClient.runCheckCommand(
      localPath,
      prePrCheckCommand,
    );

    if (!result.success) {
      const checkError = [result.stderr, result.stdout]
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
        .join('\n')
        .slice(0, 2000);

      throw new ExecutionPublicationError(
        'Pre-PR checks failed',
        checkError || 'No command output was captured',
      );
    }
  }

  private async publishWithRetry(input: {
    execution: Execution;
    branchName: string;
    githubToken: string;
    title: string;
    body: string;
  }): Promise<{
    number: number;
    url: string;
    title: string;
    attempts: number;
  }> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.retryCount; attempt += 1) {
      await this.updateAutomationState(input.execution.id, {
        automationAttempts: attempt,
      });

      try {
        await this.gitPublicationClient.push({
          localPath: input.execution.repository.localPath,
          branchName: input.branchName,
          cloneUrl: input.execution.repository.cloneUrl,
          accessToken: input.githubToken,
        });

        const pullRequest =
          await this.githubPullRequestsGateway.createPullRequest({
            fullName: input.execution.repository.fullName,
            head: input.branchName,
            base: input.execution.repository.defaultBranch,
            title: input.title,
            body: input.body,
            accessToken: input.githubToken,
          });

        return {
          ...pullRequest,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error;
        if (attempt < this.retryCount) {
          await this.sleep(this.retryBackoffMs);
        }
      }
    }

    throw new ExecutionPublicationError(
      'Publication retries exhausted',
      this.resolveErrorMessage(lastError),
    );
  }

  private async failAutomation(
    executionId: string,
    message: string,
    branchName: string | null = null,
  ): Promise<void> {
    this.metricsService.incrementExecutionPublicationFailed();
    await this.updateAutomationState(executionId, {
      automationStatus: 'failed',
      branchName,
      automationCompletedAt: new Date(),
      automationErrorMessage: message,
    });

    this.publishAutomationEvent(executionId, {
      automationStatus: 'failed',
      branchName: branchName ?? undefined,
      message,
    });
  }

  private publishAutomationEvent(
    executionId: string,
    payload: {
      automationStatus:
        | 'not_applicable'
        | 'publishing'
        | 'no_changes'
        | 'published'
        | 'failed';
      branchName?: string;
      pullRequestUrl?: string;
      message?: string;
    },
  ): void {
    const event: ExecutionStreamEventDto = {
      type: 'publication',
      payload: {
        type: 'publication',
        executionId,
        automationStatus: payload.automationStatus,
        branchName: payload.branchName,
        pullRequestUrl: payload.pullRequestUrl,
        message: payload.message,
      },
    };

    this.streamHub.publish(executionId, event, false);
  }

  private async cleanupBranch(
    execution: Execution,
    githubToken: string,
    branchName: string | null,
  ): Promise<void> {
    try {
      await this.gitPublicationClient.checkoutDefaultAndClean(
        execution.repository.localPath,
        execution.repository.defaultBranch,
        execution.repository.cloneUrl,
        githubToken,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup repository for execution ${execution.id}: ${this.resolveErrorMessage(error)}`,
      );
    }

    if (!branchName) {
      return;
    }

    try {
      await this.gitPublicationClient.deleteLocalBranch(
        execution.repository.localPath,
        branchName,
      );
    } catch {
      // best effort local branch cleanup
    }
  }

  private async updateAutomationState(
    executionId: string,
    patch: Partial<Execution>,
  ): Promise<void> {
    await this.executionRepository.update({ id: executionId }, patch);
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof ExecutionPublicationError) {
      const message = error.causeDetails
        ? `${error.message}: ${error.causeDetails}`.slice(0, 2000)
        : error.message;
      return this.redactionService.redactText(message);
    }

    if (error instanceof GithubPullRequestError) {
      return this.redactionService.redactText(error.message);
    }

    if (error instanceof Error) {
      return this.redactionService.redactText(error.message);
    }

    return 'Unknown automation publication error';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
