#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory EVIDENCE_ROOT
require_value REPORT_RELATIVE_PATHS
require_value RELEASE_CANDIDATE_SHA
require_value GO_LIVE_OWNER
require_value ROLLBACK_OWNER
require_value RUN_ID
reports=$(container_csv /evidence "$REPORT_RELATIVE_PATHS")

compose_exec --profile ops run --rm --no-deps \
  --volume "$(evidence_volume)" migrator prepare-signoff --reports "$reports" \
  --release-candidate "$RELEASE_CANDIDATE_SHA" --go-live-owner "$GO_LIVE_OWNER" \
  --rollback-owner "$ROLLBACK_OWNER" --output /evidence --run-id "$RUN_ID"
