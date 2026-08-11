# PostgreSQL 16 Full Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every production behavior follows strict RED -> GREEN TDD and receives an independent task review.

**Goal:** Add the production Docker Compose PostgreSQL 16 boundary and a fail-closed, evidence-backed offline cutover command for the first production deployment, without connecting to or modifying any real production system during code implementation.

**Architecture:** The runtime Compose stack owns app, nginx, and a private PostgreSQL 16 service; a separate opt-in ops image owns `db-migrator` and is never copied into the runtime image. `packages/db-migrator` adds a production cutover orchestrator that reuses the existing canonical PostgreSQL migration adapter, importer, validation, application smoke, stable manifest verification, atomic evidence writer, run-id safety, and redaction. Human operations remain in thin scripts and runbooks; automation never starts nginx or approves signoff.

**Tech Stack:** TypeScript 6, Node.js 20, PostgreSQL 16 Alpine, `pg`, `better-sqlite3` only in the ops image, Docker Compose v2, POSIX shell, PowerShell, Node test runner.

## Global Constraints

- Work only in `.worktrees/postgresql-production-readiness` on `codex/postgresql-production-readiness`; preserve unrelated files in the primary checkout.
- Do not connect to a real production database, stop the live SQLite writer, create real credentials/certificates, start production nginx, or perform traffic cutover.
- Default every state-changing command to dry-run; require explicit `--execute` plus a separately approved pre-cutover authorization for data import.
- Treat pre-cutover execution authorization and post-import traffic signoff as two distinct gates to avoid a circular approval dependency.
- Database URLs, passwords, endpoints, private keys, tokens, source rows, and absolute sensitive paths must not appear in argv, stdout, stderr, reports, images, or Git.
- Do not SQLite-open the live source. Cutover consumes only a previously verified consistent snapshot and manifest.
- Preserve failed schemas and evidence. Never auto-drop, truncate, retry, clean up, or overwrite a previous report/run.
- Keep PostgreSQL off host/public ports. Runtime app uses `consensus_app`; migration uses `consensus_migrator`; schema is `consensus`.
- Enforce `verify-full`, CA verification, `DATABASE_POOL_MAX=10`, connection timeout `5000`, statement timeout `30000`.
- Keep public HTTP APIs, frontend behavior, shared business types, and the canonical PostgreSQL business schema unchanged.
- The runtime image must contain neither `packages/db-migrator`, `better-sqlite3`, SQLite files, backups, nor operational evidence.
- Tests must exercise behavior, not grep-only text contracts; use real Docker/Compose config or executable scripts where practical.

---

### Task 1: Production Compose PostgreSQL and ops image boundary

**Files:**

- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Create: `scripts/ops/postgres/init-production-roles.sh`
- Create or modify: focused unit tests and the explicit unit runner
- Modify: deployment/server documentation only where the runtime contract changes

**Responsibility:** Add the private PostgreSQL service, durable data volume, TLS mounts, role bootstrap, app dependency, fixed runtime settings, and an opt-in migrator image/profile without placing migration dependencies in the runtime image.

**Interfaces:**

- Compose service `postgres`, database `consensus`, app schema `consensus`.
- Runtime role `consensus_app`; migration owner `consensus_migrator`; bootstrap role is not used by the app.
- Host-provided secret directory and password files stay outside Git; Compose accepts their paths through required environment interpolation.
- TLS certificate SAN must include Compose hostname `postgres`; app mounts CA only and connects with `verify-full`.
- The ops image runs built `packages/db-migrator/dist/cli.js` only under an explicit `ops` profile.

- [ ] Write executable Docker/Compose tests proving no PostgreSQL host port, durable volume, TLS configuration, role separation, app dependency, and runtime/ops image separation.
- [ ] Run the focused tests and record the expected RED behavior.
- [ ] Implement the minimal Compose, Docker stage, and idempotent first-init role script.
- [ ] Run focused tests, Docker Compose config validation, runtime/ops image probes, unit tests, checks, and builds.
- [ ] Self-review, update docs, commit, and write the task report.

---

### Task 2: Execute-gated production cutover orchestration

**Files:**

- Create: focused modules under `packages/db-migrator/src/cutover/`
- Create: `packages/db-migrator/src/commands/cutover.ts`
- Modify: CLI arguments/dispatch, package scripts, and public db-migrator exports only as needed
- Create or modify: migration and PostgreSQL integration tests/runners

**Responsibility:** Verify pre-cutover authorization and immutable backup evidence, reserve one target/run, execute canonical migration + import + validation + application smoke in the same fixed production schema, and publish non-overwriting sanitized evidence.

**Interfaces:**

- CLI command:

  ```text
  DATABASE_URL=<migrator connection>
  cutover --source-snapshot <sqlite> --manifest <json> --authorization <json>
          --output <dir> --run-id <id> [--execute]
  ```

