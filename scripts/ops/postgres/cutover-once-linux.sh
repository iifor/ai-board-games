#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory EVIDENCE_ROOT
require_relative_path BACKUP_RELATIVE_PATH
require_relative_path MANIFEST_RELATIVE_PATH
require_relative_path CUTOVER_AUTHORIZATION_RELATIVE_PATH
require_value RELEASE_CANDIDATE_SHA
require_value RUN_ID
require_relative_path SOURCE_SQLITE_RELATIVE_PATH
require_value RESOURCE_RELATIVE_PATHS
verify_freeze_receipt

compose_exec --profile ops run --rm --no-deps \
  -e RELEASE_CANDIDATE_SHA --volume "$(evidence_volume)" migrator cutover \
  --source-snapshot "/evidence/$BACKUP_RELATIVE_PATH/sqlite-consistent.sqlite" \
  --manifest "/evidence/$MANIFEST_RELATIVE_PATH" \
  --authorization "/evidence/$CUTOVER_AUTHORIZATION_RELATIVE_PATH" \
  --freeze-receipt-sha256 "$FREEZE_RECEIPT_SHA256" \
  --output /evidence --run-id "$RUN_ID" --execute
