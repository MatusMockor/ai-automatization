import { ExecutionAction } from './execution.types';

export type ClaudeCliStartOptions = {
  prompt: string;
  action: ExecutionAction;
  cwd: string;
  anthropicApiKey: string;
};

export type ClaudeCliExitInfo = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export interface ClaudeCliProcess {
  readonly pid: number | null;
  onStdout(listener: (chunk: string) => void): void;
  onStderr(listener: (chunk: string) => void): void;
  onExit(listener: (info: ClaudeCliExitInfo) => void): void;
  kill(signal: NodeJS.Signals): void;
}

export interface ClaudeCliRunner {
  ensureAvailable(): Promise<void>;
  start(options: ClaudeCliStartOptions): Promise<ClaudeCliProcess>;
}
