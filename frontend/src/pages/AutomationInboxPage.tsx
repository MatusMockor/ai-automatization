import { useState, useEffect, useCallback } from 'react';
import { useTick } from '@/lib/useTick';
import { toast } from 'sonner';
import {
  Inbox,
  Play,
  AlarmClock,
  EyeOff,
  RotateCcw,
  History,
  Clock,
  AlertCircle,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useRepo } from '@/context/RepoContext';
import { SourceBadge } from '@/components/shared/SourceBadge';
import type {
  AutomationInboxItem,
  AutomationInboxResponse,
  AutomationInboxHistoryEvent,
  AutomationInboxHistoryResponse,
  AutomationInboxReasonCode,
  TaskSource,
  TaskAutomationState,
  ExecutionDraftStatus,
} from '@/types';

const REASON_STYLES: Record<AutomationInboxReasonCode, string> = {
  draft_ready: 'bg-emerald-500/10 text-emerald-500',
  draft_superseded: 'bg-amber-500/10 text-amber-500',
  matched_rule_no_draft: 'bg-blue-500/10 text-blue-400',
  no_repository_selected: 'bg-red-500/10 text-red-400',
  blocked_by_execution_failure: 'bg-red-500/10 text-red-400',
  dismissed_until_change: 'bg-foreground/5 text-muted-foreground',
  snoozed: 'bg-foreground/5 text-muted-foreground',
};

const REASON_LABELS: Record<AutomationInboxReasonCode, string> = {
  draft_ready: 'Draft Ready',
  draft_superseded: 'Draft Superseded',
  matched_rule_no_draft: 'Matched (No Draft)',
  no_repository_selected: 'No Repository',
  blocked_by_execution_failure: 'Execution Failed',
  dismissed_until_change: 'Dismissed',
  snoozed: 'Snoozed',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  closed: 'Closed',
  unknown: 'Unknown',
};

const SNOOZE_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '4 hours', hours: 4 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 },
  { label: '48 hours', hours: 48 },
  { label: '72 hours', hours: 72 },
  { label: '1 week', hours: 168 },
];

const AUTOMATION_STATE_OPTIONS: { value: TaskAutomationState | ''; label: string }[] = [
  { value: '', label: 'All States' },
  { value: 'matched', label: 'Matched' },
  { value: 'drafted', label: 'Drafted' },
];

const DRAFT_STATUS_OPTIONS: { value: ExecutionDraftStatus | ''; label: string }[] = [
  { value: '', label: 'All Drafts' },
  { value: 'ready', label: 'Ready' },
  { value: 'superseded', label: 'Superseded' },
];

const PROVIDER_OPTIONS: { value: TaskSource | ''; label: string }[] = [
  { value: '', label: 'All Providers' },
  { value: 'jira', label: 'Jira' },
  { value: 'asana', label: 'Asana' },
  { value: 'manual', label: 'Manual' },
];

