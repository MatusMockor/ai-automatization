import { BranchNameBuilder } from './branch-name.builder';

describe('BranchNameBuilder', () => {
  const builder = new BranchNameBuilder();

  it('builds sanitized base branch name', () => {
    const branchName = builder.buildBaseBranchName(
      'feature/ai',
      'TASK 123 / Fix',
    );

    expect(branchName).toBe('feature/ai/task-123-fix');
  });

  it('adds numeric suffix when candidate attempt is greater than one', () => {
    expect(builder.buildCandidate('feature/ai/task-1', 1)).toBe(
      'feature/ai/task-1',
    );
    expect(builder.buildCandidate('feature/ai/task-1', 3)).toBe(
      'feature/ai/task-1-3',
    );
  });

  it('sanitizes each prefix segment and falls back when all are invalid', () => {
    expect(builder.buildBaseBranchName('feature/.AI///..', 'TASK-99')).toBe(
      'feature/ai/task-99',
    );
    expect(builder.buildBaseBranchName('///...///', 'TASK-99')).toBe(
      'feature/ai/task-99',
    );
  });

  it('removes dots from task identifier segment', () => {
    expect(builder.buildBaseBranchName('feature/ai', 'task..id')).toBe(
      'feature/ai/task-id',
    );
  });
});
