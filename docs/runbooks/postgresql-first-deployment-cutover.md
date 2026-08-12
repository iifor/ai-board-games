# PostgreSQL 16 first-deployment cutover (Linux Docker Compose)

This is the only operator sequence for the first production cutover from the frozen SQLite runtime to PostgreSQL 16 on one Linux Docker Compose host. It prepares evidence; it never grants approval. Every command block has a deliberate safety latch. Review one step, set `RUN_FIRST_DEPLOYMENT_STEP=1` only for that invocation, and unset it before moving on. Never paste secret bytes, a database URL, a private endpoint, CA bytes, or private-key bytes into argv or a terminal log.

Candidate `a066a4bb1fb9e49e50c742aa08248239f1d9a136` is the approved application baseline. It is not the reviewed tooling HEAD. The runtime image digest and ops image digest are also separate immutable identities. Record all four before touching production.

## 1. Prepare the exact detached application candidate checkout

**Inputs**: approved application baseline `a066a4bb1fb9e49e50c742aa08248239f1d9a136`, the clean reviewed tooling overlay HEAD containing this runbook, a new independent candidate checkout path, and the future separate runtime image digest and ops image digest.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export REVIEWED_TOOLING_HEAD=REPLACE_WITH_REVIEWED_TOOLING_HEAD
export APPLICATION_SOURCE_ROOT=/srv/consensus-build/application-candidate-a066
test ! -e "$APPLICATION_SOURCE_ROOT"
install -d -o root -g root -m 0700 "$(dirname "$APPLICATION_SOURCE_ROOT")"
git worktree add --detach "$APPLICATION_SOURCE_ROOT" "$RELEASE_CANDIDATE_SHA"
test "$(git -C "$APPLICATION_SOURCE_ROOT" rev-parse HEAD)" = "$RELEASE_CANDIDATE_SHA"
test -z "$(git -C "$APPLICATION_SOURCE_ROOT" status --porcelain=v1 --untracked-files=all)"
test -z "$(git -C "$APPLICATION_SOURCE_ROOT" status --porcelain=v1 --ignored --untracked-files=all)"
test -z "$(git -C "$APPLICATION_SOURCE_ROOT" symbolic-ref -q HEAD || true)"
```

**Success**: the application source is an independent detached checkout at exactly `a066...`, with no tracked, untracked, or ignored material. The tooling checkout remains at the separately reviewed HEAD. Runtime and ops digests do not exist as approvals yet; Step 2 builds and records them from these exact roots.

**Stop**: existing candidate path, dirty tracked/untracked/ignored content, attached branch, candidate/tooling conflation, wrong commit, or candidate absent from the reviewed repository. Preserve any failed checkout for review; do not silently delete or reuse it.

**Evidence**: change ticket fields `releaseCandidate` and `toolingHead`, candidate commit/tree IDs, detached-state and full-clean transcripts, and the exact candidate checkout path. Do not treat the tooling HEAD as the application candidate.

## 2. Provision root-controlled directories and secret files

**Inputs**: `/srv/consensus-first-deployment`, the exact Step 1 candidate checkout, clean exact tooling HEAD, the fixed-project Docker volume `consensus-production_consensus-postgres-data`, and approved bootstrap/app/migrator secret-file sources.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
ROOT=/srv/consensus-first-deployment
install -d -o root -g root -m 0700 "$ROOT" "$ROOT/config" "$ROOT/secrets" "$ROOT/incoming-backup" "$ROOT/evidence" "$ROOT/rollback-receipts"
install -d -o root -g root -m 0700 "$ROOT/secrets/postgres-tls" "$ROOT/secrets/postgres-bootstrap" "$ROOT/secrets/postgres-app" "$ROOT/secrets/postgres-migrator"
install -o root -g root -m 0600 REPLACE_WITH_BOOTSTRAP_PASSWORD_FILE "$ROOT/secrets/postgres-bootstrap/password"
install -o root -g root -m 0600 REPLACE_WITH_APP_PASSWORD_FILE "$ROOT/secrets/postgres-app/password"
install -o root -g root -m 0600 REPLACE_WITH_MIGRATOR_PASSWORD_FILE "$ROOT/secrets/postgres-migrator/password"
test "$(stat -c '%U:%G %a' "$ROOT")" = 'root:root 700'
docker volume inspect consensus-production_consensus-postgres-data >/dev/null
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export REVIEWED_TOOLING_HEAD=REPLACE_WITH_REVIEWED_TOOLING_HEAD
export APPLICATION_SOURCE_ROOT=/srv/consensus-build/application-candidate-a066
export EVIDENCE_ROOT="$ROOT/evidence"
export BUILD_INPUT_MANIFEST_RELATIVE_PATH=application-input-manifest.json
export BUILD_RECEIPT_RELATIVE_PATH=production-build-receipt.json
export BUILD_ID=REPLACE_WITH_UNIQUE_PRODUCTION_BUILD_ID
sh ./scripts/ops/postgres/build-production-images.sh
```

