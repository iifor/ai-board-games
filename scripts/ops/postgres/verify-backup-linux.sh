#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory EVIDENCE_ROOT
require_relative_path BACKUP_RELATIVE_PATH
require_relative_path MANIFEST_RELATIVE_PATH
require_value RUN_ID

compose_exec --profile ops run --rm --no-deps \
  --volume "$(evidence_volume)" migrator verify-backup \
  --backup "/evidence/$BACKUP_RELATIVE_PATH" --manifest "/evidence/$MANIFEST_RELATIVE_PATH" \
  --output /evidence --run-id "$RUN_ID"
