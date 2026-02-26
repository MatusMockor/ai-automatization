import { useState, useMemo } from 'react';
import { StatsBar } from './StatsBar';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';
import { ActivityPanel } from './ActivityPanel';
import { TerminalPanel } from './TerminalPanel';
import { mockTasks, mockExecutions, mockActivities } from '@/data/mock';
import type { Task, TaskPrefix, ExecutionAction } from '@/types';
import { Search } from 'lucide-react';

export function Dashboard() {
  const [selectedPrefix, setSelectedPrefix] = useState<TaskPrefix | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);

  const activeExecution = mockExecutions.find((e) => e.status === 'running');
  const runningCount = mockExecutions.filter((e) => e.status === 'running').length;
  const completedCount = mockExecutions.filter((e) => e.status === 'completed').length;
  const failedCount = mockExecutions.filter((e) => e.status === 'failed').length;
  const openTasks = mockTasks.filter((t) => t.status === 'open').length;

  const filteredTasks = useMemo(() => {
    let tasks = mockTasks;
    if (selectedPrefix) tasks = tasks.filter((t) => t.prefix === selectedPrefix);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.externalId.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q),
      );
    }
    return tasks;
  }, [selectedPrefix, searchQuery]);

  const prefixCounts = useMemo(() => {
    const counts: Partial<Record<TaskPrefix, number>> = {};
    for (const t of mockTasks) {
      counts[t.prefix] = (counts[t.prefix] ?? 0) + 1;
    }
    return counts;
  }, []);

  const taskExecutions = useMemo(
    () => (selectedTask ? mockExecutions.filter((e) => e.taskId === selectedTask.id) : []),
    [selectedTask],
  );

  const handleAction = (action: ExecutionAction, task: Task) => {
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

      {/* Content */}
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
          <ActivityPanel activities={mockActivities} />
        )}
      </div>

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
