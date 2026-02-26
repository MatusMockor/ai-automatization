import type { ExecutionAction } from '@/types';

interface ActionButtonsProps {
  onAction: (action: ExecutionAction) => void;
  size?: 'sm' | 'md';
}

const actions: { action: ExecutionAction; label: string; shortcut: string; colors: string }[] = [
  {
    action: 'fix',
    label: 'Fix',
    shortcut: 'F',
    colors: 'from-red-500/20 to-red-500/5 text-red-400 hover:from-red-500/30 hover:to-red-500/10 ring-red-500/20 hover:ring-red-500/40',
  },
  {
    action: 'feature',
    label: 'Feature',
    shortcut: 'E',
    colors: 'from-violet-500/20 to-violet-500/5 text-violet-400 hover:from-violet-500/30 hover:to-violet-500/10 ring-violet-500/20 hover:ring-violet-500/40',
  },
  {
    action: 'plan',
    label: 'Plan',
    shortcut: 'P',
    colors: 'from-teal-500/20 to-teal-500/5 text-teal-400 hover:from-teal-500/30 hover:to-teal-500/10 ring-teal-500/20 hover:ring-teal-500/40',
  },
];

export function ActionButtons({ onAction, size = 'md' }: ActionButtonsProps) {
  const padding = size === 'sm' ? 'px-3 py-1.5 text-xs gap-1.5' : 'px-4 py-2 text-sm gap-2';

  return (
    <div className="flex items-center gap-2">
      {actions.map((a) => (
        <button
          key={a.action}
          onClick={(e) => { e.stopPropagation(); onAction(a.action); }}
          className={`inline-flex items-center ${padding} rounded-lg bg-gradient-to-b font-medium ring-1 transition-all duration-150 hover:shadow-lg ${a.colors}`}
        >
          {a.label}
          {size === 'md' && (
            <kbd className="ml-1 rounded bg-black/20 px-1 py-0.5 font-mono text-[10px] opacity-50">
              {a.shortcut}
            </kbd>
          )}
        </button>
      ))}
    </div>
  );
}
