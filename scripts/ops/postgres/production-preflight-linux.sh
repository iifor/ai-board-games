#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory EVIDENCE_ROOT
require_relative_path BACKUP_RELATIVE_PATH
require_value RUN_ID
require_relative_path SOURCE_SQLITE_RELATIVE_PATH
require_value RESOURCE_RELATIVE_PATHS
verify_freeze_receipt

compose_exec --profile ops run --rm --no-deps \
  --volume "$(evidence_volume)" migrator preflight \
  --source "/evidence/$BACKUP_RELATIVE_PATH/sqlite-consistent.sqlite" \
  --resources "/evidence/$BACKUP_RELATIVE_PATH/resources" \
  --schema consensus --require-tls true --output /evidence --run-id "$RUN_ID"
