import { useEffect, useRef, useState } from 'react';
import type { AutomationStatus, ExecutionStatus, ExecutionStreamEvent } from '@/types';

interface UseExecutionStreamOptions {
  executionId: string | null;
  onEvent?: (event: ExecutionStreamEvent) => void;
}

export function useExecutionStream({ executionId, onEvent }: UseExecutionStreamOptions) {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const lastSequenceRef = useRef<number>(0);

  useEffect(() => {
    setOutput('');
    setStatus(null);
    setErrorMessage(null);
    setAutomationStatus(null);
    lastSequenceRef.current = 0;

    if (!executionId) {
      return;
    }

    const abortController = new AbortController();
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const startPolling = (execId: string, token: string) => {
      const poll = async () => {
        try {
          const res = await fetch(`/api/executions/${execId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: abortController.signal,
          });
          if (!res.ok) return;
          const data = await res.json();
          setOutput(data.output ?? '');
          setStatus(data.status);
          setErrorMessage(data.errorMessage ?? null);
          setAutomationStatus(data.automationStatus ?? null);
          onEventRef.current?.({
            type: data.status === 'completed' ? 'completed' :
                  data.status === 'failed' ? 'error' : 'status',
            executionId: execId,
            status: data.status,
            exitCode: data.exitCode ?? null,
            errorMessage: data.errorMessage,
          } as ExecutionStreamEvent);
          if (['completed', 'failed', 'cancelled'].includes(data.status)) {
            if (pollInterval) clearInterval(pollInterval);
          }
        } catch { /* abort or network error */ }
      };
      void poll();
      pollInterval = setInterval(poll, 3000);
    };

    const connect = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      let response: Response;
      try {
        response = await fetch(`/api/executions/${executionId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn('SSE failed, falling back to polling', err);
        startPolling(executionId, token);
        return;
      }

      if (!response.ok || !response.body) {
        console.warn(`SSE failed (${response.status}), falling back to polling`);
        startPolling(executionId, token);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      const processLine = (rawLine: string) => {
        const line = rawLine.replace(/\r$/, '');
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
        if (event.sequence != null && event.sequence > 0) {
          if (event.sequence <= lastSequenceRef.current) return;
          lastSequenceRef.current = event.sequence;
        }
        switch (event.type) {
          case 'snapshot':
            setOutput(event.output);
            setStatus(event.status);
            if (event.automationStatus) setAutomationStatus(event.automationStatus);
            if (event.lastSequence != null) lastSequenceRef.current = event.lastSequence;
            break;
          case 'stdout':
          case 'stderr':
            setOutput((prev) => prev + event.chunk);
            break;
          case 'status':
            setStatus(event.status);
            setErrorMessage((prev) => event.errorMessage ?? prev);
            break;
          case 'publication':
            setAutomationStatus(event.automationStatus);
            break;
          case 'completed':
          case 'error':
            setStatus(event.status);
            setErrorMessage((prev) => event.errorMessage ?? prev);
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

    void connect();

    return () => {
      abortController.abort();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [executionId]);

  return { output, status, errorMessage, automationStatus };
}
