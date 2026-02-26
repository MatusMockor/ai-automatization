import { cn } from '@/lib/utils';
import { ALL_PREFIXES } from '@/types';
import type { TaskPrefix } from '@/types';

export const prefixConfig: Record<TaskPrefix, { color: string; activeColor: string }> = {
  fix: {
    color: 'text-red-400/70',
    activeColor: 'bg-red-500/15 text-red-400 ring-red-500/25',
  },
  feature: {
    color: 'text-violet-400/70',
    activeColor: 'bg-violet-500/15 text-violet-400 ring-violet-500/25',
  },
  chore: {
    color: 'text-amber-400/70',
    activeColor: 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  },
  plan: {
    color: 'text-teal-400/70',
    activeColor: 'bg-teal-500/15 text-teal-400 ring-teal-500/25',
  },
  refactor: {
    color: 'text-emerald-400/70',
    activeColor: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
  },
};

interface PrefixFilterProps {
  selected: TaskPrefix | null;
  onSelect: (prefix: TaskPrefix | null) => void;
  counts?: Partial<Record<TaskPrefix, number>>;
}

export function PrefixFilter({ selected, onSelect, counts }: PrefixFilterProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
          selected === null
            ? 'bg-foreground/10 text-foreground ring-1 ring-foreground/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
        )}
      >
        All
        {counts && (
          <span className="ml-1 tabular-nums opacity-50">
            {Object.values(counts).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)}
          </span>
        )}
      </button>
      {ALL_PREFIXES.map((prefix) => {
        const count = counts?.[prefix];
        if (counts && !count) return null;
        const cfg = prefixConfig[prefix];
        return (
          <button
            key={prefix}
            onClick={() => onSelect(selected === prefix ? null : prefix)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
              selected === prefix
                ? `${cfg.activeColor} ring-1`
                : `${cfg.color} hover:bg-foreground/5`,
            )}
          >
            {prefix}
            {count !== undefined && (
              <span className="ml-1 tabular-nums opacity-50">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
