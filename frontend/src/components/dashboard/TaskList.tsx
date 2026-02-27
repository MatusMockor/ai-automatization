import { PrefixFilter, prefixConfig } from '@/components/shared/PrefixFilter';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { TaskStatusDot } from '@/components/shared/StatusIcon';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { TaskFeedItem, TaskPrefix, ExecutionAction } from '@/types';

interface TaskListProps {
  tasks: TaskFeedItem[];
  selectedTask: TaskFeedItem | null;
  selectedPrefix: TaskPrefix | null;
  prefixCounts: Partial<Record<TaskPrefix, number>>;
  onSelectTask: (task: TaskFeedItem) => void;
  onSelectPrefix: (prefix: TaskPrefix | null) => void;
  onAction: (action: ExecutionAction, task: TaskFeedItem) => void;
}

export function TaskList({
  tasks,
  selectedTask,
  selectedPrefix,
  prefixCounts,
  onSelectTask,
  onSelectPrefix,
  onAction,
}: TaskListProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <PrefixFilter
          selected={selectedPrefix}
          onSelect={onSelectPrefix}
          counts={prefixCounts}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No tasks match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isSelected={selectedTask?.id === task.id}
                onSelect={() => onSelectTask(task)}
                onAction={(action) => onAction(action, task)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  isSelected,
  onSelect,
  onAction,
}: {
  task: TaskFeedItem;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (action: ExecutionAction) => void;
}) {
  const cfg = task.matchedPrefix
    ? (prefixConfig[task.matchedPrefix as TaskPrefix] ?? { activeColor: 'text-muted-foreground bg-foreground/8', color: 'text-muted-foreground' })
    : null;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-start gap-4 px-5 py-3.5 text-left transition-colors',
        isSelected
          ? 'bg-primary/5'
          : 'hover:bg-foreground/[0.02]',
      )}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          {cfg && task.matchedPrefix && (
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', cfg.activeColor)}>
              {task.matchedPrefix}
            </span>
          )}
          <span className="text-[13px] font-medium leading-snug">{task.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceBadge source={task.source} />
          <span>{task.externalId}</span>
          <span className="opacity-30">·</span>
          <span>{task.assignee ?? '—'}</span>
          <span className="opacity-30">·</span>
          <div className="flex items-center gap-1">
            <TaskStatusDot status={task.status} />
            <span className="capitalize">{task.status.replace('_', ' ')}</span>
          </div>
          <span className="ml-auto tabular-nums">{timeAgo(task.updatedAt)}</span>
        </div>
      </div>

      {/* Hover actions */}
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionButtons size="sm" onAction={onAction} />
      </div>
    </button>
  );
}
