import { ExecutionStatusIcon } from './StatusIcon';
import { timeAgo } from '@/lib/time';
import type { Execution } from '@/types';

const isSafeExternalUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

interface ExecutionHistoryProps {
  executions: Execution[];
  compact?: boolean;
}

const actionLabels: Record<string, string> = {
  fix: 'Fix',
  feature: 'Feature',
  plan: 'Plan',
};

export function ExecutionHistory({ executions, compact = false }: ExecutionHistoryProps) {
  if (executions.length === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {executions.slice(0, 4).map((exec) => (
          <div key={exec.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ExecutionStatusIcon status={exec.status} />
            <span className="font-medium">{actionLabels[exec.action]}</span>
            <span className="opacity-50">{timeAgo(exec.createdAt)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {executions.map((exec) => (
        <div
          key={exec.id}
          className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-foreground/3"
        >
          <ExecutionStatusIcon status={exec.status} />
          <span className="text-sm font-medium">{actionLabels[exec.action]}</span>
          <span className="text-xs text-muted-foreground">{exec.taskExternalId}</span>
          <span className="ml-auto text-xs text-muted-foreground">{timeAgo(exec.createdAt)}</span>
          {exec.automationStatus === 'published' && exec.pullRequestUrl && isSafeExternalUrl(exec.pullRequestUrl) && (
            <a href={exec.pullRequestUrl} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
              PR
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
