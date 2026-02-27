import { useState, useEffect } from 'react';
import { ExecutionStatusIcon } from '@/components/shared/StatusIcon';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { Execution } from '@/types';
import { Square, Copy, X } from 'lucide-react';

const actionColors: Record<string, string> = {
  fix: 'bg-red-500/15 text-red-400',
  feature: 'bg-violet-500/15 text-violet-400',
  plan: 'bg-teal-500/15 text-teal-400',
};

const getApiErrorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Execution | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Execution | null>(null);

  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        const { data } = await api.get<Execution[]>('/executions', { params: { limit: 50 } });
        setExecutions(data);
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to load executions'));
      } finally {
        setLoading(false);
      }
    };
    fetchExecutions();
  }, []);

  const handleSelect = async (exec: Execution) => {
    setSelected(exec);
    setSelectedDetail(null);
    try {
      const { data } = await api.get<Execution>(`/executions/${exec.id}`);
      setSelectedDetail(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load execution detail'));
    }
  };

  const handleCancel = async (executionId: string) => {
    try {
      const { data } = await api.post<Execution>(`/executions/${executionId}/cancel`);
      setExecutions((prev) => prev.map((e) => (e.id === executionId ? { ...e, status: data.status } : e)));
      if (selected?.id === executionId) {
        setSelected((prev) => prev ? { ...prev, status: data.status } : prev);
        setSelectedDetail((prev) => prev ? { ...prev, status: data.status } : prev);
      }
      toast.success('Execution cancelled');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to cancel execution'));
    }
  };

  const detail = selectedDetail ?? selected;

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-5 py-3">
          <h1 className="text-sm font-semibold">Executions</h1>
          <p className="text-xs text-muted-foreground">
            {executions.length} total · {executions.filter((e) => e.status === 'running').length} running
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-12" role="status" aria-live="polite">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="sr-only">Loading executions...</span>
            </div>
          )}

          {!loading && (
            <div className="divide-y divide-border">
              {executions.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  No executions yet
                </div>
              )}
              {executions.map((exec) => (
                <button
                  key={exec.id}
                  onClick={() => handleSelect(exec)}
                  className={cn(
                    'relative flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors',
                    selected?.id === exec.id ? 'bg-primary/5' : 'hover:bg-foreground/[0.02]',
                  )}
                >
                  {selected?.id === exec.id && (
                    <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                  )}
                  <ExecutionStatusIcon status={exec.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{exec.taskExternalId}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', actionColors[exec.action])}>
                        {exec.action}
                      </span>
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium capitalize',
                        exec.status === 'running' && 'bg-blue-500/10 text-blue-400',
                        exec.status === 'completed' && 'bg-emerald-500/10 text-emerald-400',
                        exec.status === 'failed' && 'bg-red-500/10 text-red-400',
                      )}>
                        {exec.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      Started {timeAgo(exec.createdAt)}
                      {exec.finishedAt && <> · Finished {timeAgo(exec.finishedAt)}</>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Output panel */}
      {detail && (
        <div className="flex w-[480px] shrink-0 flex-col border-l border-border dark:bg-[#141922] bg-[#f4f5f7]">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <ExecutionStatusIcon status={detail.status} />
              <span className="font-mono font-medium">{detail.taskExternalId}</span>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', actionColors[detail.action])}>
                {detail.action}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {detail.status === 'running' && (
                <button
                  type="button"
                  onClick={() => handleCancel(detail.id)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                >
                  <Square className="h-3 w-3" /> Stop
                </button>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(detail.output ?? '')}
                className="rounded p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                onClick={() => { setSelected(null); setSelectedDetail(null); }}
                className="rounded p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
            {selectedDetail ? (
              <>
                <pre className="whitespace-pre-wrap dark:text-emerald-300/80 text-emerald-700">{selectedDetail.output}</pre>
                {selectedDetail.status === 'running' && (
                  <span className="inline-block h-4 w-1.5 animate-pulse dark:bg-emerald-400/60 bg-emerald-600/60" />
                )}
              </>
            ) : (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