**Success**: config, password, incoming immutable backup, evidence, and rollback receipt roots are owned by `root:root` mode `0700`; password files are `root:root` mode `0600`; the PostgreSQL data volume exists and is not bind-mounted to a public path. Docker Compose v2.17+ builds runtime from the named `application_source` context and ops from tooling. The wrapper independently computes the candidate input manifest, compares it to the manifest embedded by the Dockerfile in the runtime image, and emits candidate tree, manifest artifact hash/size, distinct canonical runtime/ops digests, and exact labels.

**Stop**: shared group/world access, pre-existing unreviewed contents, a missing directory, wrong owner/mode, a volume not belonging to this deployment, Compose older than 2.17, dirty/wrong/attached candidate, dirty tooling, manifest mismatch, `unbound` label, or noncanonical/equal image digests. Do not create approvals, certificates, or traffic receipts automatically.

**Evidence**: `stat` and volume output plus immutable `application-input-manifest.json` and `production-build-receipt.json`. The build wrapper invokes the compiled `record-production-build --execute` command exactly once; it atomically creates and never overwrites the typed receipt, then immediately invokes the read-only `verify-production-build` contract. The receipt binds exact candidate commit/tree, tooling HEAD, input-manifest `{path,sizeBytes,sha256}` plus its internal manifest SHA-256, runtime digest, ops digest, build ID, and machine-generated canonical `builtAt`. Record the emitted receipt path/SHA-256/size for Steps 8, 13, and 14. Three reviewers later bind those exact bytes in the traffic authorization; labels alone are insufficient provenance and this machine receipt is not an approval.

A forged receipt field alone cannot pass: the validator recomputes the stable input artifact and the nginx gate extracts the manifest SHA from the currently running approved runtime digest. Changing that embedded value changes the image digest. The remaining trust boundary is explicit: the reviewed tooling and three distinct approvers must not collude to approve an arbitrary image; this local Compose flow is not a remote signed SLSA attestation service.

## 3. Install and prove internal TLS identity

