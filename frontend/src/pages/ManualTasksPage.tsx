import { useState, useEffect } from 'react';
import { useTick } from '@/lib/useTick';
import { toast } from 'sonner';
import {
  ClipboardList,
  Plus,
  Trash2,
  Pencil,
  Clock,
  X,
  Play,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, getApiErrorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useRepo } from '@/context/RepoContext';
import type { ManualTask, ExecutionAction } from '@/types';

const RUN_ACTIONS: { action: ExecutionAction; label: string }[] = [
  { action: 'fix', label: 'Fix' },
  { action: 'feature', label: 'Feature' },
  { action: 'plan', label: 'Plan' },
];

export function ManualTasksPage() {
  useTick();
  const { selectedRepo } = useRepo();
  const [tasks, setTasks] = useState<ManualTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingInFlight, setDeletingInFlight] = useState(false);

  // Run dropdown
  const [runOpenId, setRunOpenId] = useState<string | null>(null);
  const [runningActions, setRunningActions] = useState<Set<string>>(new Set());
  const [publishPullRequest, setPublishPullRequest] = useState(true);

  const fetchTasks = async () => {
    try {
      const { data } = await api.get<ManualTask[]>('/manual-tasks');
      setTasks(data);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to load tasks'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding || !addTitle.trim()) return;

    setAdding(true);
    try {
      const { data } = await api.post<ManualTask>('/manual-tasks', {
        title: addTitle.trim(),
        description: addDescription.trim() || undefined,
      });
      setTasks((prev) => [data, ...prev]);
      setAddTitle('');
      setAddDescription('');
      setShowAddForm(false);
      toast.success('Task created');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to create task'));
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (task: ManualTask) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditDescription('');
  };

  const handleEdit = async (e: React.FormEvent, taskId: string) => {
    e.preventDefault();
    if (saving || !editTitle.trim()) return;

    setSaving(true);
    try {
      const { data } = await api.patch<ManualTask>(`/manual-tasks/${taskId}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data : t)));
      cancelEdit();
      toast.success('Task updated');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to update task'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (deletingInFlight) return;
    setDeletingInFlight(true);
    try {
      await api.delete(`/manual-tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDeleting(null);
      toast.success('Task deleted');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to delete task'));
      setDeleting(null);
    } finally {
      setDeletingInFlight(false);
    }
  };

  const handleRun = async (task: ManualTask, action: ExecutionAction) => {
    if (!selectedRepo) {
      toast.error('Select a repository first');
      return;
    }

    const key = `${task.id}-${action}`;
    setRunningActions((prev) => new Set(prev).add(key));
    try {
      await api.post('/executions', {
        repositoryId: selectedRepo.id,
        action,
        taskId: task.id,
        taskExternalId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        taskSource: 'manual',
        publishPullRequest,
      }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      setRunOpenId(null);
      toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} execution started`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to start execution'));
    } finally {
      setRunningActions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Manual Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create tasks manually and run Claude Code actions on them
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add task
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
            <h2 className="text-sm font-semibold">New Task</h2>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddTitle(''); setAddDescription(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              required
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="Task title"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Description <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <textarea
              value={addDescription}
              onChange={(e) => setAddDescription(e.target.value)}
              placeholder="Describe the task..."
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

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
                Create task
              </>
            )}
          </button>
        </form>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading tasks...</span>
        </div>
      )}

      {/* Task list */}
      {!loading && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              {editingId === task.id ? (
                <form onSubmit={(e) => handleEdit(e, task.id)}>
                  <div className="mb-3">
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div className="mb-3">
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description (optional)"
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
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
                    <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{task.title}</div>
                    {task.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/60">
                      <Clock className="h-3 w-3" />
                      {timeAgo(task.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Run dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          const opening = runOpenId !== task.id;
                          setRunOpenId(opening ? task.id : null);
                          if (opening) setPublishPullRequest(true);
                        }}
                        aria-label={`Run action for ${task.title}`}
                        aria-haspopup="menu"
                        aria-expanded={runOpenId === task.id}
                        className="flex items-center gap-1 rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        title="Run action"
                      >
                        <Play className="h-4 w-4" />
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {runOpenId === task.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-lg border border-border bg-card p-1 shadow-lg">
                          <label className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground cursor-pointer select-none hover:bg-foreground/5">
                            <input
                              type="checkbox"
                              checked={publishPullRequest}
                              onChange={(e) => setPublishPullRequest(e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-border accent-primary"
                            />
                            Publish PR
                          </label>
                          <div className="my-1 border-t border-border" />
                          {RUN_ACTIONS.map(({ action, label }) => {
                            const key = `${task.id}-${action}`;
                            return (
                              <button
                                key={action}
                                type="button"
                                disabled={runningActions.has(key) || !selectedRepo}
                                onClick={() => handleRun(task, action)}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-foreground/5 disabled:opacity-50"
                              >
                                {runningActions.has(key) ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                                {label}
                              </button>
                            );
                          })}
                          {!selectedRepo && (
                            <p className="px-3 py-1.5 text-[10px] text-muted-foreground">
                              Select a repo first
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => startEdit(task)}
                      aria-label={`Edit ${task.title}`}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      title="Edit task"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {/* Delete */}
                    {deleting === task.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(task.id)}
                          disabled={deletingInFlight}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {deletingInFlight ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleting(null)}
                          type="button"
                          aria-label="Cancel deletion"
                          title="Cancel"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleting(task.id)}
                        aria-label={`Delete ${task.title}`}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        title="Delete task"
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
      {!loading && tasks.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No manual tasks yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Create a task and run Claude Code actions on it
          </p>
        </div>
      )}
    </div>
  );
}