export function AutomationInboxPage() {
  useTick();
  const { repositories } = useRepo();

  const [items, setItems] = useState<AutomationInboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Filters
  const [filterProvider, setFilterProvider] = useState<TaskSource | ''>('');
  const [filterAutomationState, setFilterAutomationState] = useState<TaskAutomationState | ''>('');
  const [filterDraftStatus, setFilterDraftStatus] = useState<ExecutionDraftStatus | ''>('');
  const [includeSuppressed, setIncludeSuppressed] = useState(false);

  // Snooze UI
  const [snoozingKey, setSnoozingKey] = useState<string | null>(null);
  const [snoozeHours, setSnoozeHours] = useState(24);
  const [snoozeInFlight, setSnoozeInFlight] = useState(false);

  // Dismiss confirm
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);
  const [dismissInFlight, setDismissInFlight] = useState(false);

  // History
  const [historyCache, setHistoryCache] = useState<Record<string, AutomationInboxHistoryEvent[]>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  // Action in-flight
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const getRepoName = useCallback(
    (repoId: string | null): string | null => {
      if (!repoId) return null;
      return repositories.find((r) => r.id === repoId)?.fullName ?? repoId;
    },
    [repositories],
  );

  const fetchItems = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterProvider) params.provider = filterProvider;
      if (filterAutomationState) params.automationState = filterAutomationState;
      if (filterDraftStatus) params.draftStatus = filterDraftStatus;
      if (includeSuppressed) params.includeSuppressed = 'true';

      const { data } = await api.get<AutomationInboxResponse>('/automation-inbox', { params });
      setItems(data.items);
      setTotal(data.total);
      setLoadError(false);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to load inbox'));
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filterProvider, filterAutomationState, filterDraftStatus, includeSuppressed]);

  useEffect(() => {
    setLoading(true);
    fetchItems();
  }, [fetchItems]);

  // --- Actions ---

  const handleSnooze = async (taskKey: string) => {
    if (snoozeInFlight) return;
    setSnoozeInFlight(true);
    try {
      const untilAt = new Date(Date.now() + snoozeHours * 3600000).toISOString();
      await api.post('/automation-inbox/snooze', { taskKey, untilAt });
      toast.success('Task snoozed');
      setSnoozingKey(null);
      if (includeSuppressed) {
        fetchItems();
      } else {
        setItems((prev) => prev.filter((i) => i.taskKey !== taskKey));
        setTotal((prev) => prev - 1);
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to snooze'));
    } finally {
      setSnoozeInFlight(false);
    }
  };

  const handleDismiss = async (taskKey: string) => {
    if (dismissInFlight) return;
    setDismissInFlight(true);
    try {
      await api.post('/automation-inbox/dismiss', { taskKey });
      toast.success('Task dismissed');
      setDismissingKey(null);
      if (includeSuppressed) {
        fetchItems();
      } else {
        setItems((prev) => prev.filter((i) => i.taskKey !== taskKey));
        setTotal((prev) => prev - 1);
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to dismiss'));
    } finally {
      setDismissInFlight(false);
    }
  };

  const handleRestore = async (taskKey: string) => {
    if (actionInFlight) return;
    setActionInFlight(taskKey);
    try {
      await api.post('/automation-inbox/restore', { taskKey });
      toast.success('Task restored');
      fetchItems();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to restore'));
    } finally {
      setActionInFlight(null);
    }
  };

  const handleStartDraft = async (item: AutomationInboxItem) => {
    if (actionInFlight || !item.draftExecutionId) return;
    setActionInFlight(item.taskKey);
    try {
      await api.post(`/executions/${item.draftExecutionId}/start`);
      toast.success('Draft execution started');
      fetchItems();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to start draft'));
    } finally {
      setActionInFlight(null);
    }
  };

  const toggleHistory = async (taskKey: string) => {
    if (expandedHistory === taskKey) {
      setExpandedHistory(null);
      return;
    }

    setExpandedHistory(taskKey);

    if (historyCache[taskKey]) return;

    setHistoryLoading(taskKey);
    try {
      const { data } = await api.get<AutomationInboxHistoryResponse>(
        `/automation-inbox/${encodeURIComponent(taskKey)}/history`,
      );
      setHistoryCache((prev) => ({ ...prev, [taskKey]: data.items }));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to load history'));
      setExpandedHistory(null);
    } finally {
      setHistoryLoading(null);
    }
  };

  const isSuppressed = (item: AutomationInboxItem) =>
    item.reasonCode === 'snoozed' || item.reasonCode === 'dismissed_until_change';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Automation Inbox</h1>
          {!loading && (
            <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10">
              {total}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Tasks that need attention — review drafts, assign repositories, or resolve issues
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value as TaskSource | '')}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {AUTOMATION_STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilterAutomationState(opt.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                filterAutomationState === opt.value
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={filterDraftStatus}
          onChange={(e) => setFilterDraftStatus(e.target.value as ExecutionDraftStatus | '')}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        >
          {DRAFT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-muted-foreground">
          <input
            type="checkbox"
            checked={includeSuppressed}
            onChange={(e) => setIncludeSuppressed(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          Include snoozed/dismissed
        </label>
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading inbox...</span>
        </div>
      )}

      {/* Item cards */}
      {!loading && (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.taskKey} className="rounded-xl border border-border bg-card p-4">
              {/* Top row: title + badges */}
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{item.title}</span>
                    <SourceBadge source={item.source} />
                    <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-foreground/10">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </div>

                  {/* Reason badge + text */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${REASON_STYLES[item.reasonCode]}`}>
                      {REASON_LABELS[item.reasonCode]}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.reasonText}</span>
                  </div>

                  {/* Meta row */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {item.matchedRuleName && (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5 ring-1 ring-foreground/10">
                        Rule: {item.matchedRuleName}
                      </span>
                    )}
                    {item.automationMode && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        item.automationMode === 'draft'
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {item.automationMode === 'draft' ? 'Draft' : 'Suggest'}
                      </span>
                    )}
                    {item.suggestedAction && (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5 ring-1 ring-foreground/10">
                        Action: {item.suggestedAction.charAt(0).toUpperCase() + item.suggestedAction.slice(1)}
                      </span>
                    )}
                    {item.suggestedRepositoryId && (
                      <span className="truncate">{getRepoName(item.suggestedRepositoryId)}</span>
                    )}
                    {item.draftStatus && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        item.draftStatus === 'ready'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        Draft: {item.draftStatus === 'ready' ? 'Ready' : 'Superseded'}
                      </span>
                    )}
                    {item.latestExecutionStatus && (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5 ring-1 ring-foreground/10">
                        Last exec: {item.latestExecutionStatus}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    {timeAgo(item.updatedAt)}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 items-center gap-1">
                  {/* Start Draft */}
                  {item.draftExecutionId && item.draftStatus === 'ready' && (
                    <button
                      type="button"
                      onClick={() => handleStartDraft(item)}
                      disabled={actionInFlight === item.taskKey}
                      className="rounded-lg p-2 text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                      title="Start draft execution"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}

                  {/* Snooze */}
                  {!isSuppressed(item) && (
                    <button
                      type="button"
                      onClick={() => setSnoozingKey(snoozingKey === item.taskKey ? null : item.taskKey)}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                      title="Snooze"
                    >
                      <AlarmClock className="h-4 w-4" />
                    </button>
                  )}

                  {/* Dismiss */}
                  {!isSuppressed(item) && (
                    dismissingKey === item.taskKey ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDismiss(item.taskKey)}
                          disabled={dismissInFlight}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {dismissInFlight ? 'Dismissing...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDismissingKey(null)}
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDismissingKey(item.taskKey)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="Dismiss"
                      >
                        <EyeOff className="h-4 w-4" />
                      </button>
                    )
                  )}

                  {/* Restore */}
                  {isSuppressed(item) && (
                    <button
                      type="button"
                      onClick={() => handleRestore(item.taskKey)}
                      disabled={actionInFlight === item.taskKey}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50"
                      title="Restore"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}

                  {/* History toggle */}
                  <button
                    type="button"
                    onClick={() => toggleHistory(item.taskKey)}
                    className={`rounded-lg p-2 transition-colors ${
                      expandedHistory === item.taskKey
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                    }`}
                    title="History"
                  >
                    <History className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Snooze picker */}
              {snoozingKey === item.taskKey && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background p-2.5">
                  <AlarmClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <select
                    value={snoozeHours}
                    onChange={(e) => setSnoozeHours(Number(e.target.value))}
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  >
                    {SNOOZE_OPTIONS.map((opt) => (
                      <option key={opt.hours} value={opt.hours}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleSnooze(item.taskKey)}
                    disabled={snoozeInFlight}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {snoozeInFlight ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSnoozingKey(null)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* History timeline */}
              {expandedHistory === item.taskKey && (
                <div className="mt-3 rounded-lg border border-border bg-background p-3">
                  {historyLoading === item.taskKey ? (
                    <div className="flex justify-center py-4">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : historyCache[item.taskKey]?.length ? (
                    <div className="space-y-2">
                      {historyCache[item.taskKey].map((event, idx) => (
                        <div key={idx} className="flex items-start gap-2.5">
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{event.message}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                              <span>{timeAgo(event.occurredAt)}</span>
                              {event.ruleName && <span>Rule: {event.ruleName}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">No history events</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Load error */}
      {!loading && loadError && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400/60" />
          <p className="text-sm font-medium text-muted-foreground">Failed to load inbox</p>
          <button
            type="button"
            onClick={() => { setLoading(true); fetchItems(); }}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Inbox is empty</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {includeSuppressed
              ? 'No items match the current filters'
              : 'All tasks are handled — try including snoozed/dismissed items'}
          </p>
        </div>
      )}
    </div>
  );
}
