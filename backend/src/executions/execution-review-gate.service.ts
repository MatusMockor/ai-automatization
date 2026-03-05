import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { SettingsService } from '../settings/settings.service';
import { ExecutionReview } from './entities/execution-review.entity';
import { Execution } from './entities/execution.entity';
import { ExecutionDispatchService } from './execution-dispatch.service';
import type { ReviewDecision } from './dto/review-decision.dto';
import { ReviewStateResponseDto } from './dto/review-state-response.dto';

type ImplementationGateOutcome =
  | {
      action: 'continue_publication';
    }
  | {
      action: 'review_started';
      cycle: number;
      reviewExecutionId: string;
    };

type ReviewCompletionOutcome =
  | { action: 'none' }
  | { action: 'continue_publication'; parentExecutionId: string; cycle: number }
  | {
      action: 'awaiting_decision';
      parentExecutionId: string;
      cycle: number;
      pendingDecisionUntil: Date;
      reviewExecutionId: string;
    };

type RemediationCompletionOutcome =
  | { action: 'none' }
  | {
      action: 'review_started';
      parentExecutionId: string;
      cycle: number;
      reviewExecutionId: string;
    }
  | { action: 'parent_failed'; parentExecutionId: string; message: string };

type ApplyDecisionOutcome =
  | { action: 'continue_publication'; parentExecutionId: string }
  | { action: 'blocked'; parentExecutionId: string }
  | {
      action: 'remediation_started';
      parentExecutionId: string;
      remediationExecutionId: string;
    };

