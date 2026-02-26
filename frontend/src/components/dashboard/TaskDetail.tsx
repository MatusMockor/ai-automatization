import { SourceBadge } from '@/components/shared/SourceBadge';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { ExecutionHistory } from '@/components/shared/ExecutionHistory';
import { TaskStatusDot } from '@/components/shared/StatusIcon';
import { prefixConfig } from '@/components/shared/PrefixFilter';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { Task, Execution, ExecutionAction } from '@/types';
import { X, ExternalLink } from 'lucide-react';

interface TaskDetailProps {
  task: Task;
  executions: Execution[];
  onClose: () => void;
  onAction: (action: ExecutionAction) => void;
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'text-red-400 bg-red-500/10 ring-red-500/20' },
  high: { label: 'High', color: 'text-orange-400 bg-orange-500/10 ring-orange-500/20' },
  medium: { label: 'Medium', color: 'text-amber-400 bg-amber-500/10 ring-amber-500/20' },
  low: { label: 'Low', color: 'text-muted-foreground bg-foreground/5 ring-foreground/10' },
};

export function TaskDetail({ task, executions, onClose, onAction }: TaskDetailProps) {
  const prefix = prefixConfig[task.prefix];
  const priority = priorityConfig[task.priority];

  return (
    <div className="flex w-[420px] shrink-0 flex-col border-l border-border bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceBadge source={task.source} />
          <span className="font-mono">{task.externalId}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
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
            <span className={cn('mb-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', prefix.activeColor)}>
              {task.prefix}
            </span>
            <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
          </div>

          {/* Meta */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1', priority.color)}>
              {priority.label}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TaskStatusDot status={task.status} />
              <span className="capitalize">{task.status.replace('_', ' ')}</span>
            </div>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{task.assignee}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(task.createdAt)}</span>
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
