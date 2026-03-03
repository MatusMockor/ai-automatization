# PR: Claude OAuth Token pre CLI Executions (BE-only) + plán súbor v root

## Summary
Cieľ je nahradiť `claudeApiKey` OAuth tokenom pre Claude CLI executions, ponechať CLI runtime (`claude -p ...`) a implementovať to striktne na BE.
Kontrakt je breaking a OAuth-only:
- `claudeApiKey` sa odstráni,
- nové pole bude `claudeOauthToken`,
- execution runtime bude autentifikovať cez bearer token env (`ANTHROPIC_AUTH_TOKEN`, kompatibilne aj `CLAUDE_CODE_OAUTH_TOKEN`).

## Deliverables (BE-only)
1. Plán súbor v root:
   - `/Users/matusmockor/Developer/ai-automatization/PLAN-claude-oauth-be.md`
2. Implementované BE zmeny:
   - settings kontrakt + service + entity + migrácie
   - executions runtime auth flow
   - testy (unit/e2e) a dokumentácia
3. Bez FE commitov.

## Public API / Contracts (breaking)
1. `GET /api/settings`
- odstrániť `claudeApiKey`
- pridať `claudeOauthToken: string | null` (maskovaný secret)

2. `PATCH /api/settings`
- odstrániť `claudeApiKey`
- pridať `claudeOauthToken?: string | null`
- validácia:
  - trim
  - prázdny string -> `null`
  - max length 4096
  - bez whitespace

3. `POST /api/executions`
- čítanie Claude auth iba z `claudeOauthToken`
- pri chýbajúcom tokene: `400 Bad Request` s jasnou OAuth message

## DB model + migrácie (historické migrácie sa môžu upraviť)
1. Upraviť historickú migráciu:
- `/Users/matusmockor/Developer/ai-automatization/backend/src/database/migrations/1740657600000-create-user-settings-table.ts`
- column rename v create:
  - `claude_api_key` -> `claude_oauth_token`

2. Entity:
- `/Users/matusmockor/Developer/ai-automatization/backend/src/settings/entities/user-settings.entity.ts`
- property: `claudeOauthTokenEncrypted`
- column: `claude_oauth_token`

3. Poznámka pre lokál:
- po úprave historickej migrácie resetnúť lokálnu DB state (fresh migrate), aby schéma sedela

## Implementačné kroky (konkrétne súbory)
1. Settings DTO + service
- `/Users/matusmockor/Developer/ai-automatization/backend/src/settings/dto/update-settings.dto.ts`
- `/Users/matusmockor/Developer/ai-automatization/backend/src/settings/dto/settings-response.dto.ts`
- `/Users/matusmockor/Developer/ai-automatization/backend/src/settings/settings.service.ts`
- rename API/field flow:
  - `claudeApiKey` -> `claudeOauthToken`
  - `getClaudeApiKeyForUserOrNull` -> `getClaudeOauthTokenForUserOrNull`

2. Executions service + runner interface
- `/Users/matusmockor/Developer/ai-automatization/backend/src/executions/executions.service.ts`
- `/Users/matusmockor/Developer/ai-automatization/backend/src/executions/interfaces/claude-cli-runner.interface.ts`
- rename runtime input:
  - `anthropicApiKey` -> `anthropicAuthToken`

3. Claude CLI runner auth env
- `/Users/matusmockor/Developer/ai-automatization/backend/src/executions/adapters/child-process-claude-cli.runner.ts`
- spawn env:
  - set `ANTHROPIC_AUTH_TOKEN=<token>`
  - set `CLAUDE_CODE_OAUTH_TOKEN=<token>`
  - odstrániť inject `ANTHROPIC_API_KEY` do child procesu
- ponechať fix so `stdin.end()` a bezpečný settle flow

4. Factory/Test typing update
- `/Users/matusmockor/Developer/ai-automatization/backend/test/factories/user-settings.factory.ts`
- rename factory input/output:
  - `claudeApiKey` -> `claudeOauthToken`

5. Settings e2e update
- `/Users/matusmockor/Developer/ai-automatization/backend/test/settings.e2e-spec.ts`
- premenovať payload/expectations na `claudeOauthToken`
- ponechať šifrovanie + maskovanie + null reset scenáre

6. Executions e2e update
- `/Users/matusmockor/Developer/ai-automatization/backend/test/executions.e2e-spec.ts`
- update setup payloadov a error assertions na OAuth terminológiu

7. Runner unit test update
- `/Users/matusmockor/Developer/ai-automatization/backend/src/executions/adapters/child-process-claude-cli.runner.spec.ts`
- assertion na env tokeny:
  - obsahuje `ANTHROPIC_AUTH_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN`
  - neobsahuje `ANTHROPIC_API_KEY`

8. Dokumentácia
- `/Users/matusmockor/Developer/ai-automatization/.env.example`
- `/Users/matusmockor/Developer/ai-automatization/backend/README.md`
- doplniť sekciu:
  - user si vytvorí token cez `claude setup-token`
  - token vkladá do Settings (`claudeOauthToken`)

## Error mapping
1. `400 Bad Request`
- chýba `claudeOauthToken` v settings
2. `401` z upstream Claude auth
- execution status `failed` + klientsky čitateľná chyba (`Invalid bearer token`)
3. Ostatné statusy executions ostávajú bez zmeny

## Test cases / scenarios
1. Settings:
- GET pre new user -> `claudeOauthToken: null`
- PATCH save oauth token -> encrypted at rest + masked in response
- PATCH `claudeOauthToken: null` -> odstránenie secretu

2. Executions:
- create bez oauth tokenu -> 400
- create s oauth tokenom -> execution štartuje
- runtime auth fail -> execution prejde do terminal `failed` (nie hang)

3. Runner unit:
- spawn env má OAuth token premenne
- API key env sa nepoužíva

4. Regression:
- existujúce execution deadlock fixy (stdin close) ostávajú funkčné

5. Gate:
- `npm run format:check`
- `npm run typecheck`
- `npm run test:e2e -- --ci`
- `npm test -- executions/adapters/child-process-claude-cli.runner.spec.ts --runInBand`

## Acceptance criteria
1. Backend používa pre Claude CLI iba OAuth token flow
2. `claudeApiKey` je odstránený zo settings kontraktu
3. Settings + executions + runner + testy sú konzistentné s novým namingom
4. Žiadne FE zmeny nie sú v tomto PR
5. Všetky gate commandy sú zelené

## Explicit assumptions/defaults
1. Token source je user-provided long-lived token (`claude setup-token`), uložený encrypted v DB
2. API zmena je breaking a FE sa upraví v samostatnom kroku
3. Historické migrácie môžeme meniť (projekt ešte nie je nasadený)
4. Canonical env pre runtime auth: `ANTHROPIC_AUTH_TOKEN` (s kompatibilným mirrorom do `CLAUDE_CODE_OAUTH_TOKEN`)
