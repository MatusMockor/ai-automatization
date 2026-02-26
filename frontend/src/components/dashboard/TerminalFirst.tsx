import { useState, useEffect, useCallback } from "react";
import { PrefixFilter, prefixConfig } from "@/components/shared/PrefixFilter";
import { SourceBadge } from "@/components/shared/SourceBadge";
import {
  TaskStatusDot,
  ExecutionStatusIcon,
} from "@/components/shared/StatusIcon";
import { timeAgo } from "@/lib/time";
import { mockTasks, mockExecutions } from "@/data/mock";
import { cn } from "@/lib/utils";
import type { TaskPrefix } from "@/types";
import { Square, Search, Copy } from "lucide-react";

export function TerminalFirst() {
  const [selectedPrefix, setSelectedPrefix] = useState<TaskPrefix | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = selectedPrefix
    ? mockTasks.filter((t) => t.prefix === selectedPrefix)
    : mockTasks;

  const activeExecution = mockExecutions.find((e) => e.status === "running");

  const displayTasks = searchQuery
    ? filtered.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : filtered;

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(displayTasks.length - 1, 0)));
  }, [displayTasks.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (searchOpen) return;
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            Math.min(i + 1, Math.max(displayTasks.length - 1, 0)),
          );
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "/":
          e.preventDefault();
          setSearchOpen(true);
          break;
      }
    },
    [displayTasks.length, searchOpen],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [selectedPrefix]);

  return (
    <div className="flex h-screen flex-col bg-background font-mono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-blue-500">
            <span className="text-[10px] font-bold text-white">A</span>
          </div>
          <span className="text-muted-foreground">~/</span>
          <span className="font-semibold">myapp/frontend</span>
        </div>
        <PrefixFilter selected={selectedPrefix} onSelect={setSelectedPrefix} />
      </div>

      {/* Table */}
      <div className="flex flex-[6] flex-col overflow-hidden border-b border-border">
        {searchOpen && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                }
              }}
              placeholder="Filter..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <span className="text-[10px] text-muted-foreground">ESC</span>
          </div>
        )}

        {/* Header row */}
        <div className="grid grid-cols-[50px_60px_72px_1fr_80px_50px] gap-2 border-b border-border px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Status</span>
          <span>Source</span>
          <span>ID</span>
          <span>Title</span>
          <span>Assignee</span>
          <span className="text-right">Age</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayTasks.map((task, index) => {
            const cfg = prefixConfig[task.prefix];
            return (
              <button
                key={task.id}
                onClick={() => setSelectedIndex(index)}
                className={cn(
                  "relative grid w-full grid-cols-[50px_60px_72px_1fr_80px_50px] gap-2 px-4 py-2 text-left text-[13px] transition-colors",
                  index === selectedIndex
                    ? "bg-primary/5"
                    : "hover:bg-foreground/[0.02]",
                )}
              >
                {index === selectedIndex && (
                  <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                )}
                <span className="flex items-center gap-1.5">
                  <TaskStatusDot status={task.status} />
                </span>
                <span>
                  <SourceBadge source={task.source} showLabel={false} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {task.externalId}
                </span>
                <span
                  className={cn(
                    "truncate",
                    index === selectedIndex && "text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "mr-1.5 text-[11px] font-semibold uppercase",
                      cfg.color,
                    )}
                  >
                    {task.prefix}
                  </span>
                  {task.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {task.assignee}
                </span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {timeAgo(task.createdAt)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Keyboard bar */}
      <div className="flex items-center gap-4 bg-card/50 px-4 py-1.5 text-[10px] text-muted-foreground">
        {[
          ["F", "Fix"],
          ["E", "Feature"],
          ["P", "Plan"],
          ["/", "Search"],
          ["J/K", "Nav"],
        ].map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
              {key}
            </kbd>
            {label}
          </span>
        ))}
      </div>

      {/* Terminal */}
      <div className="flex flex-[4] flex-col dark:bg-[#141922] bg-[#f4f5f7]">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">TERMINAL</span>
            {activeExecution && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <ExecutionStatusIcon status={activeExecution.status} />
                <span className="font-medium">
                  {activeExecution.taskExternalId}
                </span>
                <span className="text-muted-foreground">
                  {activeExecution.action}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeExecution?.status === "running" && (
              <button
                type="button"
                className="flex items-center gap-1 rounded px-2 py-0.5 text-red-400 hover:bg-red-500/10"
              >
                <Square className="h-3 w-3" /> Stop
              </button>
            )}
            <button
              type="button"
              aria-label="Copy terminal output"
              onClick={() =>
                void navigator.clipboard.writeText(
                  activeExecution?.output ?? "",
                )
              }
              className="rounded p-1 text-muted-foreground hover:bg-foreground/5"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 text-[13px] leading-relaxed">
          {activeExecution ? (
            <>
              <pre className="whitespace-pre-wrap dark:text-emerald-300/80 text-emerald-700">
                {activeExecution.output}
              </pre>
              {activeExecution.status === "running" && (
                <span className="inline-block h-4 w-1.5 animate-pulse dark:bg-emerald-400/60 bg-emerald-600/60" />
              )}
            </>
          ) : (
            <span className="text-muted-foreground/50">
              Select a task and press F, E, or P...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