**Inputs**: an approved internal CA, server certificate whose SAN contains exactly the required DNS identity `postgres`, its private key, and the resolved Compose `postgres_ca` file.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
TLS=/srv/consensus-first-deployment/secrets/postgres-tls
install -o root -g root -m 0644 REPLACE_WITH_CA_CERTIFICATE "$TLS/ca.crt"
install -o root -g root -m 0644 REPLACE_WITH_POSTGRES_CERTIFICATE "$TLS/server.crt"
install -o root -g root -m 0600 REPLACE_WITH_POSTGRES_PRIVATE_KEY "$TLS/server.key"
openssl verify -CAfile "$TLS/ca.crt" "$TLS/server.crt"
openssl x509 -in "$TLS/server.crt" -noout -ext subjectAltName | grep -F 'DNS:postgres'
cmp -s "$TLS/ca.crt" REPLACE_WITH_RESOLVED_POSTGRES_CA_FILE
```

**Success**: the chain verifies, SAN `postgres` is present, `verify-full` can resolve the Compose service name, resolved CA equality is byte-for-byte, and CA/certificate modes are `0644`. The host source key is root-only `0600`; the existing PostgreSQL entrypoint copies it to container-only tmpfs as `postgres:postgres` mode `0600`, so the running database identity cannot read any other key path.

**Stop**: CN-only identity, SAN mismatch, CA mismatch, expired certificate, world/group-readable key, or inability to prove the container UID/GID. Later session evidence must show `pg_stat_ssl.ssl=true`; `SHOW ssl` alone is insufficient.

**Evidence**: certificate fingerprint, dates, SAN output, resolved CA SHA-256, owner/mode output, and no key or CA content.

## 4. Start PostgreSQL only and prove the empty target boundary

**Inputs**: resolved secret-file paths, TLS source directory, fixed Compose service `postgres`, and the fixed database/roles from `docker-compose.yml`.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export POSTGRES_TLS_SOURCE_DIR=/srv/consensus-first-deployment/secrets/postgres-tls
export POSTGRES_BOOTSTRAP_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-bootstrap/password
export POSTGRES_APP_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-app/password
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/start-postgres-only.sh
SCRIPT_DIR=$(CDPATH= cd -- scripts/ops/postgres && pwd -P)
. "$SCRIPT_DIR/linux-ops-lib.sh"
if compose port postgres 5432 >/dev/null 2>&1; then exit 1; fi
[ -z "$(compose ps -q app)" ]
[ -z "$(compose ps -q nginx)" ]
compose exec -T postgres sh -ec '
set -eu
probe=consensus_privilege_probe
migrator() {
  PGPASSWORD=$(cat /run/secrets/postgres_migrator_password) PGSSLMODE=verify-full \
    PGSSLROOTCERT=/run/postgres-tls/ca.crt psql -h postgres -U consensus_migrator \
    -d consensus -v ON_ERROR_STOP=1 "$@"
}
app() {
  PGPASSWORD=$(cat /run/secrets/postgres_app_password) PGSSLMODE=verify-full \
    PGSSLROOTCERT=/run/postgres-tls/ca.crt psql -h postgres -U consensus_app \
    -d consensus -v ON_ERROR_STOP=1 "$@"
}
cleanup() {
  rc=$1
  trap - 0 HUP INT TERM
  if ! migrator -c "DROP SCHEMA IF EXISTS consensus_privilege_probe CASCADE" >/dev/null 2>&1; then rc=1; fi
  rm -f /tmp/consensus-app-ddl.err
  exit "$rc"
}
trap 'cleanup $?' 0
trap 'cleanup 129' HUP
trap 'cleanup 130' INT
trap 'cleanup 143' TERM
target=$(migrator -Atc "SELECT current_database(), current_user, current_setting('"'"'server_version_num'"'"')::int / 10000, EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='"'"'consensus'"'"'), (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())")
[ "$target" = "consensus|consensus_migrator|16|f|t" ]
role=$(app -Atc "SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls, (SELECT count(*) FROM pg_auth_members WHERE member=r.oid), has_database_privilege(current_user,current_database(),'"'"'CREATE'"'"'), (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) FROM pg_roles r WHERE rolname=current_user")
[ "$role" = "consensus_app|f|f|f|f|f|f|0|f|t" ]
migrator -c "CREATE SCHEMA consensus_privilege_probe; CREATE TABLE consensus_privilege_probe.items(id bigint PRIMARY KEY, value text NOT NULL); CREATE SEQUENCE consensus_privilege_probe.item_seq"
app -c "INSERT INTO consensus_privilege_probe.items VALUES (1,'"'"'probe'"'"'); UPDATE consensus_privilege_probe.items SET value='"'"'updated'"'"' WHERE id=1; SELECT nextval('"'"'consensus_privilege_probe.item_seq'"'"'); DELETE FROM consensus_privilege_probe.items WHERE id=1"
if app -c "CREATE TABLE consensus_privilege_probe.app_must_not_create(id bigint)" 2>/tmp/consensus-app-ddl.err; then exit 1; fi
grep -F "permission denied for schema consensus_privilege_probe" /tmp/consensus-app-ddl.err
cat /tmp/consensus-app-ddl.err
'
```

**Success**: PostgreSQL only is running and healthy; database is `consensus`; server major 16 is proven; no host database port exists; schema `consensus` absent is proven. A real app TLS session proves `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION`, `NOBYPASSRLS`, zero role memberships, database `CREATE=false`, and `pg_stat_ssl.ssl=true`. The migrator creates an isolated probe schema/table/sequence; the app proves DML and sequence use, then its DDL fails with the expected schema permission error after the successful connection and DML. EXIT preserves the ordinary status; HUP/INT/TERM return 129/130/143 after migrator cleanup.

**Stop**: `app` or `nginx` running, a published port 5432, wrong database/role/version, existing target schema, TLS false, identical credentials, excessive app privileges, failed positive DML/sequence probe, DDL unexpectedly succeeding, a denial other than the exact expected schema-permission error, or probe cleanup failure.

**Evidence**: fixed Compose service state/config, safe target/role/TLS query output, positive DML/sequence transcript, exact expected DDL-denial output, probe cleanup status, and the no-host-port assertion, all without secret bytes.

## 5. Obtain freeze authorization and a platform freeze receipt

