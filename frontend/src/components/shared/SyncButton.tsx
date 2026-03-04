import { RefreshCw, Check } from 'lucide-react';
import type { SyncState } from '@/lib/useSyncRun';

interface SyncButtonProps {
  syncState: SyncState;
  onClick: () => void;
}

export function SyncButton({ syncState, onClick }: SyncButtonProps) {
  const isActive = syncState === 'starting' || syncState === 'polling';
  const isDone = syncState === 'done';

  return (
    <button
      onClick={onClick}
      disabled={syncState !== 'idle'}
      className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50"
    >
      {isActive ? (
        <>
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Syncing…</span>
        </>
      ) : isDone ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          <span>Done</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Sync</span>
        </>
      )}
    </button>
  );
}
