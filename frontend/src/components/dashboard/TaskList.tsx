import { SourceBadge } from '@/components/shared/SourceBadge';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { TaskStatusDot } from '@/components/shared/StatusIcon';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import type { TaskFeedItem, ExecutionAction } from '@/types';


interface TaskListProps {
  tasks: TaskFeedItem[];
  selectedTask: TaskFeedItem | null;
  onSelectTask: (task: TaskFeedItem) => void;
  onAction: (action: ExecutionAction, task: TaskFeedItem) => void;
  onSyncRequest?: () => void;
  hasScopeFilter?: boolean;
  isSyncing?: boolean;
}

export function TaskList({
  tasks,
  selectedTask,
  onSelectTask,
  onAction,
  onSyncRequest,
  hasScopeFilter,
  isSyncing,
}: TaskListProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-end border-b border-border px-5 py-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            {!hasScopeFilter && onSyncRequest ? (
              <>
                <RefreshCw className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Run a sync to import tasks from your connections
                </p>
                <button
                  onClick={onSyncRequest}
                  disabled={isSyncing}
                  className="mt-1 flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Run Sync
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No tasks match your filters</p>
            )}
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
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={cn(
        'group relative flex w-full cursor-pointer items-start gap-4 px-5 py-3.5 text-left transition-colors',
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
          <span className="text-[13px] font-medium leading-snug">{task.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceBadge source={task.source} />
          {task.automationState === 'drafted' && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                task.draftStatus === 'superseded'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-amber-500/15 text-amber-500',
              )}
              title={task.matchedRuleName ?? undefined}
            >
              {task.draftStatus === 'superseded' ? 'Draft superseded' : 'Draft ready'}
            </span>
          )}
          {task.automationState === 'matched' && (
            <span
              className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400"
              title={task.matchedRuleName ?? undefined}
            >
              Matched
            </span>
          )}
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
    </div>
  );
}
