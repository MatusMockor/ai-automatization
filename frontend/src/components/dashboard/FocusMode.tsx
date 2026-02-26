import { useState, useEffect, useCallback } from 'react';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { PrefixFilter, prefixConfig } from '@/components/shared/PrefixFilter';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { ExecutionHistory } from '@/components/shared/ExecutionHistory';
import { RepoSelector } from '@/components/shared/RepoSelector';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { Task, TaskPrefix, Execution } from '@/types';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export function FocusMode() {
  const tasks: Task[] = [];
  const executions: Execution[] = [];
  const [selectedPrefix, setSelectedPrefix] = useState<TaskPrefix | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const filtered = selectedPrefix
    ? tasks.filter((t) => t.prefix === selectedPrefix)
    : tasks;

  const task = filtered[currentIndex];
  const taskExecutions = task
    ? executions.filter((e) => e.taskId === task.id)
    : [];

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, filtered.length - 1));
  }, [filtered.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'j' || e.key === 'ArrowRight') goNext();
      if (e.key === 'k' || e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  useEffect(() => { setCurrentIndex(0); }, [selectedPrefix]);

  if (!task) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        No tasks yet
      </div>
    );
  }

  const cfg = prefixConfig[task.prefix];
  const priorityColors: Record<string, string> = {
    low: 'text-muted-foreground',
    medium: 'text-amber-400',
    high: 'text-orange-400',
    critical: 'text-red-400',
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-500">
            <span className="text-sm font-bold text-white">A</span>
          </div>
          <span className="text-sm font-semibold">AI Auto</span>
        </div>
        <div className="flex items-center gap-3">
          <RepoSelector />
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 disabled:opacity-20"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[50px] text-center text-xs font-medium tabular-nums">
              {currentIndex + 1} / {filtered.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex === filtered.length - 1}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 disabled:opacity-20"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
            M
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <PrefixFilter selected={selectedPrefix} onSelect={setSelectedPrefix} />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="h-7 rounded-lg bg-foreground/5 pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring/30"
          />
        </div>
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <div className="mb-5 flex items-center justify-center gap-2">
            <SourceBadge source={task.source} />
            <span className="font-mono text-xs text-muted-foreground">{task.externalId}</span>
          </div>

          <div className="mb-2 text-center">
            <span className={cn('mb-2 inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', cfg.activeColor)}>
              {task.prefix}
            </span>
          </div>

          <h1 className="mb-6 text-center text-2xl font-bold leading-snug">{task.title}</h1>

          <p className="mb-8 text-center text-sm leading-relaxed text-foreground/70">
            {task.description}
          </p>

          <div className="mb-8 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>{task.assignee}</span>
            <span className="opacity-30">·</span>
            <span className={cn('capitalize', priorityColors[task.priority])}>{task.priority}</span>
            <span className="opacity-30">·</span>
            <span>{timeAgo(task.createdAt)}</span>
          </div>

          <div className="flex justify-center">
            <ActionButtons onAction={(action) => console.log(action, task.id)} />
          </div>
        </div>
      </div>

      {/* History bar */}
      <div className="border-t border-border px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </span>
          {taskExecutions.length > 0 ? (
            <ExecutionHistory executions={taskExecutions} compact />
          ) : (
            <span className="text-[11px] text-muted-foreground/50">No executions yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
