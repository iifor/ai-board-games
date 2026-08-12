#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$SCRIPT_DIR/linux-ops-lib.sh"

require_exact_application_source
require_absolute_directory EVIDENCE_ROOT
require_relative_path BUILD_INPUT_MANIFEST_RELATIVE_PATH
require_relative_path BUILD_RECEIPT_RELATIVE_PATH
require_value BUILD_ID
export APPLICATION_SOURCE_ROOT RELEASE_CANDIDATE_SHA REVIEWED_TOOLING_HEAD

require_compose_additional_contexts
manifest_output="$EVIDENCE_ROOT/$BUILD_INPUT_MANIFEST_RELATIVE_PATH"
receipt_output="$EVIDENCE_ROOT/$BUILD_RECEIPT_RELATIVE_PATH"
[ ! -e "$manifest_output" ] || fail "application input manifest output already exists"
[ ! -e "$receipt_output" ] || fail "production build receipt output already exists"
umask 077
set -C
docker run --rm --entrypoint node \
  --volume "$APPLICATION_SOURCE_ROOT:/candidate:ro" \
  --volume "$REPO_ROOT/scripts/ops/postgres/application-input-manifest.cjs:/manifest.cjs:ro" \
  node:20-slim /manifest.cjs /candidate "$RELEASE_CANDIDATE_SHA" > "$manifest_output"
set +C
artifact_input_sha256=$(docker run --rm --entrypoint node \
  --volume "$manifest_output:/manifest.json:ro" node:20-slim -e \
  "const value=require('/manifest.json').manifestSha256;if(!/^[a-f0-9]{64}$/.test(value))process.exit(1);process.stdout.write(value)")
require_sha256 artifact_input_sha256
[ "$artifact_input_sha256" = "$APPLICATION_INPUT_MANIFEST_SHA256" ] \
  || fail "written application input manifest differs from independent recomputation"
compose --profile application --profile ops config >/dev/null
compose --profile application --profile ops build app migrator

runtime_image=consensus-production-app
ops_image=consensus-production-migrator
docker image inspect "$runtime_image" >/dev/null 2>&1 || fail "built runtime image is required"
docker image inspect "$ops_image" >/dev/null 2>&1 || fail "built ops image is required"
require_image_provenance "$runtime_image" runtime
require_image_provenance "$ops_image" ops
runtime_input_sha256=$(runtime_application_input_sha256 "$runtime_image")
require_sha256 runtime_input_sha256
[ "$runtime_input_sha256" = "$APPLICATION_INPUT_MANIFEST_SHA256" ] \
  || fail "runtime application inputs do not match the candidate manifest"
runtime_digest=$(docker image inspect --format '{{.Id}}' "$runtime_image")
ops_digest=$(docker image inspect --format '{{.Id}}' "$ops_image")
RUNTIME_IMAGE_DIGEST=$runtime_digest
OPS_IMAGE_DIGEST=$ops_digest
require_image_digest RUNTIME_IMAGE_DIGEST
require_image_digest OPS_IMAGE_DIGEST
[ "$RUNTIME_IMAGE_DIGEST" != "$OPS_IMAGE_DIGEST" ] || fail "runtime and ops image digests must differ"
compose --profile ops run --rm --no-deps --volume "$(evidence_volume)" migrator \
  record-production-build --output "/evidence/$BUILD_RECEIPT_RELATIVE_PATH" \
  --build-id "$BUILD_ID" --release-candidate "$RELEASE_CANDIDATE_SHA" \
  --candidate-tree "$CANDIDATE_TREE" --tooling-head "$REVIEWED_TOOLING_HEAD" \
  --application-input-manifest "/evidence/$BUILD_INPUT_MANIFEST_RELATIVE_PATH" \
  --application-input-manifest-sha256 "$APPLICATION_INPUT_MANIFEST_SHA256" \
  --runtime-image-digest "$RUNTIME_IMAGE_DIGEST" --ops-image-digest "$OPS_IMAGE_DIGEST" --execute
BUILD_RECEIPT_SHA256=$(sha256sum "$receipt_output" | awk '{print $1}')
BUILD_RECEIPT_SIZE_BYTES=$(wc -c < "$receipt_output" | tr -d ' ')
export BUILD_RECEIPT_SHA256 BUILD_RECEIPT_SIZE_BYTES RUNTIME_IMAGE_DIGEST OPS_IMAGE_DIGEST
verify_production_build_receipt "$runtime_image"
printf 'candidate_tree=%s\napplication_input_manifest_sha256=%s\nbuild_receipt_path=%s\nbuild_receipt_sha256=%s\nbuild_receipt_size_bytes=%s\nruntime_image_digest=%s\nops_image_digest=%s\n' \
  "$CANDIDATE_TREE" "$APPLICATION_INPUT_MANIFEST_SHA256" "$BUILD_RECEIPT_RELATIVE_PATH" \
  "$BUILD_RECEIPT_SHA256" "$BUILD_RECEIPT_SIZE_BYTES" "$RUNTIME_IMAGE_DIGEST" "$OPS_IMAGE_DIGEST"
