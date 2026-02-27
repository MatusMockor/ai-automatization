import { useEffect, useRef, useState } from 'react';
import type { ExecutionStatus, ExecutionStreamEvent } from '@/types';

interface UseExecutionStreamOptions {
  executionId: string | null;
  onEvent?: (event: ExecutionStreamEvent) => void;
}

export function useExecutionStream({ executionId, onEvent }: UseExecutionStreamOptions) {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!executionId) {
      setOutput('');
      setStatus(null);
      return;
    }

    const abortController = new AbortController();

    const connect = async () => {
      const token = localStorage.getItem('token');
      let response: Response;
      try {
        response = await fetch(`/api/executions/${executionId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        throw err;
      }

      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      const processLine = (line: string) => {
        if (line.startsWith('event:')) {
          currentEventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || !currentEventType) return;
          try {
            const payload = JSON.parse(jsonStr) as Record<string, unknown>;
            const event = { ...payload, type: currentEventType } as ExecutionStreamEvent;
            handleEvent(event);
            onEventRef.current?.(event);
          } catch { /* skip malformed JSON */ }
        } else if (line === '') {
          currentEventType = '';
        }
      };

      const handleEvent = (event: ExecutionStreamEvent) => {
        switch (event.type) {
          case 'snapshot':
            setOutput(event.output);
            setStatus(event.status);
            break;
          case 'stdout':
          case 'stderr':
            setOutput((prev) => prev + event.chunk);
            break;
          case 'status':
            setStatus(event.status);
            break;
          case 'completed':
          case 'error':
            setStatus(event.status);
            break;
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;
          for (const line of lines) {
            processLine(line);
          }
        }
        // Process any remaining buffer
        if (buffer) processLine(buffer);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Stream ended unexpectedly — ignore
      }
    };

    connect();

    return () => {
      abortController.abort();
    };
  }, [executionId]);

  return { output, status };
}