**Inputs**: separately approved immutable maintenance authorization, exact candidate/tooling/change/freeze identities, the source SQLite relative path, ordered resource paths, real go-live owner, and a platform-created freeze receipt proving all SQLite writers and background tasks stopped.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/evidence
export FREEZE_RECEIPT_RELATIVE_PATH=platform-freeze-receipt.json
export FREEZE_RECEIPT_SHA256=REPLACE_WITH_64_HEX_FREEZE_RECEIPT_SHA256
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export REVIEWED_TOOLING_HEAD=REPLACE_WITH_REVIEWED_TOOLING_HEAD
export FREEZE_ID=REPLACE_WITH_FREEZE_ID
export SOURCE_SQLITE_RELATIVE_PATH=packages/data/ai-presenter.sqlite
export RESOURCE_RELATIVE_PATHS=packages/server/resources,avatars
export GO_LIVE_OWNER=REPLACE_WITH_REAL_GO_LIVE_OWNER
SCRIPT_DIR=$(CDPATH= cd -- scripts/ops/postgres && pwd -P)
. "$SCRIPT_DIR/linux-ops-lib.sh"
verify_freeze_receipt
```

**Success**: repository command `verify-freeze-receipt` read-only validates exact v1 keys; `purpose=postgresql-first-deployment-freeze`; `status=frozen`; candidate, tooling, change and freeze IDs; canonical UTC; the stable approved maintenance authorization `{path,sizeBytes,sha256}`; exact source path; ordered unique resources; and exactly passed `sqlite-writer.stopped` plus `background-tasks.stopped` checks. The non-placeholder platform approver differs from the go-live owner, and freeze completion precedes any backup command.

**Stop**: missing/failed maintenance authorization, missing/invalid/stale receipt, hash mismatch, any writer not stopped or background task not stopped, noncanonical time, source/resource order drift, candidate/tooling/change/freeze mismatch, duplicate/placeholder identity, or typed validator failure. File existence or an external success placeholder is never approval.

**Evidence**: original immutable maintenance authorization and platform freeze receipt, exact freeze receipt SHA-256, and repository typed-validator transcript. The same receipt bytes/hash must accompany the transferred backup and remain in the later traffic signoff evidence list.

## 6. Capture one fresh immutable source backup without opening live SQLite

**Inputs**: frozen source host, live SQLite parent as a read-only mount, exact main/WAL/SHM path, every resource root, new evidence root, and the verified Step 5 receipt.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export SOURCE_ROOT=REPLACE_WITH_FROZEN_SOURCE_PARENT
export SOURCE_SQLITE_RELATIVE_PATH=packages/data/ai-presenter.sqlite
export RESOURCE_RELATIVE_PATHS=packages/server/resources,avatars
export EVIDENCE_ROOT=REPLACE_WITH_NEW_SOURCE_HOST_EVIDENCE_ROOT
export FREEZE_RECEIPT_RELATIVE_PATH=platform-freeze-receipt.json
export FREEZE_RECEIPT_SHA256=REPLACE_WITH_64_HEX_FREEZE_RECEIPT_SHA256
export FREEZE_ID=REPLACE_WITH_FREEZE_ID
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export REVIEWED_TOOLING_HEAD=REPLACE_WITH_REVIEWED_TOOLING_HEAD
export GO_LIVE_OWNER=REPLACE_WITH_REAL_GO_LIVE_OWNER
export RUN_ID=REPLACE_WITH_FRESH_BACKUP_RUN_ID
export POSTGRES_MIGRATOR_PASSWORD_FILE=REPLACE_WITH_ROOT_ONLY_SOURCE_HOST_OPS_PASSWORD_FILE
export POSTGRES_CA_FILE=REPLACE_WITH_ROOT_ONLY_SOURCE_HOST_CA_FILE
sh ./scripts/ops/postgres/backup-linux.sh
```

**Success**: backup tooling must not open live SQLite; the formal backup command captures stable main/WAL/SHM plus all resource roots, creates one new consistent backup from staged raw files, publishes an exact manifest, and passes integrity checks. The source host and originals remain unchanged as independent rollback evidence.

**Stop**: missing freeze proof, changing source identity/size/hash, omitted resource root, path escape, existing output run directory, integrity failure, or any attempt to open or mutate the live SQLite database.

**Evidence**: raw frozen source remains in place; immutable backup run directory, manifest, executed backup report with the exact passed `freeze.receipt.sha256` check, source identity hashes, and source-host command transcript.

## 7. Transfer and verify the immutable backup again

