import { ExecutionSummaryResponseDto } from './execution-response.dto';

export class BatchDraftExecutionFailureItemDto {
  executionId!: string;
  statusCode!: number;
  message!: string;
}

export class BatchDraftExecutionResponseDto {
  succeeded!: ExecutionSummaryResponseDto[];
  failed!: BatchDraftExecutionFailureItemDto[];
}
