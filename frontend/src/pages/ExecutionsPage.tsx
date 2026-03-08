import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTick } from '@/lib/useTick';
import { ExecutionStatusIcon } from '@/components/shared/StatusIcon';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { api, getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import type { Execution, ExecutionStreamEvent, ExecutionTriggerType, ReviewGateStatus } from '@/types';
import { Square, Copy, X, ExternalLink } from 'lucide-react';
import { useExecutionStream } from '@/lib/useExecutionStream';
import { ReviewGateStatusBadge } from '@/components/shared/ReviewGateStatusBadge';
import { ReviewGatePanel } from '@/components/shared/ReviewGatePanel';

const actionColors: Record<string, string> = {
  fix: 'bg-red-500/15 text-red-400',
  feature: 'bg-violet-500/15 text-violet-400',
  plan: 'bg-teal-500/15 text-teal-400',
};

export function ExecutionsPage() {
  useTick();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Execution | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Execution | null>(null);
  const [triggerFilter, setTriggerFilter] = useState<ExecutionTriggerType | 'all'>('all');
  const [draftsOnly, setDraftsOnly] = useState(false);

  // Detail panel horizontal resize
  const DEFAULT_PANEL_WIDTH = 480;
  const MIN_PANEL_WIDTH = 320;
  const MAX_PANEL_WIDTH_RATIO = 0.75;
  const STORAGE_KEY = 'executions-panel-width';
  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = Number(stored);
      if (n >= MIN_PANEL_WIDTH && n <= window.innerWidth * MAX_PANEL_WIDTH_RATIO) return n;
    }
    return DEFAULT_PANEL_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startX: 0, startWidth: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_RATIO;
      const delta = dragState.current.startX - e.clientX;
      const next = Math.min(Math.max(dragState.current.startWidth + delta, MIN_PANEL_WIDTH), maxWidth);
      if (panelRef.current) {
        panelRef.current.style.width = `${next}px`;
      }
      requestAnimationFrame(() => setPanelWidth(next));
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (panelRef.current) {
        localStorage.setItem(STORAGE_KEY, String(Math.round(panelRef.current.offsetWidth)));
      }
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: panelWidth };
    setIsDragging(true);
  };

  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        const params: Record<string, string | number | boolean> = { limit: 50 };
        if (triggerFilter !== 'all') params.triggerType = triggerFilter;
        if (draftsOnly) params.isDraft = true;
        const { data } = await api.get<Execution[]>('/executions', { params });
        setExecutions(data);
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to load executions'));
      } finally {
        setLoading(false);
      }
    };
    fetchExecutions();
  }, [triggerFilter, draftsOnly]);

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

  const handleStreamEvent = useCallback((event: ExecutionStreamEvent) => {
    if (event.type === 'status' || event.type === 'completed' || event.type === 'error') {
      setExecutions((prev) =>
        prev.map((e) =>
          e.id === event.executionId
            ? {
                ...e,
                status: event.status,
                ...(event.status === 'pending' ? { output: '', errorMessage: null, automationStatus: 'pending' as const, automationErrorMessage: null } : {}),
              }
            : e,
        ),
      );
      setSelected((prev) =>
        prev?.id === event.executionId ? { ...prev, status: event.status } : prev,
      );
      setSelectedDetail((prev) =>
        prev?.id === event.executionId
          ? {
              ...prev,
              status: event.status,
              errorMessage: event.errorMessage ?? prev.errorMessage,
              ...(event.status === 'pending' ? { output: '', errorMessage: null, automationStatus: 'pending' as const, automationErrorMessage: null } : {}),
            }
          : prev,
      );
    }
    if (event.type === 'review') {
      const reviewUpdate = {
        reviewGateStatus: event.reviewGateStatus as ReviewGateStatus,
        reviewPendingDecisionUntil: event.pendingDecisionUntil ?? null,
      };
      setExecutions((prev) =>
        prev.map((e) => (e.id === event.executionId ? { ...e, ...reviewUpdate } : e)),
      );
      setSelected((prev) =>
        prev?.id === event.executionId ? { ...prev, ...reviewUpdate } : prev,
      );
      setSelectedDetail((prev) =>
        prev?.id === event.executionId ? { ...prev, ...reviewUpdate } : prev,
      );
    }
    if (event.type === 'publication') {
      const errorMsg = event.automationStatus === 'failed' || event.automationStatus === 'no_changes' ? (event.message ?? null) : null;
      setExecutions((prev) =>
        prev.map((e) =>
          e.id === event.executionId
            ? {
                ...e,
                automationStatus: event.automationStatus,
                pullRequestUrl: event.pullRequestUrl ?? e.pullRequestUrl,
                automationErrorMessage: errorMsg,
              }
            : e,
        ),
      );
      setSelected((prev) =>
        prev?.id === event.executionId
          ? {
              ...prev,
              automationStatus: event.automationStatus,
              pullRequestUrl: event.pullRequestUrl ?? prev.pullRequestUrl,
              automationErrorMessage: errorMsg,
            }
          : prev,
      );
      setSelectedDetail((prev) =>
        prev?.id === event.executionId
          ? {
              ...prev,
              automationStatus: event.automationStatus,
              pullRequestUrl: event.pullRequestUrl ?? prev.pullRequestUrl,
              automationErrorMessage: errorMsg,
            }
          : prev,
      );
    }
  }, []);

  const { output: streamOutput, status: streamStatus, errorMessage: streamErrorMessage, automationStatus: streamAutomationStatus } = useExecutionStream({
    executionId: selected?.id ?? null,
    onEvent: handleStreamEvent,
  });

  const detail = useMemo(() => {
    const base = selectedDetail ?? selected;
    if (!base) return null;
    return {
      ...base,
      output: streamOutput || base.output,
      status: streamStatus ?? base.status,
      errorMessage: streamErrorMessage ?? base.errorMessage,
      automationStatus: streamAutomationStatus ?? base.automationStatus,
    };
  }, [selected, selectedDetail, streamOutput, streamStatus, streamErrorMessage, streamAutomationStatus]);

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

        {/* Filters */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-2">
          <div className="flex items-center gap-1">
            {(['all', 'manual', 'automation_rule', 'schedule'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTriggerFilter(t); setLoading(true); }}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  triggerFilter === t
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-foreground/5',
                )}
              >
                {t === 'all' ? 'All' : t === 'manual' ? 'Manual' : t === 'automation_rule' ? 'Rule' : 'Schedule'}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draftsOnly}
              onChange={(e) => { setDraftsOnly(e.target.checked); setLoading(true); }}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            Drafts only
          </label>
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
                <div
                  key={exec.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(exec)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(exec); } }}
                  className={cn(
                    'relative flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition-colors',
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
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', actionColors[exec.action], exec.draftStatus === 'superseded' && 'line-through opacity-50')}>
                        {exec.action}
                      </span>
                      {exec.isDraft && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-500">
                          Draft
                        </span>
                      )}
                      {exec.triggerType === 'automation_rule' && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-400">
                          Auto
                        </span>
                      )}
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium capitalize',
                        exec.status === 'running' && 'bg-blue-500/10 text-blue-400',
                        exec.status === 'completed' && 'bg-emerald-500/10 text-emerald-400',
                        exec.status === 'failed' && 'bg-red-500/10 text-red-400',
                      )}>
                        {exec.status}
                      </span>
                      {exec.automationStatus === 'published' && exec.pullRequestUrl && (
                        <a href={exec.pullRequestUrl} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
                          PR
                        </a>
                      )}
                      {exec.automationStatus === 'publishing' && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-400">Publishing...</span>
                      )}
                      {exec.automationStatus === 'no_changes' && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-500">No Changes</span>
                      )}
                      {exec.automationStatus === 'failed' && exec.publishPullRequest && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400">PR Failed</span>
                      )}
                      {exec.executionRole && exec.executionRole !== 'implementation' && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-400 capitalize">
                          {exec.executionRole}
                        </span>
                      )}
                      {exec.reviewGateStatus && exec.reviewGateStatus !== 'not_applicable' && (
                        <ReviewGateStatusBadge status={exec.reviewGateStatus} />
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      Started {timeAgo(exec.createdAt)}
                      {exec.finishedAt && <> · Finished {timeAgo(exec.finishedAt)}</>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Output panel */}
      {detail && (
        <div
          ref={panelRef}
          className="relative flex shrink-0 flex-col border-l border-border dark:bg-[#141922] bg-[#f4f5f7]"
          style={{ width: panelWidth }}
        >
          {/* Horizontal drag handle */}
          <div
            onMouseDown={handleDragStart}
            className="group absolute inset-y-0 left-0 z-10 flex w-2 cursor-col-resize items-center justify-center"
          >
            <div
              className={cn(
                'absolute inset-y-0 left-0 w-px transition-colors',
                isDragging ? 'bg-primary/50' : 'bg-transparent group-hover:bg-foreground/10',
              )}
            />
          </div>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <ExecutionStatusIcon status={detail.status} />
              <span className="font-mono font-medium">{detail.taskExternalId}</span>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', actionColors[detail.action])}>
                {detail.action}
              </span>
              {detail.implementationAttempts > 1 && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-orange-500/10 text-orange-400">
                  Attempt {detail.implementationAttempts}/3
                </span>
              )}
              {detail.pullRequestUrl && (
                <a href={detail.pullRequestUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10">
                  <ExternalLink className="h-3 w-3" /> Open PR
                </a>
              )}
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
            {selectedDetail || streamOutput ? (
              <>
                {detail.errorMessage && (detail.status === 'failed' || detail.status === 'cancelled') && (
                  <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
                    {detail.errorMessage}
                  </div>
                )}
                {(detail.automationStatus === 'failed' || detail.automationStatus === 'no_changes') && detail.automationErrorMessage && (
                  <div className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-500 ring-1 ring-amber-500/20">
                    <span className="font-medium">{detail.automationStatus === 'no_changes' ? 'No changes detected:' : 'Publication failed:'}</span> {detail.automationErrorMessage}
                  </div>
                )}
                {detail.reviewGateStatus && detail.reviewGateStatus !== 'not_applicable' && (
                  <ReviewGatePanel
                    executionId={detail.id}
                    reviewGateStatus={detail.reviewGateStatus}
                    pendingDecisionUntil={detail.reviewPendingDecisionUntil}
                    onDecisionApplied={async () => {
                      try {
                        const { data } = await api.get<Execution>(`/executions/${detail.id}`);
                        setSelectedDetail(data);
                        setExecutions((prev) => prev.map((e) => (e.id === data.id ? { ...e, reviewGateStatus: data.reviewGateStatus, reviewPendingDecisionUntil: data.reviewPendingDecisionUntil } : e)));
                      } catch { /* ignore */ }
                    }}
                  />
                )}
                <pre className="whitespace-pre-wrap dark:text-emerald-300/80 text-emerald-700">{detail.output}</pre>
                {detail.status === 'running' && (
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
