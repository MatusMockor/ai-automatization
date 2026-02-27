export type ExecutionAction = 'fix' | 'feature' | 'plan';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskSource = 'asana' | 'jira';

export type ExecutionStreamEventType =
  | 'snapshot'
  | 'stdout'
  | 'stderr'
  | 'status'
  | 'completed'
  | 'error';
