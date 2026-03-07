import { useState, useEffect } from 'react';
import { useTick } from '@/lib/useTick';
import { toast } from 'sonner';
import {
  Zap,
  Plus,
  Trash2,
  Pencil,
  Clock,
  X,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useRepo } from '@/context/RepoContext';
import { useTaskScopes } from '@/lib/useTaskScopes';
import type {
  AutomationRule,
  AutomationRuleScopeType,
  CreateAutomationRuleRequest,
  UpdateAutomationRuleRequest,
  TaskManagerProvider,
  TaskFeedStatus,
  ExecutionAction,
} from '@/types';

const ALL_STATUSES: TaskFeedStatus[] = ['open', 'in_progress', 'done', 'closed'];
const STATUS_LABELS: Record<TaskFeedStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  closed: 'Closed',
  unknown: 'Unknown',
};

const ACTION_OPTIONS: { value: ExecutionAction; label: string }[] = [
  { value: 'fix', label: 'Fix' },
  { value: 'feature', label: 'Feature' },
  { value: 'plan', label: 'Plan' },
];

interface AddForm {
  name: string;
  provider: TaskManagerProvider;
  repositoryId: string;
  priority: number;
  enabled: boolean;
  scopeType: AutomationRuleScopeType | '';
  scopeId: string;
  titleContainsInput: string;
  titleContains: string[];
  taskStatuses: TaskFeedStatus[];
  suggestedAction: ExecutionAction | '';
}

const defaultAddForm: AddForm = {
  name: '',
  provider: 'asana',
  repositoryId: '',
  priority: 0,
  enabled: true,
  scopeType: '',
  scopeId: '',
  titleContainsInput: '',
  titleContains: [],
  taskStatuses: [],
  suggestedAction: '',
};

type EditForm = AddForm;

function getScopeTypeOptions(provider: TaskManagerProvider): { value: AutomationRuleScopeType; label: string }[] {
  if (provider === 'asana') {
    return [
      { value: 'asana_workspace', label: 'Asana Workspace' },
      { value: 'asana_project', label: 'Asana Project' },
    ];
  }
  return [{ value: 'jira_project', label: 'Jira Project' }];
}

function getScopeIdOptions(scopeType: AutomationRuleScopeType | '', scopes: ReturnType<typeof useTaskScopes>['scopes']) {
  if (!scopes || !scopeType) return null;
  if (scopeType === 'asana_workspace') {
    return scopes.asanaWorkspaces.map((ws) => ({ value: ws.id, label: ws.name }));
  }
  if (scopeType === 'asana_project') {
    return scopes.asanaProjects.map((p) => ({ value: p.id, label: `${p.name} (${p.workspaceName})` }));
  }
  if (scopeType === 'jira_project') {
    return scopes.jiraProjects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }));
  }
  return null;
}

