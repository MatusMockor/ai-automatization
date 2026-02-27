# Manual Tasks (CRUD, stored in DB)

## Context

Currently all tasks come from external connections (Jira/Asana). User chce vytvárať tasky manuálne priamo v dashboarde — uložené v DB, zobrazené vedľa externých taskov, použiteľné na spúšťanie executions.

## 1. DB migration — `manual_tasks` tabuľka

**New file:** `backend/src/database/migrations/1741348800000-create-manual-tasks-table.ts`

Follow pattern from `1741176000000-create-executions-table.ts`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | auto-generated |
| `user_id` | uuid FK → users(id) ON DELETE CASCADE | |
| `title` | varchar(4000) NOT NULL | |
| `description` | text, nullable | |
| `status` | varchar(16) DEFAULT 'open' | CHECK: open, in_progress, done, closed |
| `created_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | |

Indexes: `(user_id)`, `(user_id, created_at)`

## 2. DB migration — rozšíriť `CHK_executions_task_source`

**New file:** `backend/src/database/migrations/1741348800001-add-manual-task-source.ts`

- Drop `CHK_executions_task_source`
- Recreate: `task_source IN ('asana', 'jira', 'manual')`

## 3. Backend — entity, service, DTOs

**New file:** `backend/src/tasks/entities/manual-task.entity.ts`
- Standard TypeORM entity matching the table above

**New file:** `backend/src/tasks/dto/create-manual-task.dto.ts`
- `title`: `@IsString() @MinLength(1) @MaxLength(4000)`
- `description?`: `@IsOptional() @IsString() @MaxLength(20000)`

**New file:** `backend/src/tasks/dto/manual-task-response.dto.ts`
- `id, title, description, status, createdAt, updatedAt`

**New file:** `backend/src/tasks/manual-tasks.service.ts`
- `createForUser(userId, dto)` — create + save
- `listForUser(userId)` — find where userId, order createdAt DESC
- `deleteForUser(userId, taskId)` — findOneBy + delete, throw NotFoundException if not found

## 4. Backend — update existing files

**`backend/src/executions/interfaces/execution.types.ts`**
- `TaskSource = 'asana' | 'jira' | 'manual'`

**`backend/src/executions/dto/create-execution.dto.ts`**
- `TASK_SOURCES = ['asana', 'jira', 'manual'] as const`

**`backend/src/tasks/dto/task-feed-response.dto.ts`**
- `TaskFeedItemDto.source` typ zmeniť z `TaskManagerProviderType` na `string` (alebo nový union `'asana' | 'jira' | 'manual'`)

**`backend/src/tasks/tasks.controller.ts`**
- Inject `ManualTasksService`
- Pridať 3 endpointy (pred existujúci `@Get()`):
  - `POST /tasks/manual` → `createManualTask`
  - `GET /tasks/manual` → `listManualTasks`
  - `DELETE /tasks/manual/:id` → `deleteManualTask`

**`backend/src/tasks/tasks.service.ts`**
- Inject `ManualTasksService` (alebo priamo repository)
- V `getTasksForUser()`: po fetchnutí externých taskov fetchnúť aj manuálne
- Namapovať `ManualTask` → `TaskFeedItemDto`:
  - `id: "manual:${task.id}"`, `connectionId: ""`, `externalId: task.id`
  - `source: "manual"`, `url: ""`, `assignee: null`, `matchedPrefix: null`
- **Dôležité:** odstrániť early return keď `connections.length === 0` — manuálne tasky sa musia zobraziť aj bez connections
- Mergnúť do `items` pred sort + limit

**`backend/src/tasks/tasks.module.ts`**
- Pridať `TypeOrmModule.forFeature([ManualTask])` do imports
- Pridať `ManualTasksService` do providers

## 5. Frontend — typy

**`frontend/src/types/index.ts`**
- `TaskSource = 'jira' | 'asana' | 'manual'`
- Pridať:
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

## 6. Frontend — SourceBadge

**`frontend/src/components/shared/SourceBadge.tsx`**
- Pridať `manual: { label: 'Manual', bg: 'bg-amber-500/8 text-amber-400', dot: 'bg-amber-400' }`

## 7. Frontend — CreateManualTaskDialog

**New file:** `frontend/src/components/dashboard/CreateManualTaskDialog.tsx`

Použiť existujúci Dialog z `@/components/ui/dialog.tsx`:
- Title input (required)
- Description textarea (optional)
- Submit → `POST /api/tasks/manual`
- On success: close + callback na refresh task listu

## 8. Frontend — Dashboard

**`frontend/src/components/dashboard/Dashboard.tsx`**
- Pridať "New Task" button do top baru (vedľa search inputu)
- State: `createDialogOpen`
- Renderovať `<CreateManualTaskDialog>`
- `onCreated` callback: re-fetchne task list
- Pridať `handleDeleteManualTask`: `DELETE /api/tasks/manual/${selectedTask.externalId}` → remove z tasks, clear selectedTask
- Passnúť `onDelete` do `TaskDetail` pre manuálne tasky

## 9. Frontend — TaskDetail

**`frontend/src/components/dashboard/TaskDetail.tsx`**
- Pridať `onDelete?: () => void` do props
- Skryť "Open externally" button keď `task.source === 'manual'`
- Zobraziť "Delete" button keď `onDelete` je defined (červený, s Trash2 ikonou)

## Files changed (summary)

| File | Change |
|------|--------|
| `backend/src/database/migrations/1741348800000-*` | New — create manual_tasks table |
| `backend/src/database/migrations/1741348800001-*` | New — update executions CHECK constraint |
| `backend/src/tasks/entities/manual-task.entity.ts` | New — ManualTask entity |
| `backend/src/tasks/dto/create-manual-task.dto.ts` | New — validation DTO |
| `backend/src/tasks/dto/manual-task-response.dto.ts` | New — response DTO |
| `backend/src/tasks/manual-tasks.service.ts` | New — CRUD service |
| `backend/src/tasks/tasks.controller.ts` | Add 3 manual task endpoints |
| `backend/src/tasks/tasks.service.ts` | Merge manual tasks into feed |
| `backend/src/tasks/tasks.module.ts` | Register entity + service |
| `backend/src/tasks/dto/task-feed-response.dto.ts` | Broaden source type |
| `backend/src/executions/interfaces/execution.types.ts` | Add 'manual' to TaskSource |
| `backend/src/executions/dto/create-execution.dto.ts` | Add 'manual' to TASK_SOURCES |
| `frontend/src/types/index.ts` | Add 'manual' to TaskSource, add ManualTask type |
| `frontend/src/components/shared/SourceBadge.tsx` | Add manual config |
| `frontend/src/components/dashboard/CreateManualTaskDialog.tsx` | New — create dialog |
| `frontend/src/components/dashboard/Dashboard.tsx` | Add create button, delete handler |
| `frontend/src/components/dashboard/TaskDetail.tsx` | Conditional external link, delete button |

## Verification

1. `POST /api/tasks/manual` s title + description → vráti ManualTask
2. `GET /api/tasks` → manuálne tasky sa zobrazia vedľa Jira/Asana taskov (aj keď nie sú žiadne connections)
3. Dashboard → "New Task" button → dialog → vyplniť → submit → task sa objaví v liste s "Manual" badge
4. Kliknúť na manuálny task → TaskDetail bez "Open externally" tlačidla, s "Delete" tlačidlom
5. Spustiť execution (Fix/Feature/Plan) z manuálneho tasku → funguje rovnako ako z externého
6. Delete manuálny task → zmizne z listu
7. TypeScript build bez chýb (FE aj BE)
