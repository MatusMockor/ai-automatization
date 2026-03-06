import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '@/lib/api';
import { timeRemaining } from '@/lib/time';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ReviewGateStatusBadge } from './ReviewGateStatusBadge';
import type { ReviewGateStatus, ReviewStateResponse, ReviewDecision } from '@/types';

const verdictConfig: Record<string, { label: string; className: string }> = {
  pass: { label: 'Pass', className: 'bg-emerald-500/10 text-emerald-400' },
  fail: { label: 'Fail', className: 'bg-red-500/10 text-red-400' },
  error: { label: 'Error', className: 'bg-amber-500/10 text-amber-500' },
};

interface ReviewGatePanelProps {
  executionId: string;
  reviewGateStatus: ReviewGateStatus;
  pendingDecisionUntil: string | null;
  onDecisionApplied: () => void;
}

export function ReviewGatePanel({
  executionId,
  reviewGateStatus,
  pendingDecisionUntil,
  onDecisionApplied,
}: ReviewGatePanelProps) {
  const [reviewState, setReviewState] = useState<ReviewStateResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchReviewState = async () => {
      try {
        const { data } = await api.get<ReviewStateResponse>(`/executions/${executionId}/review-state`);
        if (!cancelled) setReviewState(data);
      } catch { /* ignore */ }
    };
    fetchReviewState();
    return () => { cancelled = true; };
  }, [executionId, reviewGateStatus]);

  // Countdown timer
  const deadline = pendingDecisionUntil ?? reviewState?.pendingDecisionUntil ?? null;
  useEffect(() => {
    if (!deadline) { setCountdown(''); return; }
    const tick = () => setCountdown(timeRemaining(deadline));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const handleDecision = async (decision: ReviewDecision) => {
    setSubmitting(true);
    try {
      await api.post(`/executions/${executionId}/review-decision`, { decision });
      toast.success(`Review decision: ${decision}`);
      onDecisionApplied();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to submit decision'));
    } finally {
      setSubmitting(false);
    }
  };

  const verdict = reviewState?.verdict;
  const vCfg = verdict ? verdictConfig[verdict] : null;

  return (
    <div className="mb-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs">
        <ReviewGateStatusBadge status={reviewGateStatus} />
        {vCfg && (
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', vCfg.className)}>
            Verdict: {vCfg.label}
          </span>
        )}
        {countdown && reviewGateStatus === 'awaiting_decision' && (
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {countdown}
          </span>
        )}
      </div>

      {reviewState?.findingsMarkdown && (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-foreground/5 px-2.5 py-2 text-xs text-foreground/80">
          {reviewState.findingsMarkdown}
        </pre>
      )}

      {reviewGateStatus === 'awaiting_decision' && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleDecision('continue')}
            className="rounded px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Continue
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleDecision('block')}
            className="rounded px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 disabled:opacity-50"
          >
            Block
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleDecision('fix')}
            className="rounded px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50"
          >
            Fix
          </button>
        </div>
      )}
    </div>
  );
}
