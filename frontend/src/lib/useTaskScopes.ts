import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { TaskScopesResponse } from '@/types';

export function useTaskScopes() {
  const [scopes, setScopes] = useState<TaskScopesResponse | null>(null);

  const refreshScopes = useCallback(async () => {
    try {
      const { data } = await api.get<TaskScopesResponse>('/tasks/scopes');
      setScopes(data);
    } catch {
      // Non-critical — scope filters just stay hidden
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<TaskScopesResponse>('/tasks/scopes')
      .then(({ data }) => {
        if (!cancelled) setScopes(data);
      })
      .catch(() => {
        // Non-critical
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { scopes, refreshScopes };
}
