# AI Task Automation Platform - Implementation Plan

## Context

Lokálna Docker-based platforma na prepojenie task manažérov (Asana, Jira) s Claude Code CLI. Používateľ filtruje tasky podľa prefixov a jedným klikom spustí automatickú prácu na vybranom repozitári.

**Stack:** NestJS + React + PostgreSQL + Docker | Multi-user s JWT auth

---

## Project Structure (Monorepo)

```
ai-automatization/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── backend/                    # NestJS
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── common/             # Guards, decorators, filters, encryption
│       ├── config/             # ConfigModule
│       ├── database/           # TypeORM migrations
│       ├── auth/               # JWT auth
│       ├── users/              # User entity & CRUD
│       ├── settings/           # Per-user settings (encrypted tokens)
│       ├── task-managers/      # Asana/Jira providers (Strategy pattern)
│       ├── repositories/       # Git repo management
│       └── claude-execution/   # CLI subprocess, SSE streaming
└── frontend/                   # React + Vite
    ├── Dockerfile
    ├── .docker/nginx.conf
    ├── package.json
    └── src/
        ├── main.tsx
        ├── app/                # Routes, providers
        ├── components/         # UI (layout, dashboard, terminal, settings)
        ├── features/           # Feature modules (auth, tasks, claude, settings, repos)
        ├── lib/                # Axios, query client
        ├── pages/              # Page components
        └── styles/             # Tailwind
```

---

## Database Schema

| Table | Key Columns |
|-------|-------------|
| **users** | id (UUID), email (unique), password_hash, name |
| **user_settings** | user_id (FK unique), github_token (enc), claude_api_key (enc), preferences (JSONB) |
| **task_manager_connections** | user_id (FK), provider ('asana'\|'jira'), access_token (enc), config (JSONB) |
| **task_prefixes** | connection_id (FK), prefix (varchar) |
| **repositories** | user_id (FK), full_name, clone_url, local_path, is_cloned |
| **executions** | user_id (FK), repository_id (FK), task_title, action, prompt, status, output, pid |

---

## PRs Breakdown

### PR 1: Project Scaffolding + Docker + DB
**Scope:** Základný setup - oba projekty, Docker, databáza

Backend:
- `nest new backend` (NestJS scaffold)
- ConfigModule s `.env` validáciou (root `.env` zdieľaný cez docker-compose `env_file`)
- TypeORM setup + pripojenie na PostgreSQL
- Healthcheck endpoint (`GET /health`)

Backend Docker dev experience:
- **Hot reload** v Dockeri - bind mount `./backend/src` do kontajnera + `npm run start:dev` (nestjs `--watch`)
- Dockerfile s dev targetom (`docker-compose.dev.yml` alebo multi-stage: dev stage používa `nest start --watch`)
- `.env` súbor v roote projektu, docker-compose ho načíta cez `env_file: .env` - jedna `.env` pre všetky služby
- `.env.example` s popismi všetkých premenných (DB, JWT, ENCRYPTION_KEY, porty)

Frontend:
- `npm create vite frontend -- --template react-ts`
- Tailwind CSS + shadcn/ui init
- Path aliases (`@/`)
- Základný routing (React Router v7) - prázdne stránky

Infra:
- `docker-compose.yml` - postgres + backend + frontend
- Backend `Dockerfile` (node:22-alpine + git + claude-code CLI)
- Frontend `Dockerfile` (multi-stage: node build → nginx serve)
- `.docker/nginx.conf` (SPA fallback, /api proxy)
- `.env.example`, `.gitignore`

Docker / PostgreSQL izolácia:
- PostgreSQL beží na **custom porte** (napr. `5433:5432`) aby nekolidoval s lokálnymi PG inštanciami
- Vlastný **named volume** s project-specific názvom: `ai_automation_pg_data` (nie generický `pg_data`)
- Vlastný **docker network** (`ai-automation-net`) aby kontajnery boli izolované od iných projektov
- DB credentials unikátne pre tento projekt (user: `ai_automation`, db: `ai_automation_db`)
- Backend sa pripája na postgres cez docker network hostname (nie localhost)
- `docker-compose down` zmaže kontajnery ale **volume zostáva** - data sa nestratia
- Na úplný reset: `docker-compose down -v` (explicitne s `-v` flagom)

