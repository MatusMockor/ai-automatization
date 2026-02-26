import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { mockRepositories } from '@/data/mock';
import type { Repository } from '@/types';
import { ChevronDown, Check } from 'lucide-react';

export function RepoSelector({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Repository>(
    mockRepositories.find((r) => r.isActive) ?? mockRepositories[0],
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-1.5 text-sm transition-colors hover:bg-foreground/8"
      >
        <div className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="font-medium">{active.fullName}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl shadow-black/20">
          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Repositories
          </div>
          {mockRepositories.map((repo) => (
            <button
              key={repo.id}
              onClick={() => { setActive(repo); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-foreground/5"
            >
              <div className={cn('h-2 w-2 rounded-full', repo.id === active.id ? 'bg-emerald-400' : 'bg-muted-foreground/30')} />
              <span className={cn(repo.id === active.id ? 'text-foreground' : 'text-muted-foreground')}>
                {repo.fullName}
              </span>
              {repo.id === active.id && <Check className="ml-auto h-3.5 w-3.5 text-emerald-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
