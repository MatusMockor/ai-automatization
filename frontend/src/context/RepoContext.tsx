import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Repository } from '@/types';

interface RepoContextValue {
  repositories: Repository[];
  selectedRepo: Repository | null;
  loading: boolean;
  selectRepo: (repo: Repository) => void;
}

const RepoContext = createContext<RepoContextValue | null>(null);

const STORAGE_KEY = 'selectedRepoId';

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const { data } = await api.get<Repository[]>('/repositories');
        setRepositories(data);

        const savedId = localStorage.getItem(STORAGE_KEY);
        const saved = savedId ? data.find((r) => r.id === savedId) : null;
        setSelectedRepo(saved ?? data[0] ?? null);
      } catch {
        setRepositories([]);
        setSelectedRepo(null);
      } finally {
        setLoading(false);
      }
    };
    fetchRepos();
  }, []);

  const selectRepo = useCallback((repo: Repository) => {
    setSelectedRepo(repo);
    localStorage.setItem(STORAGE_KEY, repo.id);
  }, []);

  return (
    <RepoContext.Provider value={{ repositories, selectedRepo, loading, selectRepo }}>
      {children}
    </RepoContext.Provider>
  );
}

export function useRepo() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepo must be used within RepoProvider');
  return ctx;
}