**Výsledok:** `docker-compose up` spustí 3 služby, frontend ukazuje prázdnu stránku, backend vracia healthcheck. PostgreSQL je plne izolovaný od ostatných lokálnych databáz.

---

### PR 2: Auth (Backend + Frontend)
**Scope:** Registrácia, prihlásenie, JWT ochrana

Backend:
- `User` entity + migration
- `AuthModule`: register, login, JWT strategy
- `@Public()` decorator + global `JwtAuthGuard`
- `GET /auth/me` endpoint
- bcrypt hashing, class-validator DTOs

Frontend:
- Zustand auth store (tokens, user, isAuthenticated)
- Axios instance + JWT interceptor (auto-attach Bearer token)
- `LoginPage`, `RegisterPage` (React Hook Form + Zod)
- `ProtectedRoute` component
- `AppShell` layout (sidebar + header + outlet)

**Výsledok:** Register → Login → vidíš prázdny dashboard za protected route

---

### PR 3: Settings + Encryption
**Scope:** Per-user nastavenia, šifrovanie tokenov

Backend:
- `EncryptionService` (AES-256-GCM)
- `UserSettings` entity + migration
- `GET /settings` (tokeny maskované), `PATCH /settings`
- Šifrovanie github_token, claude_api_key pri uložení

Frontend:
- `SettingsPage` so sekciami:
  - GitHub token input
  - Claude API key input
- TanStack Query hooks pre settings CRUD
- Toast notifikácie (shadcn/ui Sonner)

**Výsledok:** Používateľ uloží tokeny, sú šifrované v DB

---

### PR 4: Repository Management
**Scope:** Pridávanie a správa GitHub repozitárov

Backend:
- `Repository` entity + migration
- `GET/POST/DELETE /repositories`
- `POST /repositories/:id/sync` (git pull)
- Clone logic: validate repo on GitHub API → `git clone` do `/app/repos/`
- Používa user's GitHub token

Frontend:
- `RepositorySection` v settings (add/remove repos)
- `RepoSelector` dropdown v sidebar
- Zustand store pre `activeRepoId`

**Výsledok:** Pridáš repo → backend ho naklonuje → vidíš ho v selektore

---

### PR 5: Task Manager Integration (Asana + Jira)
**Scope:** Prepojenie na externé task manažéry, Strategy pattern

Backend:
- `TaskManagerProvider` interface: `validateConnection()`, `fetchTasks()`, `fetchProjects()`
- `AsanaProvider` (npm `asana`)
- `JiraProvider` (npm `jira.js`)
- `TaskManagerConnection` + `TaskPrefix` entities + migrations
- `POST /task-managers/connections` (connect + validate)
- `DELETE /task-managers/connections/:id`
- `GET /task-managers/connections/:id/tasks` (fetch + filter by prefixes)
- `POST/DELETE /task-managers/connections/:id/prefixes`
- Provider registry (Map-based, ľahko rozšíriteľný)

Frontend:
- `TaskManagerSection` v settings:
  - Asana connection form (API token + workspace/project selection)
  - Jira connection form (URL + token)
  - "Test Connection" button
- `PrefixConfigSection` - pridávanie/odoberanie prefix chipov

**Výsledok:** Prepojíš Asana/Jira → pridáš prefixy → system vie fetchnúť a filtrovať tasky

---

### PR 6: Dashboard + Task List
**Scope:** Hlavný dashboard so zobrazením taskov

Backend:
- Agregovaný endpoint: `GET /tasks?repoId=&prefixes=` - fetchne tasky zo všetkých pripojených manažérov a filtruje

