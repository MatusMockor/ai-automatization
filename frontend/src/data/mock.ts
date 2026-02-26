import type { Task, Execution, Repository, ActivityItem } from '@/types';

export const mockTasks: Task[] = [
  {
    id: '1',
    externalId: 'JRA-142',
    title: 'Login timeout on OAuth providers',
    description:
      'Users report getting a timeout error when attempting to log in using Google or GitHub OAuth. The issue appears to be in the callback handler where the token exchange takes too long. Affects ~12% of login attempts.',
    source: 'jira',
    prefix: 'fix',
    assignee: 'Matus M.',
    status: 'open',
    priority: 'high',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    externalId: 'ASN-89',
    title: 'Dark mode support',
    description:
      'Implement dark mode across the entire application. Should respect system preferences and allow manual toggle via settings. Persist in localStorage.',
    source: 'asana',
    prefix: 'feature',
    assignee: 'Peter K.',
    status: 'open',
    priority: 'medium',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    externalId: 'JRA-155',
    title: 'API response caching layer',
    description:
      'Add Redis-based caching for frequently accessed endpoints. Support TTL configuration per-route and cache invalidation on mutations.',
    source: 'jira',
    prefix: 'feature',
    assignee: 'Anna S.',
    status: 'open',
    priority: 'medium',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '4',
    externalId: 'JRA-180',
    title: 'WebSocket real-time notifications',
    description:
      'Add WebSocket support for push notifications. Handle reconnection, message queuing during disconnects, and heartbeat mechanism.',
    source: 'jira',
    prefix: 'feature',
    assignee: 'Matus M.',
    status: 'open',
    priority: 'low',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '5',
    externalId: 'ASN-50',
    title: 'Memory leak in event listeners',
    description:
      'Dashboard component not cleaning up event listeners on unmount. Causes gradual memory increase over long sessions.',
    source: 'asana',
    prefix: 'fix',
    assignee: 'Peter K.',
    status: 'done',
    priority: 'high',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '6',
    externalId: 'JRA-200',
    title: 'Update core dependencies',
    description:
      'React 19, TypeScript 5.7, Vite 6 major updates available. Run migration, update breaking changes, verify test suite.',
    source: 'jira',
    prefix: 'chore',
    assignee: 'Anna S.',
    status: 'open',
    priority: 'low',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '7',
    externalId: 'ASN-95',
    title: 'Broken pagination on task list',
    description:
      'Pagination breaks when total items change while user is on a later page. Off-by-one error in page calculation.',
    source: 'asana',
    prefix: 'fix',
    assignee: 'Matus M.',
    status: 'open',
    priority: 'medium',
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '8',
    externalId: 'JRA-210',
    title: 'Refactor auth flow to JWT',
    description:
      'Plan migration from session-based auth to JWT. Consider backwards compatibility, gradual rollout, and token refresh strategy.',
    source: 'jira',
    prefix: 'plan',
    assignee: 'Matus M.',
    status: 'open',
    priority: 'medium',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '9',
    externalId: 'ASN-101',
    title: 'Export task data to CSV',
    description:
      'Users need to export filtered task lists and execution history as CSV for reporting purposes.',
    source: 'asana',
    prefix: 'feature',
    assignee: 'Anna S.',
    status: 'open',
    priority: 'low',
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '10',
    externalId: 'JRA-215',
    title: 'Race condition in concurrent executions',
    description:
      'Two simultaneous Claude executions on same repo cause file conflicts. Need mutex lock or execution queue.',
    source: 'jira',
    prefix: 'fix',
    assignee: 'Peter K.',
    status: 'open',
    priority: 'critical',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '11',
    externalId: 'ASN-110',
    title: 'Database migration strategy',
    description:
      'Define strategy for zero-downtime schema migrations in production. Evaluate tools: TypeORM migrations vs Flyway.',
    source: 'asana',
    prefix: 'plan',
    assignee: 'Peter K.',
    status: 'open',
    priority: 'medium',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '12',
    externalId: 'JRA-220',
    title: 'Set up CI/CD pipeline',
    description:
      'GitHub Actions: lint, test, build, deploy to staging on PR merge. Add Slack notifications for failures.',
    source: 'jira',
    prefix: 'chore',
    assignee: 'Anna S.',
    status: 'open',
    priority: 'medium',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockExecutions: Execution[] = [
  {
    id: 'exec-1',
    taskId: '1',
    taskExternalId: 'JRA-142',
    action: 'fix',
    status: 'running',
    output: `$ claude --task "Fix login timeout on OAuth providers"

Analyzing codebase...
Found 3 relevant files:
  src/auth/oauth-callback.ts
  src/auth/token-exchange.ts
  src/config/oauth.ts

Reading src/auth/oauth-callback.ts...
The timeout is set to 5000ms but token exchange with some
providers takes up to 8s. Increasing timeout and adding retry logic.

Editing src/auth/oauth-callback.ts...
Editing src/auth/token-exchange.ts...
Running tests...`,
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 'exec-2',
    taskId: '2',
    taskExternalId: 'ASN-89',
    action: 'feature',
    status: 'completed',
    output: 'Implemented dark mode. Modified 12 files. All tests passing.',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'exec-3',
    taskId: '3',
    taskExternalId: 'JRA-155',
    action: 'fix',
    status: 'failed',
    output: 'Error: Redis connection refused. Check REDIS_URL env variable.',
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
  },
  {
    id: 'exec-4',
    taskId: '8',
    taskExternalId: 'JRA-210',
    action: 'plan',
    status: 'running',
    output: `$ claude --task "Plan JWT auth migration"

Analyzing current auth implementation...
Reading src/auth/session.ts...
Reading src/middleware/auth.ts...

Creating migration plan...`,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'exec-5',
    taskId: '5',
    taskExternalId: 'ASN-50',
    action: 'fix',
    status: 'completed',
    output: 'Fixed memory leak. Added cleanup to 4 useEffect hooks.',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 180000).toISOString(),
  },
];

export const mockRepositories: Repository[] = [
  { id: '1', name: 'frontend', fullName: 'myapp/frontend', isActive: true },
  { id: '2', name: 'backend', fullName: 'myapp/backend', isActive: false },
  { id: '3', name: 'mobile', fullName: 'myapp/mobile', isActive: false },
];

export const mockActivities: ActivityItem[] = [
  {
    id: 'act-1',
    type: 'execution_started',
    message: 'Fixing login timeout',
    detail: 'JRA-142',
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 'act-2',
    type: 'execution_completed',
    message: 'Dark mode implemented',
    detail: 'ASN-89',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'act-3',
    type: 'execution_failed',
    message: 'Cache fix failed',
    detail: 'JRA-155',
    timestamp: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
  },
  {
    id: 'act-4',
    type: 'execution_started',
    message: 'Planning JWT migration',
    detail: 'JRA-210',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'act-5',
    type: 'repo_synced',
    message: 'Repository synced',
    detail: 'myapp/frontend',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'act-6',
    type: 'user_connected',
    message: 'Jira connected',
    detail: 'Anna S.',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

export const ALL_PREFIXES = ['fix', 'feature', 'chore', 'plan', 'refactor'] as const;
