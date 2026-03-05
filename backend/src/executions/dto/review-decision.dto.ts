import { IsIn } from 'class-validator';

const REVIEW_DECISIONS = ['continue', 'block', 'fix'] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export class ReviewDecisionDto {
  @IsIn(REVIEW_DECISIONS)
  decision!: ReviewDecision;
}