**Inputs**: the complete Step 6 run directory, its manifest, operator-controlled transport, and a new root-owned incoming backup directory on the Linux production host.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
rsync -a --protect-args --checksum REPLACE_WITH_SOURCE_HOST:REPLACE_WITH_BACKUP_RUN_DIRECTORY/ /srv/consensus-first-deployment/incoming-backup/REPLACE_WITH_BACKUP_RUN_ID/
rsync -a --protect-args --checksum REPLACE_WITH_SOURCE_HOST:REPLACE_WITH_FREEZE_EVIDENCE_DIRECTORY/platform-freeze-receipt.json /srv/consensus-first-deployment/incoming-backup/
rsync -a --protect-args --checksum REPLACE_WITH_SOURCE_HOST:REPLACE_WITH_FREEZE_EVIDENCE_DIRECTORY/maintenance-authorization.json /srv/consensus-first-deployment/incoming-backup/
export EVIDENCE_ROOT=/srv/consensus-first-deployment/incoming-backup
export BACKUP_RELATIVE_PATH=REPLACE_WITH_BACKUP_RUN_ID
export MANIFEST_RELATIVE_PATH=REPLACE_WITH_BACKUP_RUN_ID/manifest.json
export RUN_ID=REPLACE_WITH_TRANSFER_VERIFY_RUN_ID
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/verify-backup-linux.sh
```

**Success**: transport completes without changing the source copy; compiled Node `verify-backup` rechecks the complete manifest, sizes, hashes, raw SQLite sidecars, consistent copy, and resources on the destination host.

**Stop**: transfer interruption, extra/missing file, hash/size mismatch, unsafe path, PowerShell/path-limited ad-hoc hashing substituted for `verify-backup`, or source-host originals changed.

**Evidence**: transport receipt/log, destination `verify-backup` report, original manifest, and immutable source/destination artifact hashes.

## 8. Run production preflight without a database URL in argv

**Inputs**: verified incoming backup, healthy PostgreSQL-only target, compiled ops image, fixed `migrator` service under `--profile ops`, current candidate/image/freeze bindings, and new preflight run ID.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/incoming-backup
export BACKUP_RELATIVE_PATH=REPLACE_WITH_BACKUP_RUN_ID
export RUN_ID=REPLACE_WITH_PRODUCTION_PREFLIGHT_RUN_ID
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export REVIEWED_TOOLING_HEAD=REPLACE_WITH_REVIEWED_TOOLING_HEAD
export APPLICATION_SOURCE_ROOT=/srv/consensus-build/application-candidate-a066
export RUNTIME_IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX_RUNTIME_IMAGE_DIGEST
export OPS_IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX_OPS_IMAGE_DIGEST
export BUILD_RECEIPT_RELATIVE_PATH=production-build-receipt.json
export BUILD_RECEIPT_SHA256=REPLACE_WITH_64_HEX_BUILD_RECEIPT_SHA256
export BUILD_RECEIPT_SIZE_BYTES=REPLACE_WITH_BUILD_RECEIPT_SIZE_BYTES
export FREEZE_RECEIPT_RELATIVE_PATH=platform-freeze-receipt.json
export FREEZE_RECEIPT_SHA256=REPLACE_WITH_64_HEX_FREEZE_RECEIPT_SHA256
export FREEZE_ID=REPLACE_WITH_FREEZE_ID
export SOURCE_SQLITE_RELATIVE_PATH=packages/data/ai-presenter.sqlite
export RESOURCE_RELATIVE_PATHS=packages/server/resources,avatars
export GO_LIVE_OWNER=REPLACE_WITH_REAL_GO_LIVE_OWNER
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
export EVIDENCE_ROOT=/srv/consensus-first-deployment/evidence
sh ./scripts/ops/postgres/linux-host-preflight.sh
export EVIDENCE_ROOT=/srv/consensus-first-deployment/incoming-backup
sh ./scripts/ops/postgres/production-preflight-linux.sh
```

**Success**: the fixed Compose entrypoint obtains its database credential from mounted secret files; no database URL in argv; preflight passes source/resource path budgets, TLS, target database/schema/role identity, permissions, source, manifest, candidate, images, and authorization evidence.

**Stop**: missing freeze/TLS/least-privilege/authorization evidence, target schema present, wrong role/database/host/port, CA mismatch, non-`verify-full`, source/manifest/path mismatch, or preflight nonzero exit.

**Evidence**: preflight JSON/Markdown report, current host identity transcript, and references to raw TLS/role/source/authorization evidence.

## 9. Execute production cutover exactly once

