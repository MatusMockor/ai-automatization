<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>


  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## API hardening configuration

The backend supports production hardening controls through environment variables:

- `ALLOWED_ORIGINS` (default: `http://localhost:3000,http://localhost:5173`) comma-separated CORS allowlist.
- `ENABLE_SWAGGER` (default: `false`) enables Swagger UI and OpenAPI JSON endpoints.
- `SWAGGER_PATH` (default: `api/docs`) sets the public Swagger endpoint path.
- `THROTTLE_TTL_MS` (default: `60000`) configures throttling window in milliseconds.
- `THROTTLE_LIMIT` (default: `60`) configures max requests per window.

With default values, Swagger stays disabled and rate limiting applies globally, while `GET /api/health` is excluded.
In production, avoid wildcard origins and explicitly set `ALLOWED_ORIGINS`.

## Execution publication automation

Execution publication settings control automatic `branch -> commit -> push -> PR` flow for completed executions:

- `GITHUB_API_BASE_URL` default: `https://api.github.com`
- `EXECUTION_GIT_AUTHOR_NAME` default: `Automation Bot`
- `EXECUTION_GIT_AUTHOR_EMAIL` default: `automation@local`
- `EXECUTION_AUTOPR_RETRY_COUNT` default: `3`
- `EXECUTION_AUTOPR_RETRY_BACKOFF_MS` default: `2000`
- `EXECUTION_PRE_PR_CHECK_COMMAND` default: empty (disabled)
- `EXECUTION_AUTOPR_BRANCH_PREFIX` default: `feature/ai`
- `EXECUTION_QUEUE_DRIVER` default: `redis` (`inline` is available for tests/local fallback)
- `EXECUTION_QUEUE_NAME` default: `executions`
- `EXECUTION_QUEUE_MAX_ATTEMPTS` default: `3`
- `EXECUTION_QUEUE_CONSUME_ERROR_BACKOFF_MS` default: `250`
- `REDIS_URL` default: `redis://redis:6379`
- `DOCKER_HOST` default: `tcp://docker-runner:2375` (worker-only runtime for compose pre-commit checks)
- `EXECUTION_WORKER_ENABLED` default: `false` for API process (worker process sets `true`)
- `EXECUTION_WORKER_RECOVERY_TIMEOUT_MS` default: `900000`
- `EXECUTION_MIN_TIMEOUT_MS` default: `60000`
- `EXECUTION_MAX_TIMEOUT_MS` default: `7200000`
- `EXECUTION_RETENTION_ENABLED` default: `true` (runtime flag consumed by backend process)
- Compose mapping defaults: `EXECUTION_RETENTION_ENABLED_API=true`, `EXECUTION_RETENTION_ENABLED_WORKER=false`
- `EXECUTION_RETENTION_TIMEZONE` default: `UTC`
- `ENABLE_METRICS` default: `false`
- `EXECUTION_OUTPUT_RETENTION_DAYS` default: `30`
- `EXECUTION_EVENTS_RETENTION_DAYS` default: `14`
- `EXECUTION_REPORT_RETENTION_DAYS` default: `30`

Execution request payload (`POST /api/executions`) supports `publishPullRequest?: boolean`.

- default: `true`
- when `false`, publication is skipped and execution ends with `automationStatus=not_applicable`
- when `true`, `plan` executions and no-diff `fix/feature` runs publish a report artifact from `.ai/executions/<executionId>.md`
- git publication commands authenticate to GitHub over HTTPS using `Authorization: Basic <base64(x-access-token:<token>)>` built from user settings `githubToken`

Execution create endpoint also supports `Idempotency-Key` header:

- same key + same payload hash (within 24 hours): returns existing execution (`200`)
- same key + different payload hash: `409` (`Idempotency key reuse with different payload`)

Execution SSE stream (`GET /api/executions/:id/stream`) publishes ordered events with additive metadata:

- `sequence` (monotonic per execution)
- `sentAt` (ISO timestamp)
- `lastSequence` (included in `snapshot` payload as latest persisted event sequence)
- reconnect can request replay via query `afterSequence`

Prometheus metrics are exposed at `GET /metrics` only when `ENABLE_METRICS=true`.

## Claude OAuth token for executions

Executions authenticate Claude CLI using a per-user OAuth token stored in settings.

1. Generate a long-lived token locally:
   - `claude setup-token`
2. Save the token via backend settings API:
   - `PATCH /api/settings` with `claudeOauthToken`
3. Start executions normally (`POST /api/executions`).

The backend does not use `ANTHROPIC_API_KEY` env for execution auth.

Claude CLI runtime for executions is configurable via env vars:

- `EXECUTION_CLAUDE_MODEL` default: `claude-opus-4-6`
- `EXECUTION_CLAUDE_PERMISSION_MODE` default for `feature/fix`: `acceptEdits`
- `EXECUTION_CLAUDE_ALLOWED_TOOLS` default: `Bash,Read,Edit,Write,Glob,Grep`

## Project setup

```bash
npm install
```

## Compile and run the project

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod

# worker process (required for Redis queue execution processing)
npm run start:worker:dev
```

## Run tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```


## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
