import type {
  AutomationStatus,
  ReviewGateStatus,
  ExecutionStatus,
  ExecutionStreamEventType,
} from '../interfaces/execution.types';

type EventMetadata = {
  sequence?: number;
  sentAt?: string;
};

export type ExecutionStreamEventPayload =
  | {
      type: 'snapshot';
      executionId: string;
      status: ExecutionStatus;
      automationStatus: AutomationStatus;
      output: string;
      outputTruncated: boolean;
      lastSequence?: number;
    }
  | {
      type: 'stdout';
      executionId: string;
      chunk: string;
    }
  | {
      type: 'stderr';
      executionId: string;
      chunk: string;
    }
  | {
      type: 'status';
      executionId: string;
      status: ExecutionStatus;
      errorMessage?: string;
    }
  | {
      type: 'review';
      executionId: string;
      reviewGateStatus: ReviewGateStatus;
      cycle: number;
      message?: string;
      pendingDecisionUntil?: string;
      reviewExecutionId?: string;
      remediationExecutionId?: string;
    }
  | {
      type: 'publication';
      executionId: string;
      automationStatus: AutomationStatus;
      branchName?: string;
      pullRequestUrl?: string;
      message?: string;
    }
  | {
      type: 'completed';
      executionId: string;
      status: ExecutionStatus;
      exitCode: number | null;
      errorMessage?: string;
    }
  | {
      type: 'error';
      executionId: string;
      status: ExecutionStatus;
      exitCode: number | null;
      errorMessage?: string;
    };

export type ExecutionStreamEventDto = {
  [Type in ExecutionStreamEventType]: {
    type: Type;
    payload: Extract<ExecutionStreamEventPayload, { type: Type }> &
      EventMetadata;
  };
}[ExecutionStreamEventType];
