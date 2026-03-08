import {
  resolveManualTaskSnapshotVersion,
  resolveTaskSnapshotVersion,
} from './task-snapshot-version.utils';

describe('resolveTaskSnapshotVersion', () => {
  it('returns the provider timestamp when present', () => {
    const sourceUpdatedAt = new Date('2026-03-21T10:00:00.000Z');

    expect(
      resolveTaskSnapshotVersion({
        sourceUpdatedAt,
      }),
    ).toEqual(sourceUpdatedAt);
  });

  it('returns null when the provider does not supply an updated timestamp', () => {
    expect(
      resolveTaskSnapshotVersion({
        sourceUpdatedAt: null,
      }),
    ).toBeNull();
  });

  it('uses manual task contentUpdatedAt as the snapshot version', () => {
    const contentUpdatedAt = new Date('2026-03-21T11:30:00.000Z');

    expect(
      resolveManualTaskSnapshotVersion({
        contentUpdatedAt,
      }),
    ).toEqual(contentUpdatedAt);
  });
});