- Reject `--target`; target is environment-only.
- Dry-run requires no authorization and performs zero database or output writes.
- Execute requires an approved pre-cutover authorization bound to: version, release candidate SHA, runId, manifest SHA-256, database `consensus`, schema `consensus`, migration role `consensus_migrator`, TLS mode `verify-full`, maintenance start/end, and three distinct named owners with real timestamps.
- Execute verifies the canonical manifest before any target mutation, rejects missing/changed evidence, and records only hashes/allowlisted metadata.
- A database-level advisory lock plus exclusive evidence reservation prevents concurrent or repeated execution.
- Target database must be PostgreSQL 16, current role `consensus_migrator`, TLS verified, and schema `consensus` absent; any existing schema/table fails closed.
- Reuse canonical migration adapter, importer transaction, Task 5 validation, and Task 8 application smoke; all three target the same schema.
- Success report includes stable hashes and artifact references; failure keeps the schema/evidence and never retries or cleans it.

- [ ] Add focused RED tests for dry-run zero I/O, missing/malformed/stale authorization, wrong candidate/manifest/target/role/TLS/window/identity, unsafe runId/output, and URL leakage.
- [ ] Add PostgreSQL RED tests for nonempty schema, concurrent execution, migration/import/validation/smoke failures, transaction rollback, and same-schema evidence.
- [ ] Implement the smallest authorization loader, target gate/lock, orchestrator, report types, and CLI wiring by reusing existing modules.
- [ ] Turn each RED group GREEN, then run full migration/PostgreSQL suites, typecheck, build, and compiled-dist execution.
- [ ] Self-review, update docs, commit, and write the task report.

---

### Task 3: First-deployment operations and rollback gates

**Files:**

- Create: thin Linux ops entrypoints under `scripts/ops/postgres/`
- Create: `docs/runbooks/postgresql-first-deployment-cutover.md`
- Modify: existing readiness, rollback, deployment, server, and summary docs only where the new production path changes truth
- Create or modify: executable ops/document contract tests and runners

**Responsibility:** Make the first deployment reproducible on Linux while keeping secrets out of argv and ensuring automation stops before traffic or approval decisions.

**Required flow:**

1. Pin the candidate and verify a clean worktree/image digest.
2. Provision host directories, certificates, secret files, PostgreSQL volume, and evidence directory with explicit ownership/modes.
3. Start only PostgreSQL; confirm TLS, database identity, roles, least privilege, pool/timeouts, and external port absence.
4. Freeze the SQLite writer under a separately authorized maintenance window; capture and verify a fresh immutable main/WAL/SHM/resources backup without opening the live source.
5. Transfer/verify the immutable backup while retaining the original source host as the independent rollback copy.
6. Run production preflight, approved cutover, same-schema validation/smoke, and an isolated restore drill.
7. Start app only; collect health/auth/config/game/history/replay/memory/delete evidence.
8. Produce pending environment/signoff drafts; require three distinct humans to finalize them.
9. Require release-readiness 16/16 before nginx can be started manually.
10. Observe for 60 minutes; if PostgreSQL has accepted new writes, forbid silent rollback to SQLite.

- [ ] Add executable RED tests for wrapper argv/env behavior, nonzero propagation, secret handling, Compose service ordering, and the no-automatic-nginx/signoff boundary.
- [ ] Implement thin wrappers that call the compiled ops image/CLI and preserve exact exit codes.
- [ ] Write the decision-complete Linux runbook, rollback decision tree, evidence paths, and stop conditions.
- [ ] Turn focused tests GREEN and validate every shell/PowerShell block with a parser or controlled fixture.
- [ ] Run unit/check/build/Docker gates, self-review, commit, and write the task report.

---

### Task 4: Whole-branch verification and handoff

**Responsibility:** Prove the implementation is releasable without pretending a real production migration occurred.

- [ ] Run fresh unit, workflow, migration, and PostgreSQL suites with zero failures/skips.
- [ ] Run all workspace checks and server/shared/client/admin/db-migrator builds.
- [ ] Build runtime and ops images; probe runtime exclusion and ops inclusion separately.
- [ ] Run a full local Compose TLS integration using generated test-only certificates and a fresh PostgreSQL 16 volume.
- [ ] Run compiled-dist dry-run and execute against a dedicated `_test` database using a controlled snapshot/authorization fixture.
- [ ] Generate a whole-branch review package and obtain independent spec/quality approval; apply one reviewed fix wave if required.
- [ ] Confirm no production connection, source mutation, real secret, traffic action, or approval artifact was created.
- [ ] Finish with a clean worktree and explicit external blockers: Linux host, production secrets/certs, frozen fresh source, and three-party approval.
