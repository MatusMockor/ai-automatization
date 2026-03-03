import { Check } from 'lucide-react';
import type { SyncState, SyncProgress } from '@/lib/useSyncRun';

interface SyncBannerProps {
  syncState: SyncState;
  progress: SyncProgress;
}

export function SyncBanner({ syncState, progress }: SyncBannerProps) {
  if (syncState === 'idle' || syncState === 'failed') return null;

  const isDone = syncState === 'done';
  const borderColor = isDone ? 'border-emerald-500/20' : 'border-blue-500/20';
  const bgColor = isDone ? 'bg-emerald-500/5' : 'bg-blue-500/5';
  const textColor = isDone ? 'text-emerald-500' : 'text-blue-500';

  let message: string;
  if (isDone) {
    message = `Sync complete — ${progress.tasksUpserted} task${progress.tasksUpserted !== 1 ? 's' : ''} updated`;
  } else if (syncState === 'starting') {
    message = 'Starting sync…';
  } else if (progress.connectionsTotal > 0) {
    message = `Syncing… ${progress.connectionsDone}/${progress.connectionsTotal} connections`;
  } else {
    message = 'Syncing…';
  }

  return (
    <div className={`mx-5 mt-3 rounded-lg border ${borderColor} ${bgColor} px-4 py-2.5`}>
      <div className="flex items-center gap-2">
        {isDone ? (
          <Check className={`h-4 w-4 shrink-0 ${textColor}`} />
        ) : (
          <div className={`h-4 w-4 shrink-0 animate-spin rounded-full border-2 ${textColor} border-t-transparent`}
            style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }} />
        )}
        <p className={`text-sm font-medium ${textColor}`}>{message}</p>
      </div>
    </div>
  );
}