Frontend:
- `DashboardPage` s komponentmi:
  - `PrefixFilter` - horizontálne chip filtre
  - `TaskList` - zoznam taskov
  - `TaskCard` - karta s názvom, source badge (Asana/Jira), prefix tag, assignee
- `TaskDetailPage` - plný detail tasku + metadata
- Loading skeletony, empty states
- TanStack Query hooks s cache invalidation

**Výsledok:** Dashboard zobrazuje tasky z Asana/Jira, filtrované podľa prefixov

---

### PR 7: Claude Code Execution
**Scope:** Spúšťanie Claude Code CLI, real-time output

Backend:
- `Execution` entity + migration
- `ClaudeProcessManager`:
  - `spawn()` - spustí `claude -p "<prompt>" --output-format stream-json` ako child process
  - `cancel()` - SIGTERM → SIGKILL po 5s
  - EventEmitter pre stdout/stderr streaming
  - cwd = repository local_path, ANTHROPIC_API_KEY z user settings
- `POST /executions` - štart (max 2 concurrent per user)
- `GET /executions` - história
- `GET /executions/:id` - detail
- `GET /executions/:id/stream` - SSE endpoint (@Sse decorator)
- `POST /executions/:id/cancel`
- Process cleanup na shutdown (OnModuleDestroy)

Frontend:
- `ActionButtons` na TaskDetailPage: "Fix", "Feature", "Plan"
  - Klik → POST /executions → navigácia na output page
- `ClaudeOutputPage`:
  - `TerminalView` - xterm.js (@xterm/xterm + @xterm/addon-fit)
  - SSE pripojenie (EventSource) → data sa píšu do xterm
  - `TerminalHeader` - status badge, Stop button, Copy button
- Execution history list na TaskDetailPage

**Výsledok:** Klikneš "Fix" → Claude Code beží → vidíš live output v terminále → môžeš zrušiť

---

### PR 8: Polish + Production Ready
**Scope:** Finalizácia

- Global exception filter (backend)
- Rate limiting (@nestjs/throttler)
- Swagger docs (@nestjs/swagger)
- Responsive design (mobile sidebar drawer)
- Error boundaries (frontend)
- README s inštrukciami na setup
- .env.example s popismi všetkých premenných

---

## Key Technical Details

### Backend API Summary

| Module | Endpoints |
|--------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Settings | `GET /settings`, `PATCH /settings` |
| Task Managers | `CRUD /task-managers/connections`, `GET .../tasks`, `CRUD .../prefixes` |
| Repositories | `CRUD /repositories`, `POST .../sync` |
| Executions | `POST /executions`, `GET /executions`, `GET .../stream` (SSE), `POST .../cancel` |

### Frontend Tech

| Concern | Choice |
|---------|--------|
| Build | Vite 6 |
| Routing | React Router v7 |
| Server state | TanStack Query v5 |
| Client state | Zustand (auth, active repo) |
| Styling | Tailwind CSS + shadcn/ui |
| Terminal | xterm.js |
| Forms | React Hook Form + Zod |
| HTTP | Axios + JWT interceptor |

### Claude Code CLI Invocation
```bash
claude -p "<prompt>" \
  --output-format stream-json \
  --verbose \
  --allowedTools "Bash,Read,Edit,Glob,Grep"
```
- `action=plan` → adds `--permission-mode plan` (read-only)
- cwd = cloned repo path
- ANTHROPIC_API_KEY from user settings

### Encryption
- AES-256-GCM for all stored tokens
- ENCRYPTION_KEY from .env (64 hex chars)

---

## Verification (End-to-End)

1. `docker-compose up` → 3 services running
2. Register → Login → JWT auth works
3. Settings: save GitHub + Claude tokens
4. Settings: connect Asana/Jira, add prefixes
5. Settings: add repository → cloned
6. Dashboard: tasks appear, filtered by prefixes
7. Task detail: click "Fix" → terminal shows live Claude output
8. Cancel → process killed
9. History: past executions visible
