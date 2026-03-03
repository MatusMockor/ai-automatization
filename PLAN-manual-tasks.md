# Manual Tasks — nová stránka s CRUD

## Context
Aktuálne sa úlohy dajú ťahať len z Jiry/Asany cez Connections. Používateľ chce mať možnosť vytvárať úlohy manuálne priamo v aplikácii — nová stránka `/manual-tasks` s CRUD operáciami, nezávislá od externých task managerov. Manuálne úlohy sa potom dajú spúšťať cez execution flow rovnako ako Jira/Asana tasky.

---

## 1. Backend — nový modul `manual-tasks`

### 1.1 Migrácia `backend/src/database/migrations/1741348800000-create-manual-tasks-table.ts`
- Nová tabuľka `manual_tasks`:
  - `id` UUID PK (uuid_generate_v4)
  - `user_id` UUID FK → users (CASCADE)
  - `title` varchar(4000) NOT NULL
  - `description` text, nullable
  - `created_at` timestamptz
  - `updated_at` timestamptz
- Index na `user_id`
- ALTER CHECK constraint `CHK_executions_task_source` na executions tabuľke — pridať `'manual'`

### 1.2 Entity `backend/src/manual-tasks/entities/manual-task.entity.ts`
- Podľa vzoru `ManagedRepository` entity — TypeORM dekorátory, snake_case stĺpce

### 1.3 DTOs `backend/src/manual-tasks/dto/`
- `create-manual-task.dto.ts` — `title` (required, 1-4000), `description` (optional, max 20000)
- `update-manual-task.dto.ts` — rovnaké polia, oba optional
- `manual-task-response.dto.ts` — id, title, description, createdAt, updatedAt

### 1.4 Service `backend/src/manual-tasks/manual-tasks.service.ts`
- `listForUser(userId)` — findBy userId, order by createdAt DESC
- `createForUser(userId, dto)` — save nový record
- `updateForUser(userId, taskId, dto)` — nájsť podľa id+userId, update
- `deleteForUser(userId, taskId)` — nájsť podľa id+userId, remove

### 1.5 Controller `backend/src/manual-tasks/manual-tasks.controller.ts`
- `GET /manual-tasks` → listForUser
- `POST /manual-tasks` → createForUser
- `PATCH /manual-tasks/:id` → updateForUser
- `DELETE /manual-tasks/:id` → deleteForUser

### 1.6 Module `backend/src/manual-tasks/manual-tasks.module.ts`
- Import TypeOrmModule.forFeature([ManualTask])
- Registrovať v `app.module.ts`

### 1.7 Aktualizácia TaskSource
- `backend/src/executions/interfaces/execution.types.ts` — pridať `'manual'` do TaskSource
- `backend/src/executions/dto/create-execution.dto.ts` — pridať `'manual'` do TASK_SOURCES

---

## 2. Frontend

### 2.1 Typy `frontend/src/types/index.ts`
- `TaskSource` — pridať `'manual'`
- Nový interface `ManualTask` — id, title, description, createdAt, updatedAt

### 2.2 Nová stránka `frontend/src/pages/ManualTasksPage.tsx`
- Podľa vzoru `RepositoriesPage` — rovnaký layout pattern:
  - Header s "Manual Tasks" + "Add task" button
  - Inline formulár (toggle showAddForm) s poliami title, description
  - Zoznam kariet — každá s title, description preview, dátum, edit/delete akcie
  - Inline edit (rovnaký formulár)
  - Delete s confirm pattern (rovnaký ako v RepositoriesPage)
  - Empty state s ikonou
- Tlačidlo "Run" na každej karte — otvorí výber action (Fix/Feature/Plan) a spustí execution
  - Vyžaduje aktívne repo z RepoContext
  - POST `/executions` s `taskSource: 'manual'`, `taskId: manualTask.id`, `taskExternalId: manualTask.id`

### 2.3 Routing `frontend/src/App.tsx`
- Import `ManualTasksPage`
- Pridať `<Route path="manual-tasks" element={<ManualTasksPage />} />`

### 2.4 Navigácia `frontend/src/components/dashboard/AppShell.tsx`
- Pridať do `navItems`: `{ to: '/manual-tasks', icon: ClipboardList, label: 'Manual Tasks' }`
- Import `ClipboardList` z lucide-react

---

## Kľúčové súbory na úpravu

| Súbor | Zmena |
|---|---|
| `backend/src/executions/interfaces/execution.types.ts` | pridať `'manual'` |
| `backend/src/executions/dto/create-execution.dto.ts` | pridať `'manual'` do TASK_SOURCES |
| `backend/src/app.module.ts` | import ManualTasksModule |
| `frontend/src/types/index.ts` | pridať `'manual'` + ManualTask interface |
| `frontend/src/App.tsx` | pridať route |
| `frontend/src/components/dashboard/AppShell.tsx` | pridať nav item |

## Nové súbory

| Súbor |
|---|
| `backend/src/database/migrations/1741348800000-create-manual-tasks-table.ts` |
| `backend/src/manual-tasks/manual-tasks.module.ts` |
| `backend/src/manual-tasks/manual-tasks.controller.ts` |
| `backend/src/manual-tasks/manual-tasks.service.ts` |
| `backend/src/manual-tasks/entities/manual-task.entity.ts` |
| `backend/src/manual-tasks/dto/create-manual-task.dto.ts` |
| `backend/src/manual-tasks/dto/update-manual-task.dto.ts` |
| `backend/src/manual-tasks/dto/manual-task-response.dto.ts` |
| `frontend/src/pages/ManualTasksPage.tsx` |

---

## Overenie
1. `npm run build` v backend — TypeScript kompiluje bez chýb
2. Spustiť migrácie — `manual_tasks` tabuľka sa vytvorí, executions constraint sa aktualizuje
3. CRUD cez API: POST/GET/PATCH/DELETE `/manual-tasks`
4. Frontend: `/manual-tasks` stránka sa zobrazí, dá sa vytvoriť/upraviť/zmazať task
5. Run execution z manual tasku — POST `/executions` s `taskSource: 'manual'` prejde validáciou
