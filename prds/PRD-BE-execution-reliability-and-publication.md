# PRD: BE Execution Reliability and Publication

## Summary
Ciel je dodat backend zlepsenia pre reliability, publication a observability executions flow (body 1-6), s jasnymi API kontraktmi, testami a rollout planom.

## Product goals
1. Execution nezmizne po restarte backendu.
2. Duplicate runy z retry sa nevytvaraju.
3. Publication flow je meratelny, auditovatelny a bezpecny.
4. Logs a report artefakty neleakuju secrets.
5. SSE kontrakt je stabilny a deterministicky.

## In scope
1. Queue-based execution orchestration.
2. Idempotency pre POST /api/executions.
3. Observability (metrics, tracing, alerting).
4. Retention policy a cleanup joby.
5. Centralizovana redaction utility.
6. SSE contract hardening a test coverage.

## Out of scope
1. Zmena business logiky Jira/Asana providerov.
2. Zmena Claude prompt strategy.
3. FE redesign mimo publication UX.

## Public APIs and interface changes
1. POST /api/executions
- Podpora headera `Idempotency-Key` (optional, odporucany).
- Rovnaky key + rovnaky user + rovnaky payload hash v TTL okne (24 hodin, konfigurovatelne cez `EXECUTIONS_IDEMPOTENCY_TTL_HOURS`) vrati existujuci execution (200) namiesto noveho create (201).
- Po expiracii TTL je key povazovany za novy request a create vracia 201.
- Rovnaky key + iny payload hash vrati 409 Conflict s message `Idempotency key reuse with different payload`.

2. GET /api/executions/:id
- Doplni sa `orchestrationState: queued|running|finalizing|done|failed`.
- Doplni sa `idempotencyKey: string | null` (mask/hash podla security pravidla).

3. SSE /api/executions/:id/stream
- Zachovat existujuce event typy.
- Doplnenie `sequence` (monotonne rastuce cislo) a `sentAt` (ISO timestamp).
- Garantia poradia: snapshot event je vzdy prvy, potom ordered live eventy.

## Data model and infra changes
1. Executions table
- `idempotency_key` nullable text.
- `request_hash` nullable text.
- `orchestration_state` not null default `queued`.
- Indexy:
- `(user_id, created_at desc)`.
- Idempotency uniqueness s TTL vynucovat primarne runtime transakcne: `SELECT ... FOR UPDATE` + kontrola `idempotency_key`, `user_id`, `created_at`/TTL pred insertom.
- DB-level varianta je mozna len s explicitnym expiry modelom (`expires_at` alebo `invalidated_at`) bez moving-time predikatov; nepouzivat index predicate s `now()`.
- Cleanup idempotency zaznamov robit periodicky po TTL + grace periode (napr. 24h TTL + 6h grace) cez scheduled job.

2. Execution events durability (required for deterministic SSE replay)
- Nova tabulka `execution_events`:
- `execution_id`, `sequence`, `event_type`, `payload_json`, `created_at`.
- Unique `(execution_id, sequence)`.

3. Queue infra
- Redis + BullMQ queue `executions`.
- Retry policy pre publication job.
- Dead-letter queue pre diagnostiku terminal failov.

## Core implementation decisions
1. Rozdelit execution orchestration
- Producer: enqueue execution job.
- Worker: real execution runtime + publication orchestration.

2. Restart recovery
- Pri boote rehydrate stale `running/queued` executions.
- `running` jobs starsie ako 15 minut (konfigurovatelne cez `EXECUTION_RESTART_RUNNING_TIMEOUT_MINUTES`) oznacit ako failed s dovodom `worker restart recovery timeout`.
- `queued` jobs starsie ako 60 minut (konfigurovatelne cez `EXECUTION_RESTART_QUEUED_TIMEOUT_MINUTES`) requeue alebo fail podla retention policy.

3. Retention defaults
- Execution output: 30 dni.
- Stream events: 14 dni.
- Report artefakty: 30 dni.
- Nightly cleanup job + metric `retention_deleted_total`.

4. Secret redaction
- Zavies `backend/src/common/security/redaction.service.ts`.
- Pouzit v:
- output persist layer,
- report artifact write,
- publication error mapping,
- structured logs.

## Observability requirements
1. Metrics
- `executions_started_total`
- `executions_completed_total`
- `executions_failed_total`
- `executions_timeout_total`
- `execution_publication_failed_total`
- `execution_duration_seconds` (histogram)
- `queue_wait_seconds` (histogram)

2. Alerty
- Fail rate > 15% za 10 minut.
- Timeout rate > 5% za 10 minut.
- Publication fail streak > 5.

## Testing plan
1. Unit
- Idempotency resolver.
- Redaction service.
- Queue state transitions.

2. E2E
- Duplicate POST s rovnakym key.
- Rovnaky key + iny payload -> 409.
- Restart recovery scenar.
- SSE order + sequence monotonicity.
- Retention cleanup dry-run a live-run.

3. Non-functional
- Load test 100 paralelnych execution create requestov.
- SSE reconnect test bez duplicity eventov.

## Rollout plan
1. Faza 1: Schema migration + read/write kompatibilita.
2. Faza 2: Queue worker zapnuty za feature flagom.
3. Faza 3: Idempotency enforced pre FE requests.
4. Faza 4: Observability dashboards + alerting threshold tuning.
5. Faza 5: Retention cleanup aktivovany v produkcii.

## Acceptance criteria
1. Bez duplicate executions pri retry s rovnakym idempotency key.
2. Execution workflow je odolny voci backend restartu.
3. Secrets sa neobjavuju v reporte ani error detailoch.
4. SSE event stream je ordered a deterministicky.
5. Metrics a alerty su dostupne a overene v staging.

## Assumptions and defaults
1. Redis je dostupny pre queue orchestration.
2. `publishPullRequest` default ostava true.
3. Idempotency-Key TTL default je 24 hodin (`EXECUTIONS_IDEMPOTENCY_TTL_HOURS`).
4. Idempotency-Key generuje FE ako UUID v4.
5. Scope PRD je BE-only.
