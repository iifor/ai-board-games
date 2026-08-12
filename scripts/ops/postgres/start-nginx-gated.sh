#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"
require_absolute_directory EVIDENCE_ROOT
require_relative_path TRAFFIC_AUTHORIZATION_RELATIVE_PATH
require_exact_application_source
require_image_digest RUNTIME_IMAGE_DIGEST
require_image_digest OPS_IMAGE_DIGEST
[ "$RELEASE_CANDIDATE_SHA" != "$REVIEWED_TOOLING_HEAD" ] || fail "application candidate and tooling HEAD must be recorded separately"
[ "$RUNTIME_IMAGE_DIGEST" != "$OPS_IMAGE_DIGEST" ] || fail "runtime and ops image digests must be recorded separately"

runtime_image=consensus-production-app
ops_image=consensus-production-migrator
docker image inspect "$runtime_image" >/dev/null 2>&1 || fail "runtime image must already exist"
docker image inspect "$ops_image" >/dev/null 2>&1 || fail "ops image must already exist"
require_image_provenance "$runtime_image" runtime
require_image_provenance "$ops_image" ops
runtime_input_sha256=$(runtime_application_input_sha256 "$runtime_image")
require_sha256 runtime_input_sha256
current_runtime=$(docker image inspect --format '{{.Id}}' "$runtime_image")
current_ops=$(docker image inspect --format '{{.Id}}' "$ops_image")
case "$current_runtime" in sha256:????????????????????????????????????????????????????????????????) ;; *) fail "current runtime image ID is not canonical sha256" ;; esac
case "$current_ops" in sha256:????????????????????????????????????????????????????????????????) ;; *) fail "current ops image ID is not canonical sha256" ;; esac
[ "$current_runtime" = "$RUNTIME_IMAGE_DIGEST" ] || fail "runtime image digest mismatch"
[ "$current_ops" = "$OPS_IMAGE_DIGEST" ] || fail "ops image digest mismatch"

app_container=$(compose --profile application ps -q app)
[ -n "$app_container" ] || fail "app must already be running"
[ "$(docker inspect --format '{{.Image}}' "$app_container")" = "$current_runtime" ] || fail "running app image digest mismatch"
[ "$(docker inspect --format '{{.State.Health.Status}}' "$app_container")" = healthy ] || fail "app must be healthy"

compose --profile ops run --rm --no-deps \
  --volume "$(evidence_volume)" migrator verify-traffic-authorization \
  --authorization "/evidence/$TRAFFIC_AUTHORIZATION_RELATIVE_PATH" \
  --release-candidate "$RELEASE_CANDIDATE_SHA" --tooling-head "$REVIEWED_TOOLING_HEAD" \
  --runtime-image-digest "$current_runtime" --ops-image-digest "$current_ops" \
  --candidate-tree "$CANDIDATE_TREE" \
  --application-input-manifest-sha256 "$APPLICATION_INPUT_MANIFEST_SHA256" \
  --runtime-application-input-sha256 "$runtime_input_sha256"
compose_exec --profile application --profile traffic up -d --no-deps --wait nginx
