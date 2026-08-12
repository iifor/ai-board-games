#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/linux-ops-lib.sh"

require_exact_application_source
require_image_digest RUNTIME_IMAGE_DIGEST
require_image_digest OPS_IMAGE_DIGEST
[ "$RUNTIME_IMAGE_DIGEST" != "$OPS_IMAGE_DIGEST" ] || fail "runtime and ops image digests must be recorded separately"

require_compose_additional_contexts
compose config >/dev/null
compose --profile application --profile ops --profile traffic config >/dev/null
runtime_image=consensus-production-app
ops_image=consensus-production-migrator
docker image inspect "$runtime_image" >/dev/null 2>&1 || fail "runtime image must already exist"
docker image inspect "$ops_image" >/dev/null 2>&1 || fail "ops image must already exist"
require_image_provenance "$runtime_image" runtime
require_image_provenance "$ops_image" ops
[ "$(docker image inspect --format '{{.Id}}' "$runtime_image")" = "$RUNTIME_IMAGE_DIGEST" ] || fail "runtime image digest mismatch"
[ "$(docker image inspect --format '{{.Id}}' "$ops_image")" = "$OPS_IMAGE_DIGEST" ] || fail "ops image digest mismatch"
verify_production_build_receipt "$runtime_image"
