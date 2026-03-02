export type ExecutionAction = 'fix' | 'feature' | 'plan';

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
  | 'done'
  | 'failed';

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
  | 'publication'
  | 'completed'
  | 'error';
