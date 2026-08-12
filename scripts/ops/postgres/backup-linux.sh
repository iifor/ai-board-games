#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory SOURCE_ROOT
require_absolute_directory EVIDENCE_ROOT
require_relative_path SOURCE_SQLITE_RELATIVE_PATH
require_value RESOURCE_RELATIVE_PATHS
require_value RUN_ID
resources=$(container_csv /source "$RESOURCE_RELATIVE_PATHS")
verify_freeze_receipt

compose_exec --profile ops run --rm --no-deps \
  --volume "$(source_volume)" --volume "$(evidence_volume)" migrator \
  backup --source "/source/$SOURCE_SQLITE_RELATIVE_PATH" --resources "$resources" \
  --output /evidence --run-id "$RUN_ID" --freeze-receipt-sha256 "$FREEZE_RECEIPT_SHA256" --execute
