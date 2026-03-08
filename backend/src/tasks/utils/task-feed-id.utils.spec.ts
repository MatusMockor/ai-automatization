import { buildTaskFeedId } from './task-feed-id.utils';

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
});
