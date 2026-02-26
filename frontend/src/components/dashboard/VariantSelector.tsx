import { Link } from 'react-router-dom';
import {
  Columns3,
  LayoutGrid,
  Terminal,
  BarChart3,
  Focus,
} from 'lucide-react';

const variants = [
  {
    path: '/v1',
    name: 'Command Center',
    subtitle: 'Sidebar + Split Panel',
    icon: Columns3,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    path: '/v2',
    name: 'Kanban Board',
    subtitle: 'Columns by prefix',
    icon: LayoutGrid,
    color: 'from-violet-500 to-purple-500',
  },
  {
    path: '/v3',
    name: 'Terminal-First',
    subtitle: 'Table + Terminal',
    icon: Terminal,
    color: 'from-emerald-500 to-green-500',
  },
  {
    path: '/v4',
    name: 'Dashboard Overview',
    subtitle: 'Stats + Activity',
    icon: BarChart3,
    color: 'from-orange-500 to-amber-500',
  },
  {
    path: '/v5',
    name: 'Focus Mode',
    subtitle: 'One task at a time',
    icon: Focus,
    color: 'from-teal-500 to-cyan-500',
  },
];

export function VariantSelector() {
  return (
    <div className="p-5">
      <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Layout Variants
      </h2>
      <p className="mb-4 text-xs text-muted-foreground/60">
        Press <kbd className="rounded bg-foreground/5 px-1 font-mono text-[10px]">1</kbd>–<kbd className="rounded bg-foreground/5 px-1 font-mono text-[10px]">5</kbd> or click below
      </p>
      <div className="grid grid-cols-5 gap-2">
        {variants.map((v, i) => (
          <Link
            key={v.path}
            to={v.path}
            className="group flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-all hover:border-foreground/15 hover:bg-foreground/[0.03]"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${v.color} opacity-80 transition-opacity group-hover:opacity-100`}>
              <v.icon className="h-4 w-4 text-white" />
            </div>
            <div className="text-center">
              <div className="text-xs font-medium">{v.name}</div>
              <div className="text-[10px] text-muted-foreground">{v.subtitle}</div>
            </div>
            <kbd className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {i + 1}
            </kbd>
          </Link>
        ))}
      </div>
    </div>
  );
}