export function AutomationRulesPage() {
  useTick();
  const { repositories } = useRepo();
  const { scopes } = useTaskScopes();

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(defaultAddForm);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(defaultAddForm);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingInFlight, setDeletingInFlight] = useState(false);

  // Toggle
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRules = async () => {
    try {
      const { data } = await api.get<AutomationRule[]>('/automation-rules');
      setRules(data);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to load automation rules'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  // --- Helpers ---

  const getScopeName = (rule: AutomationRule): string | null => {
    if (!rule.scopeType || !rule.scopeId) return null;
    if (!scopes) return rule.scopeId;
    if (rule.scopeType === 'asana_workspace') {
      return scopes.asanaWorkspaces.find((ws) => ws.id === rule.scopeId)?.name ?? rule.scopeId;
    }
    if (rule.scopeType === 'asana_project') {
      const p = scopes.asanaProjects.find((proj) => proj.id === rule.scopeId);
      return p ? `${p.name} (${p.workspaceName})` : rule.scopeId;
    }
    if (rule.scopeType === 'jira_project') {
      const p = scopes.jiraProjects.find((proj) => proj.key === rule.scopeId);
      return p ? `${p.name} (${p.key})` : rule.scopeId;
    }
    return rule.scopeId;
  };

  const getRepoName = (repoId: string): string => {
    return repositories.find((r) => r.id === repoId)?.fullName ?? repoId;
  };

  // --- Add ---

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding || !addForm.name.trim() || !addForm.repositoryId) return;

    setAdding(true);
    try {
      const body: CreateAutomationRuleRequest = {
        name: addForm.name.trim(),
        provider: addForm.provider,
        repositoryId: addForm.repositoryId,
        enabled: addForm.enabled,
        priority: addForm.priority,
      };
      if (addForm.scopeType) body.scopeType = addForm.scopeType;
      if (addForm.scopeId) body.scopeId = addForm.scopeId;
      if (addForm.titleContains.length > 0) body.titleContains = addForm.titleContains;
      if (addForm.taskStatuses.length > 0) body.taskStatuses = addForm.taskStatuses;
      if (addForm.suggestedAction) body.suggestedAction = addForm.suggestedAction;

      const { data } = await api.post<AutomationRule>('/automation-rules', body);
      setRules((prev) => [data, ...prev]);
      setAddForm(defaultAddForm);
      setShowAddForm(false);
      toast.success('Rule created');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to create rule'));
    } finally {
      setAdding(false);
    }
  };

  // --- Edit ---

  const startEdit = (rule: AutomationRule) => {
    setEditingId(rule.id);
    setEditForm({
      name: rule.name,
      provider: rule.provider,
      repositoryId: rule.repositoryId,
      priority: rule.priority,
      enabled: rule.enabled,
      scopeType: rule.scopeType ?? '',
      scopeId: rule.scopeId ?? '',
      titleContainsInput: '',
      titleContains: rule.titleContains ?? [],
      taskStatuses: rule.taskStatuses ?? [],
      suggestedAction: rule.suggestedAction ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(defaultAddForm);
  };

  const handleEdit = async (e: React.FormEvent, ruleId: string) => {
    e.preventDefault();
    if (saving || !editForm.name.trim() || !editForm.repositoryId) return;

    setSaving(true);
    try {
      const body: UpdateAutomationRuleRequest = {
        name: editForm.name.trim(),
        provider: editForm.provider,
        repositoryId: editForm.repositoryId,
        enabled: editForm.enabled,
        priority: editForm.priority,
        scopeType: editForm.scopeType || null,
        scopeId: editForm.scopeId || null,
        titleContains: editForm.titleContains.length > 0 ? editForm.titleContains : null,
        taskStatuses: editForm.taskStatuses.length > 0 ? editForm.taskStatuses : null,
        suggestedAction: editForm.suggestedAction || null,
      };

      const { data } = await api.patch<AutomationRule>(`/automation-rules/${ruleId}`, body);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? data : r)));
      cancelEdit();
      toast.success('Rule updated');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to update rule'));
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---

  const handleDelete = async (ruleId: string) => {
    if (deletingInFlight) return;
    setDeletingInFlight(true);
    try {
      await api.delete(`/automation-rules/${ruleId}`);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setDeleting(null);
      toast.success('Rule deleted');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to delete rule'));
      setDeleting(null);
    } finally {
      setDeletingInFlight(false);
    }
  };

  // --- Toggle ---

  const handleToggle = async (rule: AutomationRule) => {
    if (togglingId) return;
    setTogglingId(rule.id);
    try {
      const { data } = await api.patch<AutomationRule>(`/automation-rules/${rule.id}`, {
        enabled: !rule.enabled,
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? data : r)));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to toggle rule'));
    } finally {
      setTogglingId(null);
    }
  };

  // --- Shared form fields renderer ---

  const renderFormFields = (
    form: AddForm | EditForm,
    setForm: React.Dispatch<React.SetStateAction<AddForm>> | React.Dispatch<React.SetStateAction<EditForm>>,
  ) => {
    const scopeIdOptions = getScopeIdOptions(form.scopeType as AutomationRuleScopeType | '', scopes);

    const updateField = <K extends keyof AddForm>(key: K, value: AddForm[K]) => {
      (setForm as React.Dispatch<React.SetStateAction<AddForm>>)((prev) => ({ ...prev, [key]: value }));
    };

    const addTag = () => {
      const tag = form.titleContainsInput.trim();
      if (tag && !form.titleContains.includes(tag)) {
        updateField('titleContains', [...form.titleContains, tag]);
      }
      updateField('titleContainsInput', '');
    };

    const removeTag = (tag: string) => {
      updateField('titleContains', form.titleContains.filter((t) => t !== tag));
    };

    const toggleStatus = (status: TaskFeedStatus) => {
      updateField(
        'taskStatuses',
        form.taskStatuses.includes(status)
          ? form.taskStatuses.filter((s) => s !== status)
          : [...form.taskStatuses, status],
      );
    };

    return (
      <>
        {/* Name */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Rule name"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Provider */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Provider</label>
          <select
            required
            value={form.provider}
            onChange={(e) => {
              updateField('provider', e.target.value as TaskManagerProvider);
              updateField('scopeType', '');
              updateField('scopeId', '');
            }}
            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          >
            <option value="asana">Asana</option>
            <option value="jira">Jira</option>
          </select>
        </div>

        {/* Repository */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Repository</label>
          <select
            required
            value={form.repositoryId}
            onChange={(e) => updateField('repositoryId', e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          >
            <option value="">Select repository</option>
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>{repo.fullName}</option>
            ))}
          </select>
        </div>

        {/* Priority + Enabled row */}
        <div className="mb-3 flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Priority</label>
            <input
              type="number"
              min={0}
              value={form.priority}
              onChange={(e) => updateField('priority', parseInt(e.target.value) || 0)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => updateField('enabled', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            Enabled
          </label>
        </div>

        {/* Scope Type */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Scope Type <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            value={form.scopeType}
            onChange={(e) => {
              updateField('scopeType', e.target.value as AutomationRuleScopeType | '');
              updateField('scopeId', '');
            }}
            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          >
            <option value="">No scope filter</option>
            {getScopeTypeOptions(form.provider).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Scope ID */}
        {form.scopeType && (
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Scope ID</label>
            {scopeIdOptions ? (
              <select
                value={form.scopeId}
                onChange={(e) => updateField('scopeId', e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              >
                <option value="">Select scope</option>
                {scopeIdOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.scopeId}
                onChange={(e) => updateField('scopeId', e.target.value)}
                placeholder="Scope identifier"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            )}
          </div>
        )}

        {/* Title Contains */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Title Contains <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {form.titleContains.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-md bg-foreground/5 px-2 py-0.5 text-xs ring-1 ring-foreground/10"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={form.titleContainsInput}
            onChange={(e) => updateField('titleContainsInput', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Type keyword and press Enter"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Task Statuses */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Task Statuses <span className="text-muted-foreground/50">(none = match all)</span>
          </label>
          <div className="flex flex-wrap gap-3">
            {ALL_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.taskStatuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                {STATUS_LABELS[status]}
              </label>
            ))}
          </div>
        </div>

        {/* Suggested Action */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Suggested Action <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            value={form.suggestedAction}
            onChange={(e) => updateField('suggestedAction', e.target.value as ExecutionAction | '')}
            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          >
            <option value="">No suggested action</option>
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Automation Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define rules to automatically match tasks to repositories and suggest actions
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add rule
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">New Rule</h2>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddForm(defaultAddForm); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {renderFormFields(addForm, setAddForm)}

          <button
            type="submit"
            disabled={adding}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Create rule
              </>
            )}
          </button>
        </form>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading rules...</span>
        </div>
      )}

      {/* Rules list */}
      {!loading && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              {editingId === rule.id ? (
                <form onSubmit={(e) => handleEdit(e, rule.id)}>
                  {renderFormFields(editForm, setEditForm)}
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/5 ring-1 ring-foreground/10">
                    <Zap className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{rule.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          rule.enabled
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-foreground/5 text-muted-foreground'
                        }`}
                      >
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5 ring-1 ring-foreground/10">
                        {rule.provider === 'asana' ? 'Asana' : 'Jira'}
                      </span>
                      {getScopeName(rule) && (
                        <span className="rounded bg-foreground/5 px-1.5 py-0.5 ring-1 ring-foreground/10">
                          {getScopeName(rule)}
                        </span>
                      )}
                      <span>{getRepoName(rule.repositoryId)}</span>
                      {rule.priority > 0 && (
                        <span>Priority: {rule.priority}</span>
                      )}
                      {rule.suggestedAction && (
                        <span className="rounded bg-foreground/5 px-1.5 py-0.5 ring-1 ring-foreground/10">
                          {rule.suggestedAction.charAt(0).toUpperCase() + rule.suggestedAction.slice(1)}
                        </span>
                      )}
                    </div>

                    {rule.titleContains && rule.titleContains.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rule.titleContains.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] ring-1 ring-foreground/10"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {rule.taskStatuses && rule.taskStatuses.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {rule.taskStatuses.map((s) => (
                          <span
                            key={s}
                            className="rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] ring-1 ring-foreground/10"
                          >
                            {STATUS_LABELS[s]}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/60">
                      <Clock className="h-3 w-3" />
                      {timeAgo(rule.updatedAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Toggle enabled */}
                    <button
                      type="button"
                      onClick={() => handleToggle(rule)}
                      disabled={togglingId === rule.id}
                      aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                      className={`rounded-lg p-2 transition-colors ${
                        rule.enabled
                          ? 'text-emerald-500 hover:bg-emerald-500/10'
                          : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                      } disabled:opacity-50`}
                      title={rule.enabled ? 'Disable' : 'Enable'}
                    >
                      <Zap className="h-4 w-4" />
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => startEdit(rule)}
                      aria-label={`Edit ${rule.name}`}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                      title="Edit rule"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {/* Delete */}
                    {deleting === rule.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          disabled={deletingInFlight}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {deletingInFlight ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleting(null)}
                          type="button"
                          aria-label="Cancel deletion"
                          title="Cancel"
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleting(rule.id)}
                        aria-label={`Delete ${rule.name}`}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && rules.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Zap className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No automation rules yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Create rules to automatically match tasks to repositories and suggest actions
          </p>
        </div>
      )}
    </div>
  );
}
