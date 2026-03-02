import { SourceBadge } from '@/components/shared/SourceBadge';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { ExecutionHistory } from '@/components/shared/ExecutionHistory';
import { TaskStatusDot } from '@/components/shared/StatusIcon';
import { prefixConfig } from '@/components/shared/PrefixFilter';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { TaskFeedItem, TaskPrefix, Execution, ExecutionAction } from '@/types';
import { X, ExternalLink } from 'lucide-react';

interface TaskDetailProps {
  task: TaskFeedItem;
  executions: Execution[];
  onClose: () => void;
  onAction: (action: ExecutionAction) => void;
  publishPullRequest: boolean;
  onPublishPullRequestChange: (value: boolean) => void;
}

export function TaskDetail({ task, executions, onClose, onAction, publishPullRequest, onPublishPullRequestChange }: TaskDetailProps) {
  const openExternalTask = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      // ignore invalid URL
    }
  };

  const prefix = task.matchedPrefix
    ? (prefixConfig[task.matchedPrefix as TaskPrefix] ?? { activeColor: 'text-muted-foreground bg-foreground/5' })
    : null;

  return (
    <div className="flex w-[420px] shrink-0 flex-col border-l border-border bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceBadge source={task.source} />
          <span className="font-mono">{task.externalId}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Open task externally"
            onClick={() => openExternalTask(task.url)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close task details"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5">
          {/* Title */}
          <div className="mb-4">
            {prefix && task.matchedPrefix && (
              <span className={cn('mb-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', prefix.activeColor)}>
                {task.matchedPrefix}
              </span>
            )}
            <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
          </div>

          {/* Meta */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TaskStatusDot status={task.status} />
              <span className="capitalize">{task.status.replace('_', ' ')}</span>
            </div>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{task.assignee ?? '—'}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(task.updatedAt)}</span>
          </div>

          {/* Description */}
          <div className="mb-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              {task.description}
            </p>
          </div>

          {/* Actions */}
          <div className="mb-6">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Run with Claude
            </h3>
            <ActionButtons onAction={onAction} />
            <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={publishPullRequest}
                onChange={(e) => onPublishPullRequestChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              Publish pull request
            </label>
          </div>

          {/* Execution history */}
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              History
            </h3>
            {executions.length > 0 ? (
              <ExecutionHistory executions={executions} />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No executions yet. Pick an action above to get started.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
