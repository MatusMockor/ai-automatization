# Manual Tasks (CRUD, stored in DB)

## Context

Today all tasks come from external providers (Jira/Asana). Users should be able to create manual tasks directly in the dashboard, store them in the database, show them next to external tasks, and run executions from them.

## 1. DB migration - `manual_tasks` table

**New file:** `backend/src/database/migrations/1741348800000-create-manual-tasks-table.ts`

Follow the pattern used in `1741176000000-create-executions-table.ts`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | auto-generated |
| `user_id` | uuid FK -> users(id) ON DELETE CASCADE | |
| `title` | varchar(4000) NOT NULL | |
| `description` | text, nullable | |
| `status` | varchar(16) DEFAULT 'open' | CHECK: open, in_progress, done, closed |
| `created_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | |

Indexes: `(user_id)`, `(user_id, created_at)`

## 2. DB migration - extend `executions.task_source` CHECK constraint safely

**New file:** `backend/src/database/migrations/1741348800001-add-manual-task-source.ts`

Migration requirements:
- Discover existing CHECK constraint(s) for `executions.task_source` dynamically (do not hardcode `CHK_executions_task_source`).
- Drop the discovered constraint(s).
- Recreate a deterministic constraint name, for example `chk_executions_task_source_v2`.
- New rule: `task_source IN ('asana', 'jira', 'manual')`.
- `down()` must revert to `task_source IN ('asana', 'jira')` using deterministic naming.

## 3. Backend - entity, service, DTOs

**New file:** `backend/src/tasks/entities/manual-task.entity.ts`
- Standard TypeORM entity matching the table above.

**New file:** `backend/src/tasks/dto/create-manual-task.dto.ts`
- `title`: `@IsString() @MinLength(1) @MaxLength(4000)`
- `description?`: `@IsOptional() @IsString() @MaxLength(20000)`

**New file:** `backend/src/tasks/dto/manual-task-response.dto.ts`
- `id, title, description, status, createdAt, updatedAt`

**New file:** `backend/src/tasks/manual-tasks.service.ts`
- `createForUser(userId, dto)` -> create and save
- `listForUser(userId)` -> find by userId, ordered by createdAt DESC
- `deleteForUser(userId, taskId)` -> findOneBy and delete, throw `NotFoundException` if missing

## 4. Backend - update existing files

**`backend/src/executions/interfaces/execution.types.ts`**
- `TaskSource = 'asana' | 'jira' | 'manual'`

**`backend/src/executions/dto/create-execution.dto.ts`**
- `TASK_SOURCES = ['asana', 'jira', 'manual'] as const`

**`backend/src/tasks/dto/task-feed-response.dto.ts`**
- Change `TaskFeedItemDto.source` from `TaskManagerProviderType` to strict union `'asana' | 'jira' | 'manual'` (not `string`).

**`backend/src/tasks/tasks.controller.ts`**
- Inject `ManualTasksService`.
- Add three endpoints (before existing `@Get()`):
  - `POST /tasks/manual` -> `createManualTask`
  - `GET /tasks/manual` -> `listManualTasks`
  - `DELETE /tasks/manual/:id` -> `deleteManualTask`

**`backend/src/tasks/tasks.service.ts`**
- Inject `ManualTasksService` (or repository directly).
- In `getTasksForUser()`, fetch manual tasks after external tasks.
- Map `ManualTask` -> `TaskFeedItemDto`:
  - `id: "manual:${task.id}"`, `connectionId: ""`, `externalId: task.id`
  - `source: "manual"`, `url: ""`, `assignee: null`, `matchedPrefix: null`
- Important: remove early return when `connections.length === 0` so manual tasks are still returned.
- Merge manual items into `items` before sort and limit.

**`backend/src/tasks/tasks.module.ts`**
- Add `TypeOrmModule.forFeature([ManualTask])` to imports.
- Add `ManualTasksService` to providers.

## 5. Frontend - types

**`frontend/src/types/index.ts`**
- `TaskSource = 'jira' | 'asana' | 'manual'`
- Add:
  ```ts
  export interface ManualTask {
    id: string;
    title: string;
    description: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  }
  ```

## 6. Frontend - SourceBadge

**`frontend/src/components/shared/SourceBadge.tsx`**
- Add `manual: { label: 'Manual', bg: 'bg-amber-500/8 text-amber-400', dot: 'bg-amber-400' }`.

## 7. Frontend - CreateManualTaskDialog

**New file:** `frontend/src/components/dashboard/CreateManualTaskDialog.tsx`

Use existing dialog from `@/components/ui/dialog.tsx`:
- Required title input
- Optional description textarea
- Submit -> `POST /api/tasks/manual`
- On success: close dialog and trigger task list refresh callback

## 8. Frontend - Dashboard

**`frontend/src/components/dashboard/Dashboard.tsx`**
- Add `New Task` button in top bar (next to search input).
- State: `createDialogOpen`.
- Render `<CreateManualTaskDialog>`.
- `onCreated` callback should re-fetch task list.
- Add `handleDeleteManualTask`: `DELETE /api/tasks/manual/${selectedTask.externalId}` then remove from list and clear `selectedTask`.
- Pass `onDelete` to `TaskDetail` for manual tasks.

## 9. Frontend - TaskDetail

**`frontend/src/components/dashboard/TaskDetail.tsx`**
- Add optional prop `onDelete?: () => void`.
- Hide `Open externally` button when `task.source === 'manual'`.
- Show `Delete` button when `onDelete` is defined (red button with Trash2 icon).

## Files changed (summary)

| File | Change |
|------|--------|
| `backend/src/database/migrations/1741348800000-*` | New - create `manual_tasks` table |
| `backend/src/database/migrations/1741348800001-*` | New - update `executions.task_source` CHECK constraint |
| `backend/src/tasks/entities/manual-task.entity.ts` | New - `ManualTask` entity |
| `backend/src/tasks/dto/create-manual-task.dto.ts` | New - validation DTO |
| `backend/src/tasks/dto/manual-task-response.dto.ts` | New - response DTO |
| `backend/src/tasks/manual-tasks.service.ts` | New - CRUD service |
| `backend/src/tasks/tasks.controller.ts` | Add three manual task endpoints |
| `backend/src/tasks/tasks.service.ts` | Merge manual tasks into feed |
| `backend/src/tasks/tasks.module.ts` | Register entity and service |
| `backend/src/tasks/dto/task-feed-response.dto.ts` | Strict union for task source |
| `backend/src/executions/interfaces/execution.types.ts` | Add `manual` to `TaskSource` |
| `backend/src/executions/dto/create-execution.dto.ts` | Add `manual` to `TASK_SOURCES` |
| `frontend/src/types/index.ts` | Add `manual` to `TaskSource`, add `ManualTask` type |
| `frontend/src/components/shared/SourceBadge.tsx` | Add manual source config |
| `frontend/src/components/dashboard/CreateManualTaskDialog.tsx` | New - create dialog |
| `frontend/src/components/dashboard/Dashboard.tsx` | Add create button and delete handler |
| `frontend/src/components/dashboard/TaskDetail.tsx` | Conditional external link and delete button |

## Verification

1. `POST /api/tasks/manual` with title and description returns `ManualTask`.
2. `GET /api/tasks` returns manual tasks together with Jira/Asana tasks, even with zero connections.
3. Dashboard flow: click `New Task` -> fill dialog -> submit -> new task appears with `Manual` badge.
4. Open a manual task in `TaskDetail` -> no `Open externally` button and visible `Delete` button.
5. Start execution (`Fix`/`Feature`/`Plan`) from manual task -> works like external tasks.
6. Delete manual task -> item disappears from list.
7. TypeScript build passes for both FE and BE.
