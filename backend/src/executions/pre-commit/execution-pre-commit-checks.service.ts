import { Inject, Injectable } from '@nestjs/common';
import { MetricsService } from '../../observability/metrics.service';
import { GIT_PUBLICATION_CLIENT } from '../constants/executions.tokens';
import type { Execution } from '../entities/execution.entity';
import type {
  GitPublicationClient,
  GitCheckCommandResult,
} from '../interfaces/git-publication-client.interface';
import { CheckPresetRegistryService } from './check-preset-registry.service';
import { PreCommitCheckProfileResolver } from './pre-commit-check-profile.resolver';
import type {
  PreCommitChecksExecutionResult,
  PreCommitChecksProfile,
  PreCommitStepExecutionResult,
  PreCommitStepPreset,
} from './pre-commit-check-profile.types';
import { ComposeServiceCheckRunner } from './runners/compose-service-check.runner';

@Injectable()
export class ExecutionPreCommitChecksService {
  constructor(
    private readonly profileResolver: PreCommitCheckProfileResolver,
    private readonly presetRegistry: CheckPresetRegistryService,
    private readonly composeServiceCheckRunner: ComposeServiceCheckRunner,
    private readonly metricsService: MetricsService,
    @Inject(GIT_PUBLICATION_CLIENT)
    private readonly gitPublicationClient: GitPublicationClient,
  ) {}

  async runForExecution(
    execution: Execution,
  ): Promise<PreCommitChecksExecutionResult> {
    const startedAt = Date.now();
    let resolvedProfile: Awaited<
      ReturnType<PreCommitCheckProfileResolver['resolve']>
    > | null = null;

    try {
      resolvedProfile = await this.profileResolver.resolve(
        execution.userId,
        execution.repository,
      );

      if (resolvedProfile.source === 'none') {
        return this.buildResult({
          source: 'none',
          mode: 'warn',
          status: 'skipped',
          failureReason: null,
          stepResults: [],
          durationMs: Date.now() - startedAt,
        });
      }

      if (resolvedProfile.source === 'legacy_env') {
        const result = await this.runLegacyCommand(
          execution.repository.localPath,
          resolvedProfile.legacyCommand ?? '',
        );

        return this.buildResult({
          source: 'legacy_env',
          mode: 'block',
          status: result.success ? 'passed' : 'failed',
          failureReason: result.success
            ? null
            : this.buildFailureReason(result),
          stepResults: [
            {
              preset: 'test',
              command: resolvedProfile.legacyCommand ?? '',
              success: result.success,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          ],
          durationMs: Date.now() - startedAt,
        });
      }

      const profile = resolvedProfile.profile;
      if (!profile || !profile.enabled) {
        return this.buildResult({
          source: resolvedProfile.source,
          mode: profile?.mode ?? 'warn',
          status: 'skipped',
          failureReason: null,
          stepResults: [],
          durationMs: Date.now() - startedAt,
        });
      }

      const enabledSteps = profile.steps.filter((step) => step.enabled);
      if (enabledSteps.length === 0) {
        return this.buildResult({
          source: resolvedProfile.source,
          mode: profile.mode,
          status: 'skipped',
          failureReason: null,
          stepResults: [],
          durationMs: Date.now() - startedAt,
        });
      }

      const runtimeLanguage =
        profile.runtime?.language ??
        (await this.presetRegistry.resolveLanguage(
          execution.repository.localPath,
        ));

      const stepResults: PreCommitStepExecutionResult[] = [];

      for (const step of enabledSteps) {
        const command = this.presetRegistry.getCommand(
          runtimeLanguage,
          step.preset,
        );
        const result = await this.runProfileStep(
          execution.repository.localPath,
          profile,
          step.preset,
          command,
        );
        stepResults.push(result);

        if (!result.success) {
          return this.buildResult({
            source: resolvedProfile.source,
            mode: profile.mode,
            status: 'failed',
            failureReason: this.buildFailureReason(result),
            stepResults,
            durationMs: Date.now() - startedAt,
          });
        }
      }

      return this.buildResult({
        source: resolvedProfile.source,
        mode: profile.mode,
        status: 'passed',
        failureReason: null,
        stepResults,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Pre-commit checks failed';
      return this.buildResult({
        source: resolvedProfile?.source ?? 'none',
        mode:
          resolvedProfile?.profile?.mode ??
          (resolvedProfile?.source === 'legacy_env' ? 'block' : 'warn'),
        status: 'failed',
        failureReason: reason,
        stepResults: [],
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async runLegacyCommand(
    localPath: string,
    command: string,
  ): Promise<GitCheckCommandResult> {
    return this.gitPublicationClient.runCheckCommand(localPath, command);
  }

  private async runProfileStep(
    localPath: string,
    profile: PreCommitChecksProfile,
    preset: PreCommitStepPreset,
    command: string,
  ): Promise<PreCommitStepExecutionResult> {
    const result = await this.composeServiceCheckRunner.run(
      localPath,
      command,
      {
        service: profile.runner.service,
      },
    );

    return {
      preset,
      command,
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private buildFailureReason(
    result: Pick<PreCommitStepExecutionResult, 'stderr' | 'stdout'>,
  ): string {
    return [result.stderr, result.stdout]
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)
      .join('\n')
      .slice(0, 2000);
  }

  private buildResult(
    result: PreCommitChecksExecutionResult,
  ): PreCommitChecksExecutionResult {
    this.metricsService.incrementExecutionPreCommitChecks(result.status);
    this.metricsService.observeExecutionPreCommitChecksDuration(
      result.durationMs / 1000,
    );

    return result;
  }
}
