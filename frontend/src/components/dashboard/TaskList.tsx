import { PrefixFilter, prefixConfig } from '@/components/shared/PrefixFilter';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { TaskStatusDot } from '@/components/shared/StatusIcon';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { Task, TaskPrefix, ExecutionAction } from '@/types';

interface TaskListProps {
  tasks: Task[];
  selectedTask: Task | null;
  selectedPrefix: TaskPrefix | null;
  prefixCounts: Partial<Record<TaskPrefix, number>>;
  onSelectTask: (task: Task) => void;
  onSelectPrefix: (prefix: TaskPrefix | null) => void;
  onAction: (action: ExecutionAction, task: Task) => void;
}

const priorityIndicator: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-amber-400',
  low: 'bg-muted-foreground/30',
};

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
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (action: ExecutionAction) => void;
}) {
  const cfg = prefixConfig[task.prefix];

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

      {/* Priority dot */}
      <div className="mt-2 flex flex-col items-center gap-1">
        <span className={cn('h-2 w-2 rounded-full', priorityIndicator[task.priority])} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', cfg.activeColor)}>
            {task.prefix}
          </span>
          <span className="text-[13px] font-medium leading-snug">{task.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceBadge source={task.source} />
          <span>{task.externalId}</span>
          <span className="opacity-30">·</span>
          <span>{task.assignee}</span>
          <span className="opacity-30">·</span>
          <div className="flex items-center gap-1">
            <TaskStatusDot status={task.status} />
            <span className="capitalize">{task.status.replace('_', ' ')}</span>
          </div>
          <span className="ml-auto tabular-nums">{timeAgo(task.createdAt)}</span>
        </div>
      </div>

      {/* Hover actions */}
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionButtons size="sm" onAction={onAction} />
      </div>
    </button>
  );
}
