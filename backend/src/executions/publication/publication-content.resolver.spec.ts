import { PublicationContentResolver } from './publication-content.resolver';

describe('PublicationContentResolver', () => {
  const resolver = new PublicationContentResolver();

  it('uses repository template body when template is available', () => {
    const result = resolver.resolve({
      taskTitle: 'Fix issue',
      taskExternalId: 'TASK-1',
      taskSource: 'jira',
      taskDescription: null,
      executionOutput: '',
      templateBody: '## Template body',
    });

    expect(result.pullRequestBody).toBe('## Template body');
    expect(result.pullRequestTitle).toContain('TASK-1');
  });

  it('parses Claude contract fallback when template is absent', () => {
    const result = resolver.resolve({
      taskTitle: 'Fix issue',
      taskExternalId: 'TASK-2',
      taskSource: 'jira',
      taskDescription: null,
      executionOutput: 'PR_TITLE: Update service\nPR_BODY: Detailed body\n',
      templateBody: null,
    });

    expect(result.pullRequestTitle).toBe('Update service');
    expect(result.pullRequestBody).toBe('Detailed body');
  });

  it('uses the last PR_BODY block when output contains multiple markers', () => {
    const result = resolver.resolve({
      taskTitle: 'Fix issue',
      taskExternalId: 'TASK-2',
      taskSource: 'jira',
      taskDescription: null,
      executionOutput:
        'PR_TITLE: Update service\nPR_BODY: First body\nnoise\nPR_BODY: Second body\n',
      templateBody: null,
    });

    expect(result.pullRequestBody).toBe('Second body');
  });

  it('removes forbidden terms from commit/PR content', () => {
    const result = resolver.resolve({
      taskTitle: 'Claude AI fix',
      taskExternalId: 'TASK-3',
      taskSource: 'jira',
      taskDescription: 'anthropic details',
      executionOutput: 'PR_TITLE: Codex update\nPR_BODY: AI body',
      templateBody: null,
    });

    const forbiddenPattern = /\b(ai|anthropic|claude|codex)\b/i;
    expect(result.commitMessage).not.toMatch(forbiddenPattern);
    expect(result.pullRequestTitle).not.toMatch(forbiddenPattern);
    expect(result.pullRequestBody).not.toMatch(forbiddenPattern);
  });
});
