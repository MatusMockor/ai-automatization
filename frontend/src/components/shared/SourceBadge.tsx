import type { TaskSource } from '@/types';

const config: Record<TaskSource, { label: string; bg: string; dot: string }> = {
  jira: { label: 'Jira', bg: 'bg-blue-500/8 text-blue-400', dot: 'bg-blue-400' },
  asana: { label: 'Asana', bg: 'bg-rose-500/8 text-rose-400', dot: 'bg-rose-400' },
  manual: { label: 'Manual', bg: 'bg-slate-500/8 text-slate-400', dot: 'bg-slate-400' },
};

export function SourceBadge({ source, showLabel = true }: { source: TaskSource; showLabel?: boolean }) {
  const c = config[source];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {showLabel && c.label}
    </span>
  );
}
