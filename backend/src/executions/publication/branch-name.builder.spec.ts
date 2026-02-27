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
});
