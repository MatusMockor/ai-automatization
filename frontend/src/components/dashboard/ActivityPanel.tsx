import { timeAgo } from '@/lib/time';
import type { ActivityItem } from '@/types';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  UserCheck,
  Package,
} from 'lucide-react';

interface ActivityPanelProps {
  activities?: ActivityItem[];
}

const icons: Record<ActivityItem['type'], { icon: React.ElementType; color: string }> = {
  execution_started: { icon: RefreshCw, color: 'text-blue-400 bg-blue-500/10' },
  execution_completed: { icon: CheckCircle, color: 'text-emerald-400 bg-emerald-500/10' },
  execution_failed: { icon: XCircle, color: 'text-red-400 bg-red-500/10' },
  user_connected: { icon: UserCheck, color: 'text-violet-400 bg-violet-500/10' },
  repo_synced: { icon: Package, color: 'text-amber-400 bg-amber-500/10' },
};

export function ActivityPanel({ activities = [] }: ActivityPanelProps) {
  return (
    <div className="flex w-[240px] shrink-0 flex-col border-l border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {activities.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">No activity yet</p>
          )}
          {activities.map((activity, i) => {
            const { icon: Icon, color } = icons[activity.type];
            return (
              <div key={activity.id} className="relative flex gap-3 px-2 py-2.5">
                {/* Timeline line */}
                {i < activities.length - 1 && (
                  <div className="absolute left-[19px] top-10 h-[calc(100%-16px)] w-px bg-border" />
                )}

                {/* Icon */}
                <div className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${color}`}>
                  <Icon className="h-3 w-3" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs font-medium leading-tight">{activity.message}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono">{activity.detail}</span>
                    <span className="opacity-40">·</span>
                    <span className="tabular-nums">{timeAgo(activity.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
