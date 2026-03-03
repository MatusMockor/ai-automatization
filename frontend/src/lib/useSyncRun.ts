import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '@/lib/api';
import type { StartSyncResponse, SyncRun } from '@/types';

export type SyncState = 'idle' | 'starting' | 'polling' | 'done' | 'failed';

export interface SyncProgress {
  connectionsTotal: number;
  connectionsDone: number;
  tasksUpserted: number;
  tasksDeleted: number;
}

const INITIAL_PROGRESS: SyncProgress = {
  connectionsTotal: 0,
  connectionsDone: 0,
  tasksUpserted: 0,
  tasksDeleted: 0,
};

interface UseSyncRunOptions {
  onComplete: () => void;
}

export function useSyncRun({ onComplete }: UseSyncRunOptions) {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress>(INITIAL_PROGRESS);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!runId || syncState !== 'polling') return;

    const interval = setInterval(async () => {
      try {
        const { data } = await api.get<SyncRun>(`/tasks/sync-runs/${runId}`);

        setProgress({
          connectionsTotal: data.connectionsTotal,
          connectionsDone: data.connectionsDone,
          tasksUpserted: data.tasksUpserted,
          tasksDeleted: data.tasksDeleted,
        });

        if (data.status === 'completed') {
          clearInterval(interval);
          setSyncState('done');
          onCompleteRef.current();
          setTimeout(() => {
            setSyncState((s) => (s === 'done' ? 'idle' : s));
          }, 3000);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setSyncState('failed');
          toast.error(data.errorMessage ?? 'Task sync failed');
          setTimeout(() => {
            setSyncState((s) => (s === 'failed' ? 'idle' : s));
          }, 5000);
        }
      } catch {
        // Swallow network errors — retry on next tick
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runId, syncState]);

  const triggerSync = useCallback(async () => {
    if (syncState !== 'idle') return;
    setSyncState('starting');
    setProgress(INITIAL_PROGRESS);
    try {
      const { data } = await api.post<StartSyncResponse>('/tasks/sync');
      setRunId(data.runId);
      setSyncState('polling');
    } catch (err) {
      setSyncState('idle');
      toast.error(getApiErrorMessage(err, 'Failed to start sync'));
    }
  }, [syncState]);

  return { syncState, progress, triggerSync };
}
