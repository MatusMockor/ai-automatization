import { cn } from '@/lib/utils';
import type { ReviewGateStatus } from '@/types';

const badgeConfig: Partial<Record<ReviewGateStatus, { label: string; className: string }>> = {
  review_running: { label: 'Review Running', className: 'bg-indigo-500/10 text-indigo-400' },
  awaiting_decision: { label: 'Awaiting Decision', className: 'bg-amber-500/10 text-amber-500' },
  decision_continue: { label: 'Continued', className: 'bg-emerald-500/10 text-emerald-400' },
  decision_block: { label: 'Blocked', className: 'bg-red-500/10 text-red-400' },
  remediation_running: { label: 'Remediation', className: 'bg-orange-500/10 text-orange-400' },
  review_passed: { label: 'Review Passed', className: 'bg-emerald-500/10 text-emerald-400' },
  timeout_continue: { label: 'Timeout Continue', className: 'bg-muted-foreground/10 text-muted-foreground' },
};

export function ReviewGateStatusBadge({ status }: { status: ReviewGateStatus }) {
  const config = badgeConfig[status];
  if (!config) return null;
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', config.className)}>
      {config.label}
    </span>
  );
}
