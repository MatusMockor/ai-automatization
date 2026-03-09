import {
  buildManualTaskFeedId,
  buildTaskFeedId,
  extractManualTaskId,
  extractTaskFeedIdentity,
} from './task-feed-id.utils';

describe('buildTaskFeedId', () => {
  it('builds a stable task feed identifier from connection, provider, and external id', () => {
    expect(
      buildTaskFeedId({
        connectionId: 'connection-123',
        provider: 'jira',
        externalId: 'SCRUM-42',
      }),
    ).toBe('connection-123:jira:SCRUM-42');
  });

  it('builds and parses manual task feed identifiers', () => {
    const taskId = buildManualTaskFeedId('manual-task-1');

    expect(taskId).toBe('manual:manual-task-1');
    expect(extractManualTaskId(taskId)).toBe('manual-task-1');
    expect(extractManualTaskId('connection-123:jira:SCRUM-42')).toBeNull();
  });

  it('rejects empty manual task identifiers', () => {
    expect(() => buildManualTaskFeedId('   ')).toThrow(
      'Manual task id must not be empty',
    );
  });

  it('parses provider task feed identifiers', () => {
    expect(
      extractTaskFeedIdentity('connection-123:jira:SCRUM-42'),
    ).toStrictEqual({
      connectionId: 'connection-123',
      provider: 'jira',
      externalId: 'SCRUM-42',
    });
  });

  it('returns null for unsupported or malformed provider task identifiers', () => {
    expect(extractTaskFeedIdentity('manual:task-1')).toBeNull();
    expect(extractTaskFeedIdentity('connection-123:manual:task-1')).toBeNull();
    expect(extractTaskFeedIdentity('connection-123:jira:')).toBeNull();
  });
});
