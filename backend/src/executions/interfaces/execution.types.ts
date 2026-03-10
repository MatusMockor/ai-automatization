export type ExecutionAction = 'fix' | 'feature' | 'plan';
export type ExecutionRole = 'implementation' | 'review' | 'remediation';
export type ExecutionTriggerType = 'manual' | 'automation_rule' | 'schedule';
export type ExecutionDraftStatus = 'ready' | 'superseded';
export type TaskAutomationMode = 'suggest' | 'draft';
export type TaskAutomationState = 'none' | 'matched' | 'drafted';
export type ExecutionRepositoryRole = 'primary' | 'linked';
export type ExecutionGroupStatus =
  | 'draft_ready'
  | 'running'
  | 'partially_failed'
  | 'completed';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ExecutionOrchestrationState =
  | 'queued'
  | 'running'
  | 'finalizing'
  | 'awaiting_review_decision'
  | 'done'
  | 'failed';

export type ReviewGateStatus =
  | 'not_applicable'
  | 'review_running'
  | 'awaiting_decision'
  | 'decision_continue'
  | 'decision_block'
  | 'remediation_running'
  | 'review_passed'
  | 'timeout_continue';

export type TaskSource = 'asana' | 'jira' | 'manual';

export type AutomationStatus =
  | 'not_applicable'
  | 'pending'
  | 'publishing'
  | 'no_changes'
  | 'published'
  | 'failed';

export type ExecutionStreamEventType =
  | 'snapshot'
  | 'stdout'
  | 'stderr'
  | 'status'
  | 'review'
  | 'publication'
  | 'completed'
  | 'error';
