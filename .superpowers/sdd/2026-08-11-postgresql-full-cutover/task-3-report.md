# Task 3 report — Linux first-deployment operations and traffic gates

Date: 2026-08-12

## Outcome

Implemented the Linux first-deployment operating boundary for the PostgreSQL 16
cutover. This task adds machine-verified freeze, build, traffic, and observation
receipts; thin POSIX entrypoints; a decision-complete 16-step runbook; profile-
gated Compose services; and a verify-only master workflow.

This task did **not** connect production, freeze or open the live SQLite source,
perform a production cutover, create real secrets/certificates/approvals, start
production nginx, delete a schema/volume/evidence root, or approve traffic.

## Structure and responsibilities

- `packages/db-migrator/src/release/*Receipt.ts` owns exact typed, stable,
  read-only receipt validation. Errors cross a fixed redacted boundary.
- `recordProductionBuild.ts` is the only new write operation. It is
  `--execute` gated, creates one immutable build receipt, never overwrites it,
  and immediately verifies the published bytes.
- `scripts/ops/postgres/linux-ops-lib.sh` owns one pinned Compose invocation,
  independent candidate checkout verification, image provenance, safe paths,
  and receipt validation helpers.
- The 13 public Linux entrypoints each perform one operation only. Database
  implementation remains in the compiled db-migrator CLI.
- `postgresql-first-deployment-cutover.md` is the 16-step operator state
  machine; every step has Inputs, Command, Success, Stop, and Evidence.

No public HTTP API, shared business type, gameplay code, canonical PostgreSQL
SQL, or business schema changed.

## Closed evidence chain

1. A maintenance authorization and freeze receipt bind change/freeze IDs,
   candidate, tooling HEAD, ordered source/resource paths, writer/background
   stops, independent identities, and a still-active maintenance window.
2. The same freeze receipt SHA-256 is persisted in executed backup evidence,
   cutover authorization, cutover report, completion receipt, release report,
   and traffic authorization. Independently valid mixed-freeze evidence fails.
3. Production images are built from an independent, detached, clean checkout
   of candidate `a066a4bb1fb9e49e50c742aa08248239f1d9a136` through a named BuildKit
   context. A deterministic Git-blob input manifest is computed independently,
   embedded in the runtime image, atomically recorded, and revalidated against
   the independently recomputed candidate tree and input hash.
4. Traffic authorization binds the exact 16/16 release report, freeze receipt,
   build receipt, distinct runtime/ops image digests, candidate/tooling commits,
   and three distinct human approvals with an expiry.
5. The nginx entrypoint clears ambient Compose overrides, checks the clean exact
   tooling checkout, rechecks the independent candidate tree/input manifest,
   image labels/digests, running app digest/health, and typed traffic receipt,
   then starts nginx alone.
6. Observation closure requires at least 60 minutes, seven exact recorded
   checks, an explicit PostgreSQL business-write fact, and a new post-observation
   PostgreSQL backup restored to an isolated target.

## Fail-closed operating changes

- Default Compose resolves to PostgreSQL only. `application`, `ops`, and
  `traffic` profiles are explicit; nginx is not part of ordinary `up`.
- The master workflow verifies and probes an image only. It no longer SSHs,
  resets a host checkout, builds deployed services, or replaces a running app.
- Step 4 runs real app-role TLS/DML/sequence probes and proves six dangerous
  role flags are false, membership count is zero, database CREATE is false,
  and DDL is denied. Signal exits remain 129/130/143 after scoped cleanup.
- Backup, production preflight, and cutover validate the current, unexpired
  freeze receipt before their operation. Cutover remains single-execute with no
  retry, drop, truncate, or automatic cleanup path.
- Before traffic, failures preserve all sites and require a new run/absent
  target. After a PostgreSQL business write, rollback to SQLite is forbidden.

## TDD and review history

- Typed gate initial RED: 0/5 (commands absent) → GREEN 5/5.
- Linux wrapper initial RED: 0/5 (entrypoints absent) → GREEN.
- Runbook initial RED: 0/4 (runbook absent) → GREEN.
- Reviews found and drove fixes for ambient Compose injection, untracked
  overrides, self-attested image labels, stale freeze receipts, missing freeze
  closure, unsafe CSV glob expansion, Step 4 signal/privilege gaps, automatic
  master deployment, public default nginx startup, and self-consistent fake
  build receipts.
- Final focused Task 3 unit/runbook suite: 26/26 passed.
- Final deployment-gate migration coverage is included in migration 142/142.

## Fresh verification

- Migration: 142/142 passed, 0 failed, 0 skipped.
- Unit: 388/388 passed, 0 failed, 0 skipped.
- Workflow: 127/127 passed, 0 failed, 0 skipped.
- PostgreSQL: 140/140 passed, 0 failed, 0 skipped. The suite used a disposable
  loopback PostgreSQL 16 instance and also ran the self-contained compiled TLS
  cutover integration.
- Real production-shaped PostgreSQL 16 Compose TLS/SCRAM/roles/image-isolation
  integration: 1/1 passed.
- Five-workspace TypeScript checks: passed.
- Server/shared/client/admin production builds: passed. The existing admin
  bundle-size warning remains non-blocking.
- Docker build-context test and runtime named-context static contract: passed.
- Real Alpine external signal delivery: SIGTERM=143 and SIGINT=130.
- `git diff --check`: passed; only Git LF/CRLF conversion warnings were emitted.

## Remaining deployment gates

Code readiness is not production authorization. A real first deployment still
requires: an independent clean candidate checkout on Linux; host secrets and
TLS material; current freeze receipts; a fresh snapshot/manifest/restore drill;
real `cutover --execute`; same-schema validation/smoke; three distinct humans;
release-readiness 16/16; manually gated nginx; 60-minute observation; and a new
PostgreSQL backup restored successfully. Any missing item keeps traffic closed.
