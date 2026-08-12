#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory EVIDENCE_ROOT
require_value REPORT_RELATIVE_PATHS
require_relative_path OPERATOR_SIGNOFF_RELATIVE_PATH
require_value RELEASE_CANDIDATE_SHA
require_value RUN_ID
reports=$(container_csv /evidence "$REPORT_RELATIVE_PATHS")

compose_exec --profile ops run --rm --no-deps \
  --volume "$(evidence_volume)" migrator release-readiness --reports "$reports" \
  --operator-signoff "/evidence/$OPERATOR_SIGNOFF_RELATIVE_PATH" \
  --release-candidate "$RELEASE_CANDIDATE_SHA" --output /evidence --run-id "$RUN_ID"
