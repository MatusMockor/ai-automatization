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
    payload: Extract<ExecutionStreamEventPayload, { type: Type }>;
  };
}[ExecutionStreamEventType];
