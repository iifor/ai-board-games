#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory EVIDENCE_ROOT
require_relative_path OBSERVATION_RELATIVE_PATH
require_relative_path TRAFFIC_AUTHORIZATION_RELATIVE_PATH

compose_exec --profile ops run --rm --no-deps \
  --volume "$(evidence_volume)" migrator verify-observation-receipt \
  --observation "/evidence/$OBSERVATION_RELATIVE_PATH" \
  --traffic-authorization "/evidence/$TRAFFIC_AUTHORIZATION_RELATIVE_PATH"
