import { cn } from '@/lib/utils';

interface Stat {
  label: string;
  value: number;
  color: string;
  change?: string;
}

interface StatsBarProps {
  stats: Stat[];
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="flex items-stretch gap-3 border-b border-border px-5 py-3">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={cn(
            'flex items-center gap-3 rounded-lg bg-foreground/[0.03] px-4 py-2.5 ring-1 ring-foreground/[0.04]',
            i === 0 && 'flex-1',
          )}
        >
          <div className={cn('h-8 w-1 rounded-full', stat.color)} />
          <div>
            <div className="text-lg font-bold tabular-nums leading-none">{stat.value}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{stat.label}</div>
          </div>
          {stat.change && (
            <span className="ml-1 text-[10px] text-emerald-400">{stat.change}</span>
          )}
        </div>
      ))}
    </div>
  );
}
