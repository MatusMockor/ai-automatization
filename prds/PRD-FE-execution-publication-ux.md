# PRD: FE Execution Publication UX

## Summary
Ciel je dodat frontend UX pre execution publication flow (bod 7) a FE kompatibilitu s BE kontraktmi z bodov 2, 3 a 6.

## Product goals
1. User pri spusteni runu rozhodne, ci sa ma vytvorit PR.
2. User vidi publication stav bez citania surovych logov.
3. SSE stream zostava konzistentny aj pri reconnecte.

## In scope
1. Publication toggle v execution create flow.
2. Vizualizacia `automationStatus`, `automationErrorMessage`, `pullRequestUrl`.
3. Reconnect-safe SSE rendering cez `sequence`.
4. Jasne stavy pre report-only/no-output/no-publication scenare.

## Out of scope
1. Kompletny redesign dashboardu.
2. Zmena design system komponentov mimo potrebneho rozsahu.

## FE contract changes
1. POST /api/executions
- Payload field `publishPullRequest?: boolean`.
- Header `Idempotency-Key` (UUID v4 generovane klientom).

2. Execution detail/list rendering
- Render `orchestrationState`.
- Publication badge stavy:
- `not_applicable`: PR vypnute userom.
- `publishing`: publikacia prebieha.
- `published`: PR vytvorene.
- `failed`: publikacia zlyhala.

3. SSE handling
- Eventy s mensim `sequence` ako posledny spracovany ignorovat.
- Snapshot pouzit ako source of truth pri reconnecte.

## UX decisions
1. Toggle label
- `Create Pull Request after run`.
- Helper text: `When off, run will execute but no PR will be created.`

2. Default
- Toggle je ON pre `fix`, `feature` aj `plan`.

3. Post-run CTA
- Ak `pullRequestUrl` existuje, zobrazit primarny button `Open PR`.

4. Error copy
- `automationErrorMessage` zobrazit v dedicated "Automation" paneli.

## User flows
1. Run s toggle ON
- User spusti run.
- UI ukazuje `publishing`.
- Po uspesnom publish zobrazi `Open PR`.

2. Run s toggle OFF
- User vypne toggle.
- Run prebehne bez PR create.
- UI ukaze `PR disabled by user` (not_applicable).

3. Publish fail
- Run moze byt completed, ale publication failed.
- UI zobrazi warning/error stav a presnu backend message.

## Testing plan
1. Unit
- Payload builder posiela `publishPullRequest` korektne.
- Idempotency key generator vracia valid UUID.

2. Component/integration
- Toggle ON/OFF rendering a state updates.
- Badge rendering pre vsetky automation stavy.
- SSE sequence ordering a dedupe po reconnecte.

3. E2E
- Toggle OFF -> not_applicable stav bez PR CTA.
- Toggle ON + published -> `Open PR` je visible/clickable.
- Publish fail -> error panel s `automationErrorMessage`.

## Accessibility and UX quality
1. Toggle musi byt keyboard accessible.
2. Status badge musi mat text, nie iba farbu.
3. Error stavy musia mat citatelny text a konzistentny kontrast.

## Rollout plan
1. Faza 1: Toggle UI + payload wiring.
2. Faza 2: Status rendering + detail panel.
3. Faza 3: SSE sequence handling hardening.
4. Faza 4: E2E stabilizacia a release.

## Acceptance criteria
1. User vie explicitne zapnut/vypnut PR publication pri starte runu.
2. UI konzistentne zobrazuje publication stav bez reloadu.
3. Reconnect neprodukuje duplicitne alebo out-of-order eventy.
4. FE requesty pouzivaju Idempotency-Key.

## Assumptions and defaults
1. BE kontrakt pre `publishPullRequest`, `orchestrationState`, `sequence` je dostupny.
2. FE scope je oddeleny od BE implementacnych PR.
3. Default publication behaviour ostava ON.
4. Scope PRD je FE-only.
