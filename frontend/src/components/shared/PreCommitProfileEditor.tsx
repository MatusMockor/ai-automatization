import type { PreCommitChecksProfile, PreCommitStepPreset, PreCommitRuntimeLanguage } from '@/types';

const DEFAULT_PROFILE: PreCommitChecksProfile = {
  enabled: true,
  mode: 'warn',
  runner: { type: 'compose_service', service: 'app' },
  steps: [
    { preset: 'format', enabled: true },
    { preset: 'lint', enabled: true },
    { preset: 'test', enabled: true },
  ],
};

const STEP_LABELS: Record<PreCommitStepPreset, string> = {
  format: 'Format',
  lint: 'Lint',
  test: 'Test',
};

const LANGUAGE_OPTIONS: PreCommitRuntimeLanguage[] = ['php', 'node'];

interface PreCommitProfileEditorProps {
  value: PreCommitChecksProfile | null;
  onChange: (v: PreCommitChecksProfile | null) => void;
  disabled?: boolean;
}

export function PreCommitProfileEditor({ value, onChange, disabled }: PreCommitProfileEditorProps) {
  if (!value) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ ...DEFAULT_PROFILE })}
        className="rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-50"
      >
        Enable pre-commit checks
      </button>
    );
  }

  const update = (patch: Partial<PreCommitChecksProfile>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      {/* Enabled */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="rounded border-border"
        />
        Enabled
      </label>

      {/* Mode */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Mode</label>
        <select
          value={value.mode}
          disabled={disabled}
          onChange={(e) => update({ mode: e.target.value as 'warn' | 'block' })}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        >
          <option value="warn">Warn</option>
          <option value="block">Block</option>
        </select>
      </div>

      {/* Runner */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Runner service <span className="text-muted-foreground/60">(compose_service)</span>
        </label>
        <input
          type="text"
          value={value.runner.service}
          disabled={disabled}
          onChange={(e) => update({ runner: { type: 'compose_service', service: e.target.value } })}
          placeholder="app"
          className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </div>

      {/* Steps */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Steps</label>
        <div className="space-y-2">
          {value.steps.map((step, i) => (
            <label key={step.preset} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={step.enabled}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...value.steps];
                  next[i] = { ...step, enabled: e.target.checked };
                  update({ steps: next });
                }}
                className="rounded border-border"
              />
              {STEP_LABELS[step.preset]}
            </label>
          ))}
        </div>
      </div>

      {/* Runtime (optional) */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Runtime</label>
        {value.runtime ? (
          <div className="flex items-center gap-2">
            <select
              value={value.runtime.language}
              disabled={disabled}
              onChange={(e) =>
                update({ runtime: { ...value.runtime!, language: e.target.value as PreCommitRuntimeLanguage } })
              }
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={value.runtime.version}
              disabled={disabled}
              onChange={(e) =>
                update({ runtime: { ...value.runtime!, version: e.target.value } })
              }
              placeholder="8.3"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const { runtime: _, ...rest } = value;
                onChange(rest as PreCommitChecksProfile);
              }}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => update({ runtime: { language: 'node', version: '' } })}
            className="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
          >
            Add runtime
          </button>
        )}
      </div>

      {/* Remove profile */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
      >
        Remove profile
      </button>
    </div>
  );
}
