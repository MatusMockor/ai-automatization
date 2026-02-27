import type {
  ExecutionStatus,
  ExecutionStreamEventType,
} from '../interfaces/execution.types';

export type ExecutionStreamEventPayload =
  | {
      type: 'snapshot';
      executionId: string;
      status: ExecutionStatus;
      output: string;
      outputTruncated: boolean;
    }
  | {
      type: 'stdout' | 'stderr';
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
      type: 'completed' | 'error';
      executionId: string;
      status: ExecutionStatus;
      exitCode: number | null;
      errorMessage?: string;
    };

export type ExecutionStreamEventDto = {
  type: ExecutionStreamEventType;
  payload: ExecutionStreamEventPayload;
};
