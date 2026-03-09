import type { TaskFeedItemDto } from './dto/task-feed-response.dto';

export type ResolvedTaskFeedItem = TaskFeedItemDto & {
  sourceVersion: string | null;
};
