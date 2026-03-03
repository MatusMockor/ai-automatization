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

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const { data } = await api.get<SyncRun>(`/tasks/sync-runs/${runId}`);

        if (cancelled) return;

        setProgress({
          connectionsTotal: data.connectionsTotal,
          connectionsDone: data.connectionsDone,
          tasksUpserted: data.tasksUpserted,
          tasksDeleted: data.tasksDeleted,
        });

        if (data.status === 'completed') {
          setSyncState('done');
          onCompleteRef.current();
          setTimeout(() => {
            setSyncState((s) => (s === 'done' ? 'idle' : s));
          }, 3000);
          return;
        }

        if (data.status === 'failed') {
          setSyncState('failed');
          toast.error(data.errorMessage ?? 'Task sync failed');
          setTimeout(() => {
            setSyncState((s) => (s === 'failed' ? 'idle' : s));
          }, 5000);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setSyncState('failed');
        toast.error(getApiErrorMessage(err, 'Failed to poll sync status'));
        setTimeout(() => {
          setSyncState((s) => (s === 'failed' ? 'idle' : s));
        }, 5000);
        return;
      }

      if (!cancelled) timeoutId = setTimeout(poll, 2000);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
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