**Inputs**: same verified `sqlite-consistent.sqlite` and manifest, manually approved typed cutover authorization whose exact `freezeReceiptSha256` equals the Step 5 receipt, exact release candidate, fresh run ID, fixed production target, and unopened schema `consensus`.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/incoming-backup
export BACKUP_RELATIVE_PATH=REPLACE_WITH_BACKUP_RUN_ID
export MANIFEST_RELATIVE_PATH=REPLACE_WITH_BACKUP_RUN_ID/manifest.json
export CUTOVER_AUTHORIZATION_RELATIVE_PATH=REPLACE_WITH_CUTOVER_AUTHORIZATION.json
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export REVIEWED_TOOLING_HEAD=REPLACE_WITH_REVIEWED_TOOLING_HEAD
export APPLICATION_SOURCE_ROOT=/srv/consensus-build/application-candidate-a066
export SOURCE_SQLITE_RELATIVE_PATH=packages/data/ai-presenter.sqlite
export RESOURCE_RELATIVE_PATHS=packages/server/resources,avatars
export FREEZE_RECEIPT_RELATIVE_PATH=REPLACE_WITH_COPIED_PLATFORM_FREEZE_RECEIPT.json
export FREEZE_RECEIPT_SHA256=REPLACE_WITH_64_HEX_FREEZE_RECEIPT_SHA256
export FREEZE_ID=REPLACE_WITH_FREEZE_ID
export GO_LIVE_OWNER=REPLACE_WITH_REAL_GO_LIVE_OWNER
export RUN_ID=REPLACE_WITH_FRESH_CUTOVER_RUN_ID
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/cutover-once-linux.sh
```

**Success**: the wrapper first revalidates the copied Step 5 freeze receipt against the identical SHA-256/candidate/tooling/source/resource/freeze bindings; only then `cutover --execute` runs exactly once and uses schema `consensus` for canonical migrations, one transactional import, validation, production smoke, and closure evidence.

**Stop**: any nonzero exit. Preserve schema, volume, backup, and evidence in place; no retry, no drop, no truncate, no cleanup. A next attempt needs a new run ID and a new absent target schema/database approved through a new change.

**Evidence**: authorization bytes/hash, cutover/validation/smoke/closure reports and completion receipt all carrying the same `freezeReceiptSha256`, migration ledger, same source/manifest hashes, and the single command invocation.

## 10. Run an isolated restore drill from the same backup

**Inputs**: the same immutable backup/manifest, exact resource map, a new isolated restore root, and a fresh restore run ID.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/incoming-backup
export BACKUP_RELATIVE_PATH=REPLACE_WITH_BACKUP_RUN_ID
export MANIFEST_RELATIVE_PATH=REPLACE_WITH_BACKUP_RUN_ID/manifest.json
export RESOURCE_MAP_RELATIVE_PATH=REPLACE_WITH_RESOURCE_MAP.json
export RESTORE_RELATIVE_PATH=REPLACE_WITH_NEW_ISOLATED_RESTORE_DIRECTORY
export RUN_ID=REPLACE_WITH_RESTORE_DRILL_RUN_ID
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/restore-drill-linux.sh
```

**Success**: isolated restore drill verifies the raw SQLite/WAL/SHM rollback set, consistent SQLite, all resource hashes, and exact mapping. The restore target must not overlap production or source paths.

**Stop**: existing target, source/production overlap, path escape, missing raw sidecar/resource, integrity/count/hash mismatch, or nonzero command. Preserve the failed restore directory and report.

**Evidence**: restore report, resource map, restored file hashes, elapsed time, and original backup/manifest binding.

## 11. Start the app only and collect real application evidence

**Inputs**: healthy production database, app secret file, pinned runtime image, external traffic still closed, and an approved smoke harness whose endpoint/credentials live in a protected config file.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export POSTGRES_APP_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-app/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/start-app-only.sh
test -x REPLACE_WITH_APPLICATION_SMOKE_COMMAND
REPLACE_WITH_APPLICATION_SMOKE_COMMAND --config-file REPLACE_WITH_PROTECTED_SMOKE_CONFIG --output-dir /srv/consensus-first-deployment/evidence/app-smoke
```

**Success**: app only is healthy and PostgreSQL-backed while nginx remains stopped. Real, raw evidence covers health, login, config, game persistence, history, replay order, memory create/update, and observability delete/teardown semantics.

**Stop**: nginx active, fake responses, missing raw response hashes, any semantic failure, disconnected health falsely passing, runtime SQLite access, or smoke command/receipt failure.

**Evidence**: app container/image state and health plus per-check raw responses, semantic assertions, sizes/hashes, teardown results, and no secret/endpoint content in logs.

## 12. Collect environment, privilege, storage, and monitoring evidence

**Inputs**: approved read-only evidence collector, protected collector config, current runtime/ops images, PostgreSQL/app containers, and new evidence output root.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
test -x REPLACE_WITH_ENVIRONMENT_EVIDENCE_COMMAND
REPLACE_WITH_ENVIRONMENT_EVIDENCE_COMMAND --config-file REPLACE_WITH_PROTECTED_COLLECTOR_CONFIG --output-dir /srv/consensus-first-deployment/evidence/environment
```

**Success**: independent raw evidence proves current-session TLS, SAN/CA equality, least privilege, pool and timeout configuration, both image digests, PostgreSQL storage/volume state, monitoring, and no-runtime-SQLite/db-migrator/better-sqlite3 in the runtime image.

**Stop**: missing TLS/least privilege/pool/timeout/image/storage/monitoring evidence, unexpected SQLite/db-migrator runtime content, secret bytes in output, or a collector that mutates the database.

**Evidence**: raw logs/JSON with size/SHA-256 and a failed pending environment draft until an independent human reviews them.

## 13. Prepare pending signoff drafts; humans approve separately

