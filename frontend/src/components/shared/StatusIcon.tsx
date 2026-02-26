import type { ExecutionStatus, TaskStatus } from '@/types';

export function ExecutionStatusIcon({ status }: { status: ExecutionStatus }) {
  switch (status) {
    case 'completed':
      return (
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      );
    case 'failed':
      return (
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-red-400" />
        </span>
      );
    case 'running':
      return (
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-blue-400/40" />
          <span className="relative h-2 w-2 rounded-full bg-blue-400" />
        </span>
      );
    case 'pending':
      return (
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
        </span>
      );
    case 'cancelled':
      return (
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        </span>
      );
  }
}

const statusColors: Record<TaskStatus, string> = {
  open: 'bg-emerald-400',
  in_progress: 'bg-blue-400',
  done: 'bg-muted-foreground/50',
  closed: 'bg-muted-foreground/30',
};

export function TaskStatusDot({ status }: { status: TaskStatus }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColors[status]}`} />;
}