@Injectable()
export class ExecutionReviewGateService {
  private readonly maxCycles: number;
  private readonly decisionTimeoutHours: number;

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    @InjectRepository(ExecutionReview)
    private readonly executionReviewRepository: Repository<ExecutionReview>,
    private readonly moduleRef: ModuleRef,
    private readonly settingsService: SettingsService,
    configService: ConfigService,
  ) {
    this.maxCycles = parsePositiveInteger(
      configService.get<string>('EXECUTION_REVIEW_MAX_CYCLES', '3'),
      3,
    );
    this.decisionTimeoutHours = parsePositiveInteger(
      configService.get<string>(
        'EXECUTION_REVIEW_DECISION_TIMEOUT_HOURS',
        '24',
      ),
      24,
    );
  }

  async handleImplementationCompletion(
    executionId: string,
  ): Promise<ImplementationGateOutcome> {
    const parentExecution = await this.executionRepository.findOneBy({
      id: executionId,
    });

    if (
      !parentExecution ||
      parentExecution.executionRole !== 'implementation'
    ) {
      return { action: 'continue_publication' };
    }

    const aiReviewEnabled =
      await this.settingsService.getAiReviewEnabledForUser(
        parentExecution.userId,
      );
    if (!aiReviewEnabled) {
      await this.executionRepository.update(
        { id: parentExecution.id },
        {
          reviewGateStatus: 'not_applicable',
          reviewPendingDecisionUntil: null,
          status: 'completed',
          orchestrationState: 'finalizing',
        },
      );
      return { action: 'continue_publication' };
    }

    const activeChild = await this.executionRepository.findOne({
      where: {
        parentExecutionId: parentExecution.id,
        status: 'pending',
      },
      order: { createdAt: 'DESC' },
      select: { id: true },
    });
    if (activeChild) {
      return {
        action: 'review_started',
        cycle: 0,
        reviewExecutionId: activeChild.id,
      };
    }

    const latestCycle = await this.getLatestCycle(parentExecution.id);
    const nextCycle = latestCycle + 1;
    if (nextCycle > this.maxCycles) {
      await this.failParentExecution(
        parentExecution.id,
        `Review cycles exhausted (max ${this.maxCycles})`,
      );
      return { action: 'continue_publication' };
    }

    const reviewExecution = this.executionRepository.create({
      userId: parentExecution.userId,
      repositoryId: parentExecution.repositoryId,
      publishPullRequest: false,
      requireCodeChanges: false,
      implementationAttempts: 1,
      idempotencyKey: null,
      requestHash: null,
      orchestrationState: 'queued',
      taskId: this.clampTaskToken(
        `${parentExecution.taskId}:review:${nextCycle}`,
      ),
      taskExternalId: this.clampTaskToken(
        `${parentExecution.taskExternalId}:review:${nextCycle}`,
      ),
      taskTitle: this.clampTitle(`Review: ${parentExecution.taskTitle}`),
      taskDescription: null,
      taskSource: parentExecution.taskSource,
      action: 'plan',
      prompt: this.buildReviewPrompt(parentExecution, nextCycle),
      status: 'pending',
      automationStatus: 'not_applicable',
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
      executionRole: 'review',
      parentExecutionId: parentExecution.id,
      rootExecutionId: parentExecution.rootExecutionId,
      reviewGateStatus: 'not_applicable',
      reviewPendingDecisionUntil: null,
    });
    const savedReviewExecution =
      await this.executionRepository.save(reviewExecution);

    const reviewRecord = this.executionReviewRepository.create({
      rootExecutionId: parentExecution.rootExecutionId,
      parentExecutionId: parentExecution.id,
      cycle: nextCycle,
      reviewExecutionId: savedReviewExecution.id,
      remediationExecutionId: null,
      verdict: null,
      findingsMarkdown: null,
      status: 'review_running',
      decision: null,
      decidedByUserId: null,
      decidedAt: null,
      pendingDecisionUntil: null,
    });
    await this.executionReviewRepository.save(reviewRecord);

    await this.executionRepository.update(
      { id: parentExecution.id },
      {
        reviewGateStatus: 'review_running',
        reviewPendingDecisionUntil: null,
        status: 'running',
        orchestrationState: 'finalizing',
      },
    );

    await this.dispatchExecution(savedReviewExecution.id);
    return {
      action: 'review_started',
      cycle: nextCycle,
      reviewExecutionId: savedReviewExecution.id,
    };
  }

  async handleReviewCompletion(
    reviewExecutionId: string,
  ): Promise<ReviewCompletionOutcome> {
    const reviewExecution = await this.executionRepository.findOneBy({
      id: reviewExecutionId,
    });
    if (!reviewExecution || reviewExecution.executionRole !== 'review') {
      return { action: 'none' };
    }

    const reviewRecord = await this.executionReviewRepository.findOne({
      where: { reviewExecutionId },
      order: { createdAt: 'DESC' },
    });
    if (!reviewRecord) {
      return { action: 'none' };
    }

    const parentExecution = await this.executionRepository.findOneBy({
      id: reviewRecord.parentExecutionId,
    });
    if (!parentExecution) {
      return { action: 'none' };
    }

    const parsed = this.parseReviewOutput(reviewExecution.output);
    const processFailed =
      reviewExecution.status !== 'completed' ||
      reviewExecution.exitCode !== 0 ||
      parsed.verdict === 'error';
    const findingsMarkdown = this.resolveFindingsMarkdown(
      parsed.findingsMarkdown,
      reviewExecution,
    );

    if (!processFailed && parsed.verdict === 'pass') {
      await this.executionReviewRepository.update(
        { id: reviewRecord.id },
        {
          verdict: 'pass',
          findingsMarkdown,
          status: 'completed_pass',
          pendingDecisionUntil: null,
        },
      );
      await this.executionRepository.update(
        { id: parentExecution.id },
        {
          reviewGateStatus: 'review_passed',
          reviewPendingDecisionUntil: null,
          status: 'completed',
          orchestrationState: 'finalizing',
        },
      );
      return {
        action: 'continue_publication',
        parentExecutionId: parentExecution.id,
        cycle: reviewRecord.cycle,
      };
    }

    const pendingUntil = new Date(
      Date.now() + this.decisionTimeoutHours * 60 * 60 * 1000,
    );
    await this.executionReviewRepository.update(
      { id: reviewRecord.id },
      {
        verdict: processFailed ? 'error' : 'fail',
        findingsMarkdown,
        status: 'awaiting_decision',
        pendingDecisionUntil: pendingUntil,
      },
    );
    await this.executionRepository.update(
      { id: parentExecution.id },
      {
        reviewGateStatus: 'awaiting_decision',
        reviewPendingDecisionUntil: pendingUntil,
        status: 'running',
        orchestrationState: 'awaiting_review_decision',
      },
    );
    return {
      action: 'awaiting_decision',
      parentExecutionId: parentExecution.id,
      cycle: reviewRecord.cycle,
      pendingDecisionUntil: pendingUntil,
      reviewExecutionId: reviewExecution.id,
    };
  }

  async handleRemediationCompletion(
    remediationExecutionId: string,
  ): Promise<RemediationCompletionOutcome> {
    const remediationExecution = await this.executionRepository.findOneBy({
      id: remediationExecutionId,
    });
    if (
      !remediationExecution ||
      remediationExecution.executionRole !== 'remediation'
    ) {
      return { action: 'none' };
    }

    const reviewRecord = await this.executionReviewRepository.findOne({
      where: { remediationExecutionId: remediationExecution.id },
      order: { createdAt: 'DESC' },
    });
    if (!reviewRecord) {
      return { action: 'none' };
    }

    const parentExecution = await this.executionRepository.findOneBy({
      id: reviewRecord.parentExecutionId,
    });
    if (!parentExecution) {
      return { action: 'none' };
    }

    if (
      remediationExecution.status !== 'completed' ||
      remediationExecution.exitCode !== 0
    ) {
      const message =
        remediationExecution.errorMessage?.trim() ||
        'Remediation execution failed';
      await this.executionReviewRepository.update(
        { id: reviewRecord.id },
        { status: 'failed' },
      );
      await this.failParentExecution(parentExecution.id, message);
      return {
        action: 'parent_failed',
        parentExecutionId: parentExecution.id,
        message,
      };
    }

    await this.executionReviewRepository.update(
      { id: reviewRecord.id },
      { status: 'completed_fail' },
    );
    const outcome = await this.handleImplementationCompletion(
      parentExecution.id,
    );
    if (outcome.action !== 'review_started') {
      return { action: 'none' };
    }

    return {
      action: 'review_started',
      parentExecutionId: parentExecution.id,
      cycle: outcome.cycle,
      reviewExecutionId: outcome.reviewExecutionId,
    };
  }

  async applyDecision(
    userId: string,
    parentExecutionId: string,
    decision: ReviewDecision,
  ): Promise<ApplyDecisionOutcome> {
    const parentExecution = await this.executionRepository.findOneBy({
      id: parentExecutionId,
      userId,
    });
    if (
      !parentExecution ||
      parentExecution.executionRole !== 'implementation'
    ) {
      throw new NotFoundException('Execution not found');
    }

    if (parentExecution.reviewGateStatus !== 'awaiting_decision') {
      throw new ConflictException('Execution is not awaiting review decision');
    }

    const reviewRecord = await this.executionReviewRepository.findOne({
      where: {
        parentExecutionId: parentExecution.id,
        status: 'awaiting_decision',
      },
      order: { cycle: 'DESC' },
    });
    if (!reviewRecord) {
      throw new ConflictException('No active review findings to decide');
    }

    const decidedAt = new Date();
    if (decision === 'continue') {
      await this.executionReviewRepository.update(
        { id: reviewRecord.id },
        {
          status: 'decision_continue',
          decision: 'continue',
          decidedByUserId: userId,
          decidedAt,
          pendingDecisionUntil: null,
        },
      );
      await this.executionRepository.update(
        { id: parentExecution.id },
        {
          reviewGateStatus: 'decision_continue',
          reviewPendingDecisionUntil: null,
          status: 'completed',
          orchestrationState: 'finalizing',
        },
      );
      return {
        action: 'continue_publication',
        parentExecutionId: parentExecution.id,
      };
    }

    if (decision === 'block') {
      await this.executionReviewRepository.update(
        { id: reviewRecord.id },
        {
          status: 'decision_block',
          decision: 'block',
          decidedByUserId: userId,
          decidedAt,
          pendingDecisionUntil: null,
        },
      );
      await this.failParentExecution(
        parentExecution.id,
        'Blocked by AI review decision',
      );
      await this.executionRepository.update(
        { id: parentExecution.id },
        {
          reviewGateStatus: 'decision_block',
          reviewPendingDecisionUntil: null,
        },
      );
      return { action: 'blocked', parentExecutionId: parentExecution.id };
    }

    const nextCycle = reviewRecord.cycle + 1;
    if (nextCycle > this.maxCycles) {
      await this.failParentExecution(
        parentExecution.id,
        `Review cycles exhausted (max ${this.maxCycles})`,
      );
      return { action: 'blocked', parentExecutionId: parentExecution.id };
    }

    const remediationExecution = this.executionRepository.create({
      userId: parentExecution.userId,
      repositoryId: parentExecution.repositoryId,
      publishPullRequest: false,
      requireCodeChanges: true,
      implementationAttempts: 1,
      idempotencyKey: null,
      requestHash: null,
      orchestrationState: 'queued',
      taskId: this.clampTaskToken(
        `${parentExecution.taskId}:remediate:${reviewRecord.cycle}`,
      ),
      taskExternalId: this.clampTaskToken(
        `${parentExecution.taskExternalId}:remediate:${reviewRecord.cycle}`,
      ),
      taskTitle: this.clampTitle(`Remediation: ${parentExecution.taskTitle}`),
      taskDescription: null,
      taskSource: parentExecution.taskSource,
      action: 'fix',
      prompt: this.buildRemediationPrompt(parentExecution, reviewRecord),
      status: 'pending',
      automationStatus: 'not_applicable',
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
      executionRole: 'remediation',
      parentExecutionId: parentExecution.id,
      rootExecutionId: parentExecution.rootExecutionId,
      reviewGateStatus: 'not_applicable',
      reviewPendingDecisionUntil: null,
    });
    const savedRemediationExecution =
      await this.executionRepository.save(remediationExecution);

    await this.executionReviewRepository.update(
      { id: reviewRecord.id },
      {
        status: 'remediation_running',
        decision: 'fix',
        decidedByUserId: userId,
        decidedAt,
        remediationExecutionId: savedRemediationExecution.id,
        pendingDecisionUntil: null,
      },
    );
    await this.executionRepository.update(
      { id: parentExecution.id },
      {
        reviewGateStatus: 'remediation_running',
        reviewPendingDecisionUntil: null,
        status: 'running',
        orchestrationState: 'finalizing',
      },
    );
    await this.dispatchExecution(savedRemediationExecution.id);

    return {
      action: 'remediation_started',
      parentExecutionId: parentExecution.id,
      remediationExecutionId: savedRemediationExecution.id,
    };
  }

  async getReviewStateForUser(
    userId: string,
    executionId: string,
  ): Promise<ReviewStateResponseDto> {
    const execution = await this.executionRepository.findOneBy({
      id: executionId,
      userId,
    });
    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    const parentExecutionId =
      execution.executionRole === 'implementation'
        ? execution.id
        : execution.parentExecutionId;
    if (!parentExecutionId) {
      return {
        status: 'not_applicable',
        cycle: null,
        findingsMarkdown: null,
        verdict: null,
        pendingDecisionUntil: null,
        reviewExecutionId: null,
        remediationExecutionId: null,
      };
    }

    const parentExecution = await this.executionRepository.findOneBy({
      id: parentExecutionId,
      userId,
    });
    if (!parentExecution) {
      throw new NotFoundException('Execution not found');
    }

    const latestReview = await this.executionReviewRepository.findOne({
      where: { parentExecutionId: parentExecution.id },
      order: { cycle: 'DESC' },
    });

    return {
      status: parentExecution.reviewGateStatus,
      cycle: latestReview?.cycle ?? null,
      findingsMarkdown: latestReview?.findingsMarkdown ?? null,
      verdict: latestReview?.verdict ?? null,
      pendingDecisionUntil: parentExecution.reviewPendingDecisionUntil,
      reviewExecutionId: latestReview?.reviewExecutionId ?? null,
      remediationExecutionId: latestReview?.remediationExecutionId ?? null,
    };
  }

  async markTimedOutAwaitingDecision(limit = 20): Promise<string[]> {
    const overdueExecutions = await this.executionRepository
      .createQueryBuilder('execution')
      .where('execution.execution_role = :role', { role: 'implementation' })
      .andWhere('execution.review_gate_status = :status', {
        status: 'awaiting_decision',
      })
      .andWhere('execution.review_pending_decision_until IS NOT NULL')
      .andWhere('execution.review_pending_decision_until <= :now', {
        now: new Date(),
      })
      .orderBy('execution.review_pending_decision_until', 'ASC')
      .take(limit)
      .getMany();

    const resumedExecutionIds: string[] = [];
    for (const execution of overdueExecutions) {
      const latestReview = await this.executionReviewRepository.findOne({
        where: {
          parentExecutionId: execution.id,
          status: 'awaiting_decision',
        },
        order: { cycle: 'DESC' },
      });
      if (!latestReview) {
        continue;
      }

      await this.executionReviewRepository.update(
        { id: latestReview.id },
        {
          status: 'decision_continue',
          decision: 'timeout_continue',
          decidedAt: new Date(),
          pendingDecisionUntil: null,
        },
      );
      await this.executionRepository.update(
        { id: execution.id },
        {
          reviewGateStatus: 'timeout_continue',
          reviewPendingDecisionUntil: null,
          status: 'completed',
          orchestrationState: 'finalizing',
        },
      );
      resumedExecutionIds.push(execution.id);
    }

    return resumedExecutionIds;
  }

  private async getLatestCycle(parentExecutionId: string): Promise<number> {
    const latest = await this.executionReviewRepository.findOne({
      where: { parentExecutionId },
      order: { cycle: 'DESC' },
      select: { cycle: true },
    });
    return latest?.cycle ?? 0;
  }

  private buildReviewPrompt(parentExecution: Execution, cycle: number): string {
    const description = parentExecution.taskDescription?.trim();
    return [
      'Review the code changes made for this task.',
      `Review cycle: ${cycle}/${this.maxCycles}`,
      `Task source: ${parentExecution.taskSource}`,
      `Task external ID: ${parentExecution.taskExternalId}`,
      `Task title: ${parentExecution.taskTitle}`,
      description ? `Task description:\n${description}` : '',
      '',
      'Focus on correctness, regressions, security risks, and missing tests.',
      'You may run non-mutating checks/tests.',
      'Do not modify files.',
      'Respond using this exact contract:',
      'REVIEW_VERDICT: pass|fail',
      'REVIEW_FINDINGS_MD:',
      '(markdown findings, concise and actionable)',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private buildRemediationPrompt(
    parentExecution: Execution,
    reviewRecord: ExecutionReview,
  ): string {
    const findings = reviewRecord.findingsMarkdown?.trim().length
      ? reviewRecord.findingsMarkdown
      : 'No findings markdown was captured.';

    return [
      'Address the review findings with concrete code changes.',
      `Task source: ${parentExecution.taskSource}`,
      `Task external ID: ${parentExecution.taskExternalId}`,
      `Task title: ${parentExecution.taskTitle}`,
      '',
      'Review findings to fix:',
      findings,
      '',
      'Hard requirement: modify repository files and produce a real git diff.',
      'Add or update tests where appropriate.',
      'Provide a concise summary of fixes.',
    ].join('\n');
  }

  private parseReviewOutput(output: string): {
    verdict: 'pass' | 'fail' | 'error';
    findingsMarkdown: string | null;
  } {
    const verdictMatch = output.match(/^REVIEW_VERDICT:\s*(pass|fail)\s*$/im);
    if (!verdictMatch) {
      return {
        verdict: 'pass',
        findingsMarkdown:
          'Reviewer output did not include structured verdict; continuing by default.',
      };
    }

    const bodyTagRegex = /^REVIEW_FINDINGS_MD:\s*/gim;
    let lastFindingsIndex: number | null = null;
    let match: RegExpExecArray | null = null;

    while ((match = bodyTagRegex.exec(output)) !== null) {
      lastFindingsIndex = match.index + match[0].length;
    }

    return {
      verdict: verdictMatch[1].toLowerCase() === 'pass' ? 'pass' : 'fail',
      findingsMarkdown:
        lastFindingsIndex === null
          ? null
          : output.slice(lastFindingsIndex).trim() || null,
    };
  }

  private resolveFindingsMarkdown(
    findingsMarkdown: string | null,
    execution: Execution,
  ): string | null {
    if (findingsMarkdown?.trim().length) {
      return findingsMarkdown.trim().slice(0, 20000);
    }

    if (execution.errorMessage?.trim().length) {
      return execution.errorMessage.trim().slice(0, 20000);
    }

    if (execution.output?.trim().length) {
      return execution.output.trim().slice(0, 20000);
    }

    return null;
  }

  private async failParentExecution(
    parentExecutionId: string,
    message: string,
  ): Promise<void> {
    await this.executionRepository.update(
      { id: parentExecutionId },
      {
        status: 'failed',
        orchestrationState: 'failed',
        reviewGateStatus: 'decision_block',
        reviewPendingDecisionUntil: null,
        automationStatus: 'failed',
        automationCompletedAt: new Date(),
        automationErrorMessage: message,
        finishedAt: new Date(),
        errorMessage: message,
      },
    );
  }

  private clampTaskToken(value: string): string {
    return value.slice(0, 255);
  }

  private clampTitle(value: string): string {
    return value.slice(0, 4000);
  }

  private async dispatchExecution(executionId: string): Promise<void> {
    const dispatchService = this.moduleRef.get(ExecutionDispatchService, {
      strict: false,
    });
    if (!dispatchService) {
      throw new Error('ExecutionDispatchService is not available');
    }

    await dispatchService.dispatch(executionId);
  }
}
