import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { ExecutionHistory } from '@/components/shared/ExecutionHistory';
import { RepoSelector } from '@/components/shared/RepoSelector';
import { prefixConfig } from '@/components/shared/PrefixFilter';
import { timeAgo } from '@/lib/time';
import { mockTasks, mockExecutions, ALL_PREFIXES } from '@/data/mock';
import type { Task } from '@/types';
import { cn } from '@/lib/utils';

export function KanbanBoard() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const runningCount = mockExecutions.filter((e) => e.status === 'running').length;

  const columns = ALL_PREFIXES.map((prefix) => ({
    prefix,
    tasks: mockTasks.filter((t) => t.prefix === prefix),
  })).filter((col) => col.tasks.length > 0);

  const taskExecutions = selectedTask
    ? mockExecutions.filter((e) => e.taskId === selectedTask.id)
    : [];

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-500">
            <span className="text-sm font-bold text-white">A</span>
          </div>
          <span className="text-sm font-semibold">AI Automatization</span>
        </div>
        <div className="flex items-center gap-3">
          <RepoSelector />
          {runningCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-xs ring-1 ring-blue-500/20">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
              </span>
              <span className="font-medium text-blue-400">{runningCount} running</span>
            </div>
          )}
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
            M
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="flex flex-1 gap-5 overflow-x-auto p-5">
        {columns.map((col) => {
          const cfg = prefixConfig[col.prefix];
          return (
            <div key={col.prefix} className="flex w-[280px] shrink-0 flex-col">
              <div className="mb-3 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cfg.activeColor}`}>
                  {col.prefix}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{col.tasks.length}</span>
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-1">
                  {col.tasks.map((task) => (
                    <Card
                      key={task.id}
                      className="cursor-pointer border-border bg-card transition-all hover:border-foreground/15 hover:bg-foreground/[0.03]"
                      onClick={() => setSelectedTask(task)}
                    >
                      <CardContent className="p-3.5">
                        <div className="mb-2 flex items-center gap-2">
                          <SourceBadge source={task.source} />
                          <span className="font-mono text-[11px] text-muted-foreground">{task.externalId}</span>
                        </div>
                        <p className="mb-3 text-sm font-medium leading-snug">{task.title}</p>
                        <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{task.assignee}</span>
                          <span>{timeAgo(task.createdAt)}</span>
                        </div>
                        <ActionButtons size="sm" onAction={(action) => console.log(action, task.id)} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      <Dialog open={selectedTask !== null} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-md border-border bg-card">
          {selectedTask && (
            <>
              <DialogHeader>
                <div className="mb-1 flex items-center gap-2">
                  <SourceBadge source={selectedTask.source} />
                  <span className="font-mono text-xs text-muted-foreground">{selectedTask.externalId}</span>
                </div>
                <DialogTitle className="text-base">{selectedTask.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-foreground/80">{selectedTask.description}</p>
                <ActionButtons onAction={(action) => console.log(action, selectedTask.id)} />
                {taskExecutions.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">History</h4>
                    <ExecutionHistory executions={taskExecutions} />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
