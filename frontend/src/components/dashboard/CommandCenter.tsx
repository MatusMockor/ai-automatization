import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { PrefixFilter, prefixConfig } from "@/components/shared/PrefixFilter";
import { ActionButtons } from "@/components/shared/ActionButtons";
import { ExecutionHistory } from "@/components/shared/ExecutionHistory";
import { RepoSelector } from "@/components/shared/RepoSelector";
import { TaskStatusDot } from "@/components/shared/StatusIcon";
import { timeAgo } from "@/lib/time";
import { mockTasks, mockExecutions } from "@/data/mock";
import { cn } from "@/lib/utils";
import type { Task, TaskPrefix } from "@/types";
import { LayoutDashboard, Settings, Activity, Search } from "lucide-react";

export function CommandCenter() {
  const [selectedPrefix, setSelectedPrefix] = useState<TaskPrefix | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(
    mockTasks[0] ?? null,
  );

  const filtered = selectedPrefix
    ? mockTasks.filter((t) => t.prefix === selectedPrefix)
    : mockTasks;

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedTask(null);
      return;
    }
    setSelectedTask(
      (current) => filtered.find((t) => t.id === current?.id) ?? filtered[0],
    );
  }, [filtered]);

  const taskExecutions = selectedTask
    ? mockExecutions.filter((e) => e.taskId === selectedTask.id)
    : [];
  const runningCount = mockExecutions.filter(
    (e) => e.status === "running",
  ).length;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="flex w-[200px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-500">
            <span className="text-sm font-bold text-white">A</span>
          </div>
          <span className="text-sm font-semibold">AI Auto</span>
        </div>

        <div className="px-3 pb-3">
          <RepoSelector />
        </div>

        <div className="h-px bg-border" />

        <nav className="flex-1 space-y-0.5 p-2">
          <button className="flex w-full items-center gap-2 rounded-lg bg-foreground/5 px-3 py-2 text-sm font-medium">
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
            Dashboard
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/[0.03]">
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </nav>

        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs ring-1 ring-blue-500/20">
            <Activity className="h-3.5 w-3.5 text-blue-400" />
            <span className="font-medium text-blue-400">
              {runningCount} running
            </span>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex w-2/5 flex-col border-r border-border">
        <div className="border-b border-border p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks..."
              className="h-8 w-full rounded-lg bg-foreground/5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring/30"
            />
          </div>
          <PrefixFilter
            selected={selectedPrefix}
            onSelect={setSelectedPrefix}
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="divide-y divide-border">
            {filtered.map((task) => (
              <button
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={cn(
                  "relative flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors",
                  selectedTask?.id === task.id
                    ? "bg-primary/5"
                    : "hover:bg-foreground/[0.02]",
                )}
              >
                {selectedTask?.id === task.id && (
                  <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                )}
                <div className="flex items-center gap-2">
                  <SourceBadge source={task.source} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {task.externalId}
                  </span>
                </div>
                <span className="text-sm font-medium">{task.title}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{task.assignee}</span>
                  <span className="opacity-30">·</span>
                  <span>{timeAgo(task.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Detail Panel */}
      <div className="flex flex-1 flex-col">
        {selectedTask ? (
          <>
            <div className="border-b border-border p-5">
              <span
                className={cn(
                  "mb-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  prefixConfig[selectedTask.prefix].activeColor,
                )}
              >
                {selectedTask.prefix}
              </span>
              <h2 className="mb-2 text-lg font-semibold">
                {selectedTask.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SourceBadge source={selectedTask.source} />
                <span>{selectedTask.externalId}</span>
                <span className="opacity-30">·</span>
                <span>{selectedTask.assignee}</span>
                <span className="opacity-30">·</span>
                <div className="flex items-center gap-1">
                  <TaskStatusDot status={selectedTask.status} />
                  <span className="capitalize">{selectedTask.status}</span>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-5">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-foreground/80">
                  {selectedTask.description}
                </p>

                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Run with Claude
                </h3>
                <div className="mb-6">
                  <ActionButtons
                    onAction={(action) => console.log(action, selectedTask.id)}
                  />
                </div>

                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  History
                </h3>
                <ExecutionHistory executions={taskExecutions} />
                {taskExecutions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No executions yet
                  </p>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a task to view details
          </div>
        )}
      </div>
    </div>
  );
}