**Inputs**: complete report list including the typed freeze-validator output and freeze receipt hash, typed build receipt/input-manifest hashes, candidate/run/image bindings, the reviewed tooling overlay, real names for go-live owner and rollback owner, independent reviewer identity, and an open canonical UTC authorization window.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/evidence
export REPORT_RELATIVE_PATHS=REPLACE_WITH_COMMA_SEPARATED_REPORT_PATHS
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export GO_LIVE_OWNER=REPLACE_WITH_REAL_GO_LIVE_OWNER
export ROLLBACK_OWNER=REPLACE_WITH_REAL_ROLLBACK_OWNER
export RUN_ID=REPLACE_WITH_READINESS_RUN_ID
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/prepare-signoff-linux.sh
```

**Success**: only pending drafts are generated. Three distinct humans—go-live owner, rollback owner, independent reviewer—review the approved application baseline, reviewed tooling overlay, runtime image digest, ops image digest, exact OCI labels, freeze receipt/hash, and all raw evidence before manually signing canonical UTC timestamps; identities are non-placeholder and authorization expiry remains after traffic opening.

**Stop**: any generated PASS/approval, duplicate identity, placeholder name, missing raw evidence, candidate/run/image mismatch, noncanonical timestamp, expired window, or absent restore/TLS/least-privilege proof.

**Evidence**: pending draft, manually completed immutable operator signoff, three approval identities/timestamps, and all bound report manifests. Automation never changes `pending` to approved.

## 14. Aggregate exactly 16/16 and author a separate traffic authorization

**Inputs**: immutable passed reports, completed operator signoff, exact candidate, readiness run ID, output root, and a separate manually authored traffic authorization.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/evidence
export REPORT_RELATIVE_PATHS=REPLACE_WITH_COMMA_SEPARATED_REPORT_PATHS
export OPERATOR_SIGNOFF_RELATIVE_PATH=REPLACE_WITH_OPERATOR_SIGNOFF.json
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export RUN_ID=REPLACE_WITH_READINESS_RUN_ID
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/release-readiness-linux.sh
```

**Success**: `release-readiness` produces a passed immutable report with exactly 16/16 unique passed checks and no errors:

`ci.release-gates`, `tests.no-critical-skips`, `backup.executed`, `backup.restore-drill`, `rehearsal.first`, `rehearsal.second`, `rehearsal.same-source-hash`, `runtime.no-sqlite`, `postgres.tls`, `postgres.least-privilege`, `postgres.pool-and-timeouts`, `smoke.health`, `smoke.auth-and-config`, `smoke.game-replay-memory-delete`, `production.cutover`, `operator.signoff`.

After that report is immutable, three distinct humans manually author—not generate with a wrapper—a traffic authorization independent from the release report. Its exact v1 fields are `purpose=postgresql-first-deployment-traffic`, `status=approved`, `readinessRunId`, `releaseCandidate`, `toolingHead`, `runtimeImageDigest`, `opsImageDigest`, `releaseReport {path,sizeBytes,sha256}`, `buildReceipt {path,sizeBytes,sha256}`, `freezeReceipt {path,sizeBytes,sha256}`, three ordered `approvals {role,name,approvedAt}`, canonical `approvedAt`, and canonical future `expiresAt`. The build receipt itself has exact v1 fields `purpose=postgresql-production-image-build`, `status=built`, `buildId`, `releaseCandidate`, `candidateTree`, `toolingHead`, `applicationInputManifest {path,sizeBytes,sha256}`, `applicationInputManifestSha256`, both image digests, and canonical `builtAt`. The read-only traffic validator stable-reads every artifact, recomputes the input manifest, revalidates the freeze receipt and maintenance authorization, and requires the current runtime's embedded input SHA to match; traffic approval never substitutes for any artifact.

**Stop**: release missing/failed/stale, any check absent/duplicate/failed/not exactly 16, any report/candidate/run/image/OCI-label mismatch, backup/cutover/release/traffic freeze SHA drift, missing/hash-drifted build receipt or input manifest, current runtime input mismatch, missing restore/auth/TLS/least-privilege/three-human evidence, or traffic authorization created before the immutable release report.

**Evidence**: release JSON/Markdown bytes/hash including `freezeReceiptSha256`, typed build receipt/input-manifest bytes/hashes, and independently stored traffic authorization bytes/hash. Neither approval artifact is an automatic PASS receipt.

## 15. Manually open traffic through the gated nginx-only entrypoint

