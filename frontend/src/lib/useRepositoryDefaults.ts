import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '@/lib/api';
import type {
  TaskRepositoryDefaultItem,
  TaskRepositoryDefaultsResponse,
  UpsertRepositoryDefaultRequest,
  DeleteRepositoryDefaultRequest,
} from '@/types';

export function useRepositoryDefaults() {
  const [defaults, setDefaults] = useState<TaskRepositoryDefaultItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDefaults = useCallback(async () => {
    try {
      const { data } = await api.get<TaskRepositoryDefaultsResponse>('/tasks/repository-defaults');
      setDefaults(data.items);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load repository defaults'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDefaults();
  }, [fetchDefaults]);

  const upsertDefault = useCallback(
    async (req: UpsertRepositoryDefaultRequest) => {
      try {
        await api.put('/tasks/repository-defaults', req);
        await fetchDefaults();
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to save repository default'));
      }
    },
    [fetchDefaults],
  );

  const deleteDefault = useCallback(async (req: DeleteRepositoryDefaultRequest) => {
    try {
      await api.delete('/tasks/repository-defaults', { data: req });
      setDefaults((prev) =>
        prev.filter(
          (d) =>
            !(
              d.provider === req.provider &&
              (d.scopeType ?? undefined) === req.scopeType &&
              (d.scopeId ?? undefined) === req.scopeId
            ),
        ),
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to remove repository default'));
    }
  }, []);

  return { defaults, loading, upsertDefault, deleteDefault, refreshDefaults: fetchDefaults };
}
