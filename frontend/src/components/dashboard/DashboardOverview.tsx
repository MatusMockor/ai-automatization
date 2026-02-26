import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { PrefixFilter, prefixConfig } from '@/components/shared/PrefixFilter';
import { ActionButtons } from '@/components/shared/ActionButtons';
import { RepoSelector } from '@/components/shared/RepoSelector';
import { timeAgo } from '@/lib/time';
import { mockTasks, mockExecutions, mockActivities } from '@/data/mock';
import { cn } from '@/lib/utils';
import type { TaskPrefix, ActivityItem } from '@/types';
import {
  ListTodo,
  Wrench,
  Activity,
  AlertTriangle,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  UserCheck,
  Package,
} from 'lucide-react';

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const activityIcons: Record<ActivityItem['type'], { icon: React.ElementType; color: string }> = {
  execution_started: { icon: RefreshCw, color: 'text-blue-400' },
  execution_completed: { icon: CheckCircle, color: 'text-emerald-400' },
  execution_failed: { icon: XCircle, color: 'text-red-400' },
  user_connected: { icon: UserCheck, color: 'text-violet-400' },
  repo_synced: { icon: Package, color: 'text-amber-400' },
};

export function DashboardOverview() {
  const [selectedPrefix, setSelectedPrefix] = useState<TaskPrefix | null>(null);

  const filtered = selectedPrefix
    ? mockTasks.filter((t) => t.prefix === selectedPrefix)
    : mockTasks;

  const prefixCounts = mockTasks.reduce(
    (acc, t) => {
      acc[t.prefix] = (acc[t.prefix] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<TaskPrefix, number>>,
  );

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
          <button className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5">
            <Settings className="h-4 w-4" />
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
            M
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Main */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Stats */}
          <div className="mb-6 grid grid-cols-4 gap-3">
            <StatCard label="Total Tasks" value={mockTasks.length} icon={ListTodo} gradient="from-blue-500 to-cyan-500" />
            <StatCard label="Fix Priority" value={mockTasks.filter((t) => t.prefix === 'fix' && t.status === 'open').length} icon={Wrench} gradient="from-red-500 to-rose-500" />
            <StatCard label="Running" value={mockExecutions.filter((e) => e.status === 'running').length} icon={Activity} gradient="from-emerald-500 to-green-500" />
            <StatCard label="Failed" value={mockExecutions.filter((e) => e.status === 'failed').length} icon={AlertTriangle} gradient="from-orange-500 to-amber-500" />
          </div>

          {/* Filters + tasks */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tasks</h2>
            <PrefixFilter selected={selectedPrefix} onSelect={setSelectedPrefix} counts={prefixCounts} />
          </div>

          <div className="space-y-2">
            {filtered.map((task) => {
              const cfg = prefixConfig[task.prefix];
              return (
                <Card key={task.id} className="border-border bg-card transition-all hover:border-foreground/15 hover:bg-foreground/[0.03]">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', cfg.activeColor)}>
                          {task.prefix}
                        </span>
                        <span className="text-sm font-medium">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <SourceBadge source={task.source} />
                        <span>{task.externalId}</span>
                        <span className="opacity-30">·</span>
                        <span>{task.assignee}</span>
                        <span className="opacity-30">·</span>
                        <span>{timeAgo(task.createdAt)}</span>
                      </div>
                    </div>
                    <ActionButtons size="sm" onAction={(action) => console.log(action, task.id)} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Activity feed */}
        <div className="w-[260px] shrink-0 border-l border-border">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</h2>
          </div>
          <ScrollArea className="h-full">
            <div className="space-y-0.5 p-2">
              {mockActivities.map((activity) => {
                const { icon: Icon, color } = activityIcons[activity.type];
                return (
                  <div key={activity.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-foreground/[0.02]">
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{activity.message}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {activity.detail} · {timeAgo(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
