import { useState, useEffect, useRef } from 'react';
import { ExecutionStatusIcon } from '@/components/shared/StatusIcon';
import { cn } from '@/lib/utils';
import type { Execution } from '@/types';
import { ChevronDown, ChevronUp, Square, Copy } from 'lucide-react';

interface TerminalPanelProps {
  execution: Execution;
  isOpen: boolean;
  onToggle: () => void;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT_RATIO = 0.85;
const DEFAULT_HEIGHT = 240;

export function TerminalPanel({ execution, isOpen, onToggle }: TerminalPanelProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startY: 0, startHeight: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
      const delta = dragState.current.startY - e.clientY;
      const next = Math.min(Math.max(dragState.current.startHeight + delta, MIN_HEIGHT), maxHeight);
      // Direct DOM update for 0-lag feel, sync state in rAF
      if (panelRef.current) {
        panelRef.current.style.height = `${next}px`;
      }
      requestAnimationFrame(() => setHeight(next));
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: height };
    setIsDragging(true);
  };

  return (
    <div
      ref={panelRef}
      className={cn(
        'flex shrink-0 flex-col border-t border-border dark:bg-[#141922] bg-[#f4f5f7]',
        // Only animate open/close toggle, never during drag
        !isDragging && 'transition-[height] duration-200 ease-out',
      )}
      style={{ height: isOpen ? height : 36 }}
    >
      {/* Drag handle — wider hit area */}
      {isOpen && (
        <div
          onMouseDown={handleMouseDown}
          className="group relative flex h-2 shrink-0 cursor-row-resize items-center justify-center"
        >
          {/* Visible line on hover */}
          <div className={cn(
            'absolute inset-x-0 top-0 h-px transition-colors',
            isDragging ? 'bg-primary/50' : 'bg-transparent group-hover:bg-foreground/10',
          )} />
          {/* Wider invisible hit target */}
          <div className="absolute -top-1 -bottom-1 inset-x-0" />
        </div>
      )}

      {/* Toolbar */}
      <button
        onClick={onToggle}
        className="flex h-9 shrink-0 items-center gap-3 px-4 text-xs transition-colors hover:bg-foreground/[0.02]"
      >
        <div className="flex items-center gap-2">
          <ExecutionStatusIcon status={execution.status} />
          <span className="font-medium text-foreground">
            {execution.taskExternalId}
          </span>
          <span className="text-muted-foreground">{execution.action}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {execution.status === 'running' && (
            <span
              onClick={(e) => { e.stopPropagation(); console.log('stop'); }}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-red-400 transition-colors hover:bg-red-500/10"
            >
              <Square className="h-3 w-3" />
              Stop
            </span>
          )}
          <span
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(execution.output); }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <Copy className="h-3 w-3" />
          </span>
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Output */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 font-mono text-[13px] leading-relaxed">
          <pre className="whitespace-pre-wrap dark:text-emerald-300/80 text-emerald-700">{execution.output}</pre>
          {execution.status === 'running' && (
            <span className="inline-block h-4 w-1.5 animate-pulse dark:bg-emerald-400/60 bg-emerald-600/60" />
          )}
        </div>
      )}
    </div>
  );
}
