import { useState, useMemo, useEffect } from 'react';
import { StatsBar } from './StatsBar';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';
import { ActivityPanel } from './ActivityPanel';
import { TerminalPanel } from './TerminalPanel';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { TaskFeedItem, TaskFeedConnectionError, TaskFeedResponse, TaskPrefix, ExecutionAction, Execution, ActivityItem } from '@/types';
import { ALL_PREFIXES } from '@/types';
import { Search, AlertTriangle } from 'lucide-react';

const getApiErrorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function Dashboard() {
  const [selectedPrefix, setSelectedPrefix] = useState<TaskPrefix | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskFeedItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);

  const [tasks, setTasks] = useState<TaskFeedItem[]>([]);
  const [feedErrors, setFeedErrors] = useState<TaskFeedConnectionError[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const executions: Execution[] = [];
  const activities: ActivityItem[] = [];

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoadError(null);
        const { data } = await api.get<TaskFeedResponse>('/tasks');
        setTasks(data.items);
        setFeedErrors(data.errors);
      } catch (err) {
        const message = getApiErrorMessage(err, 'Failed to load tasks');
        setLoadError(message);
        setTasks([]);
        setFeedErrors([]);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, []);

  const activeExecution = executions.find((e) => e.status === 'running');
  const runningCount = executions.filter((e) => e.status === 'running').length;
  const completedCount = executions.filter((e) => e.status === 'completed').length;
  const failedCount = executions.filter((e) => e.status === 'failed').length;
  const openTasks = tasks.filter((t) => t.status === 'open').length;

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (selectedPrefix) filtered = filtered.filter((t) => t.matchedPrefix === selectedPrefix);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.externalId.toLowerCase().includes(q) ||
          (t.assignee ?? '').toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [tasks, selectedPrefix, searchQuery]);

  const prefixCounts = useMemo(() => {
    const counts: Partial<Record<TaskPrefix, number>> = {};
    for (const t of tasks) {
      if (t.matchedPrefix && (ALL_PREFIXES as readonly string[]).includes(t.matchedPrefix)) {
        const key = t.matchedPrefix as TaskPrefix;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [tasks]);

  const taskExecutions = useMemo(
    () => (selectedTask ? executions.filter((e) => e.taskId === selectedTask.id) : []),
    [executions, selectedTask],
  );

  const handleAction = (action: ExecutionAction, task: TaskFeedItem) => {
    console.log(`[${action}]`, task.externalId, task.title);
    setTerminalOpen(true);
  };

  const stats = [
    { label: 'Open Tasks', value: openTasks, color: 'bg-blue-400' },
    { label: 'Running', value: runningCount, color: 'bg-emerald-400', change: runningCount > 0 ? 'live' : undefined },
    { label: 'Completed', value: completedCount, color: 'bg-violet-400' },
    { label: 'Failed', value: failedCount, color: 'bg-red-400' },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="h-8 w-full rounded-lg bg-foreground/5 pl-9 pr-3 text-sm outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/50 focus:bg-foreground/8 focus:ring-ring/30"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            /
          </kbd>
        </div>

        {runningCount > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-lg bg-blue-500/10 px-2.5 py-1 ring-1 ring-blue-500/20">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
            </span>
            <span className="text-[11px] font-medium text-blue-400">{runningCount} running</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading tasks...</span>
        </div>
      )}

      {/* Error banner */}
      {!loading && (loadError || feedErrors.length > 0) && (
        <div className="mx-5 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-500">
                {loadError ?? 'Some connections failed to load tasks'}
              </p>
              {!loadError && (
                <ul className="mt-1 space-y-0.5">
                  {feedErrors.map((error) => (
                    <li key={error.connectionId} className="text-xs text-amber-500/80">
                      {error.provider}: {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <TaskList
              tasks={filteredTasks}
              selectedTask={selectedTask}
              selectedPrefix={selectedPrefix}
              prefixCounts={prefixCounts}
              onSelectTask={setSelectedTask}
              onSelectPrefix={setSelectedPrefix}
              onAction={handleAction}
            />
          </div>

          {selectedTask ? (
            <TaskDetail
              task={selectedTask}
              executions={taskExecutions}
              onClose={() => setSelectedTask(null)}
              onAction={(action) => handleAction(action, selectedTask)}
            />
          ) : (
            <ActivityPanel activities={activities} />
          )}
        </div>
      )}

      {/* Terminal */}
      {activeExecution && (
        <TerminalPanel
          execution={activeExecution}
          isOpen={terminalOpen}
          onToggle={() => setTerminalOpen(!terminalOpen)}
        />
      )}
    </div>
  );
}