**Inputs**: current tracked-and-untracked clean tooling HEAD, current local runtime/ops image IDs and exact candidate/tooling/role OCI labels, current runtime embedded application-input SHA, healthy app container, unexpired traffic authorization, and its bound build receipt, freeze receipt, and 16/16 release report.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/evidence
export TRAFFIC_AUTHORIZATION_RELATIVE_PATH=REPLACE_WITH_TRAFFIC_AUTHORIZATION.json
export RELEASE_CANDIDATE_SHA=a066a4bb1fb9e49e50c742aa08248239f1d9a136
export REVIEWED_TOOLING_HEAD=REPLACE_WITH_REVIEWED_TOOLING_HEAD
export APPLICATION_SOURCE_ROOT=/srv/consensus-build/application-candidate-a066
export RUNTIME_IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX_RUNTIME_IMAGE_DIGEST
export OPS_IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX_OPS_IMAGE_DIGEST
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
export TRAFFIC_OPENED_AT=REPLACE_WITH_MANUALLY_RECORDED_CANONICAL_UTC_OPENED_AT
sh ./scripts/ops/postgres/start-nginx-gated.sh
```

**Success**: the manual `start-nginx-gated.sh` ignores ambient Compose overrides; requires clean exact tooling plus an independent detached clean exact candidate checkout; recomputes the candidate tree and fixed application-input manifest SHA from that checkout; verifies current image IDs plus candidate/tooling/role OCI labels; extracts the actual runtime input-manifest SHA; and invokes the read-only `verify-traffic-authorization` command. That validator cross-checks the independently recomputed values against the stable build receipt/input manifest and current runtime marker, then revalidates the freeze/maintenance artifacts, release report, three identities, canonical open window, and exactly 16 passed checks. Only then does the fixed `traffic` profile start nginx while the `application` profile exposes the already healthy app dependency.

**Stop**: receipt missing/failed/stale, candidate/tooling/image mismatch, not 16/16, app absent/unhealthy, or validator nonzero. The nginx wrapper is separate and is never transitively invoked by backup, cutover, app start, signoff, or release-readiness.

**Evidence**: validator safe JSON output, current image IDs/labels, traffic authorization/release/freeze hashes, app health, the nginx-only Compose transcript, and a separate manually recorded traffic openedAt bound to that transcript. The openedAt record is not generated or approved by automation.

## 16. Observe at least 60 minutes and close with a new PostgreSQL restore test

**Inputs**: the same traffic authorization, readiness run, manually recorded observation receipt, at least 60 minutes of raw monitoring, and a real new PostgreSQL backup with an isolated restore receipt.

**Command**:

```sh
set -eu
if [ "${RUN_FIRST_DEPLOYMENT_STEP:-0}" != 1 ]; then exit 0; fi
export EVIDENCE_ROOT=/srv/consensus-first-deployment/evidence
export TRAFFIC_AUTHORIZATION_RELATIVE_PATH=REPLACE_WITH_TRAFFIC_AUTHORIZATION.json
export OBSERVATION_RELATIVE_PATH=REPLACE_WITH_OBSERVATION_RECEIPT.json
export POSTGRES_MIGRATOR_PASSWORD_FILE=/srv/consensus-first-deployment/secrets/postgres-migrator/password
export POSTGRES_CA_FILE=/srv/consensus-first-deployment/secrets/postgres-tls/ca.crt
sh ./scripts/ops/postgres/verify-observation-linux.sh
```

**Success**: the read-only `verify-observation-receipt` command proves the independent observation receipt binds the same traffic authorization SHA-256 and readiness run; observation `startedAt` is not before traffic authorization approvedAt, and the operator additionally checks it is not before the separately recorded nginx `openedAt`; canonical `finishedAt-startedAt` is at least 60 minutes. Exact passed checks record health, pool saturation, slow queries, errors, business writes, disk/volume state, and PostgreSQL backup status. Closure additionally binds a new PostgreSQL backup created after observation began and a completed isolated restore test finishing after observation.

**Stop**: observation before traffic authorization approval or manual nginx openedAt, under 60 minutes, missing metric, failed check, mismatched traffic/run hash, missing business-write fact, old/non-PostgreSQL backup, non-isolated restore, restore failure, or any attempt to let the validator generate/modify the observation receipt. The observation receipt remains independent; it is not folded into an automatic traffic PASS report.

**Evidence**: immutable observation receipt, raw monitoring windows, traffic authorization hash, new PostgreSQL backup identity, isolated restore receipt and hashes, plus the read-only validator output.

### Rollback decision gates

- **Before traffic**: keep app/nginx closed, preserve the failed schema, volume, backup, and evidence. Diagnose in place. A new attempt needs a new run ID and a new absent target schema/database; never reuse or mutate the failure site.
- **After traffic, before any new PostgreSQL business write**: stop nginx and app. Rollback to the frozen SQLite runtime is allowed only with a separately bound rollback receipt proving the same candidate/run/freeze/backup and that PostgreSQL accepted no new business write.
- **After any new PostgreSQL business write**: SQLite rollback is forbidden. Close traffic, preserve PostgreSQL, and choose forward repair or an explicitly designed data reconciliation project.
- Never add dual write, incremental catch-up, automatic PG-to-SQLite synchronization, automatic cleanup, or an operator-hidden retry.
