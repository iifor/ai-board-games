#!/bin/sh

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ -n "${SCRIPT_DIR:-}" ] || fail "SCRIPT_DIR is required"
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd -P)
[ -f "$REPO_ROOT/docker-compose.yml" ] || fail "canonical docker-compose.yml is missing"
readonly REPO_ROOT

unset COMPOSE_FILE COMPOSE_PATH_SEPARATOR COMPOSE_PROFILES COMPOSE_PROJECT_NAME
unset COMPOSE_ENV_FILES COMPOSE_DISABLE_ENV_FILE COMPOSE_REMOVE_ORPHANS
COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_DISABLE_ENV_FILE

compose() {
  docker compose --project-directory "$REPO_ROOT" -f "$REPO_ROOT/docker-compose.yml" \
    --project-name consensus-production "$@"
}

compose_exec() {
  exec docker compose --project-directory "$REPO_ROOT" -f "$REPO_ROOT/docker-compose.yml" \
    --project-name consensus-production "$@"
}

require_value() {
  eval "value=\${$1-}"
  [ -n "$value" ] || fail "$1 is required"
}

require_absolute_directory() {
  require_value "$1"
  eval "value=\${$1}"
  case "$value" in /*) ;; *) fail "$1 must be an absolute path" ;; esac
  [ "$value" != / ] || fail "$1 must not be /"
  [ -d "$value" ] || fail "$1 must be an existing directory"
}

require_relative_path() {
  require_value "$1"
  eval "value=\${$1}"
  case "/$value/" in
    */../*|*/./*|*//* ) fail "$1 must be a normalized relative path" ;;
  esac
  case "$value" in
    .|..|/*|*\\*|*\**|*\?*|*\[*|*\]*) fail "$1 must be a safe relative path" ;;
    *[![:print:]]*) fail "$1 contains a control character" ;;
  esac
}

require_git_sha() {
  require_value "$1"
  eval "value=\${$1}"
  [ "${#value}" -eq 40 ] || fail "$1 must be a canonical Git SHA"
  case "$value" in *[!0-9a-f]*) fail "$1 must be a canonical Git SHA" ;; esac
}

require_image_digest() {
  require_value "$1"
  eval "value=\${$1}"
  [ "${#value}" -eq 71 ] || fail "$1 must be a canonical sha256 image digest"
  case "$value" in sha256:*) ;; *) fail "$1 must be a canonical sha256 image digest" ;; esac
  hex=${value#sha256:}
  case "$hex" in *[!0-9a-f]*) fail "$1 must be a canonical sha256 image digest" ;; esac
}

require_sha256() {
  require_value "$1"
  eval "value=\${$1}"
  [ "${#value}" -eq 64 ] || fail "$1 must be a canonical SHA-256"
  case "$value" in *[!0-9a-f]*) fail "$1 must be a canonical SHA-256" ;; esac
}

require_clean_reviewed_tooling() {
  require_git_sha REVIEWED_TOOLING_HEAD
  [ "$(git -C "$REPO_ROOT" rev-parse HEAD)" = "$REVIEWED_TOOLING_HEAD" ] || fail "reviewed tooling HEAD mismatch"
  tracked_and_untracked=$(git -C "$REPO_ROOT" status --porcelain=v1 --untracked-files=all)
  [ -z "$tracked_and_untracked" ] || fail "reviewed tooling worktree must be clean including untracked files"
}

require_exact_application_source() {
  require_git_sha RELEASE_CANDIDATE_SHA
  require_git_sha REVIEWED_TOOLING_HEAD
  [ "$RELEASE_CANDIDATE_SHA" != "$REVIEWED_TOOLING_HEAD" ] \
    || fail "application candidate and tooling HEAD must be recorded separately"
  require_absolute_directory APPLICATION_SOURCE_ROOT
  APPLICATION_SOURCE_ROOT=$(CDPATH= cd -- "$APPLICATION_SOURCE_ROOT" && pwd -P)
  export APPLICATION_SOURCE_ROOT
  [ "$APPLICATION_SOURCE_ROOT" != "$REPO_ROOT" ] \
    || fail "application source must be an independent checkout"
  require_clean_reviewed_tooling
  [ "$(git -C "$APPLICATION_SOURCE_ROOT" rev-parse HEAD)" = "$RELEASE_CANDIDATE_SHA" ] \
    || fail "application source candidate mismatch"
  [ -z "$(git -C "$APPLICATION_SOURCE_ROOT" status --porcelain=v1 --untracked-files=all)" ] \
    || fail "application source worktree must be clean including untracked files"
  [ -z "$(git -C "$APPLICATION_SOURCE_ROOT" status --porcelain=v1 --ignored --untracked-files=all)" ] \
    || fail "application source checkout must not contain ignored build inputs"
  if git -C "$APPLICATION_SOURCE_ROOT" symbolic-ref -q HEAD >/dev/null 2>&1; then
    fail "application source checkout must be detached"
  fi
  CANDIDATE_TREE=$(git -C "$APPLICATION_SOURCE_ROOT" rev-parse "$RELEASE_CANDIDATE_SHA^{tree}")
  require_git_sha CANDIDATE_TREE
  APPLICATION_INPUT_MANIFEST_SHA256=$(docker run --rm --entrypoint node \
    --volume "$APPLICATION_SOURCE_ROOT:/candidate:ro" \
    --volume "$REPO_ROOT/scripts/ops/postgres/application-input-manifest.cjs:/manifest.cjs:ro" \
    node:20-slim /manifest.cjs /candidate "$RELEASE_CANDIDATE_SHA" --sha-only) \
    || fail "application input manifest could not be recomputed"
  require_sha256 APPLICATION_INPUT_MANIFEST_SHA256
  export CANDIDATE_TREE APPLICATION_INPUT_MANIFEST_SHA256
}

require_compose_additional_contexts() {
  version=$(docker compose version --short 2>/dev/null) || fail "Docker Compose v2.17 or newer is required"
  version=${version#v}
  major=${version%%.*}
  remainder=${version#*.}
  minor=${remainder%%.*}
  case "$major:$minor" in *[!0-9:]*|:|*:) fail "Docker Compose version is not parseable" ;; esac
  [ "$major" -gt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -ge 17 ]; } \
    || fail "Docker Compose v2.17 or newer is required"
}

image_label() {
  docker image inspect --format "{{ index .Config.Labels \"$1\" }}" "$2"
}

require_image_provenance() {
  image=$1
  role=$2
  [ "$(image_label org.opencontainers.image.revision "$image")" = "$REVIEWED_TOOLING_HEAD" ] \
    || fail "$role image tooling revision label mismatch"
  [ "$(image_label org.consensus.application-candidate "$image")" = "$RELEASE_CANDIDATE_SHA" ] \
    || fail "$role image application candidate label mismatch"
  [ "$(image_label org.consensus.image-role "$image")" = "$role" ] \
    || fail "$role image role label mismatch"
}

runtime_application_input_sha256() {
  docker run --rm --entrypoint node "$1" -e \
    "const value=require('/app/.consensus-application-inputs.json').manifestSha256;if(!/^[a-f0-9]{64}$/.test(value))process.exit(1);process.stdout.write(value)"
}

verify_production_build_receipt() {
  require_absolute_directory EVIDENCE_ROOT
  require_relative_path BUILD_RECEIPT_RELATIVE_PATH
  require_sha256 BUILD_RECEIPT_SHA256
  require_value BUILD_RECEIPT_SIZE_BYTES
  require_image_digest RUNTIME_IMAGE_DIGEST
  require_image_digest OPS_IMAGE_DIGEST
  require_git_sha CANDIDATE_TREE
  require_sha256 APPLICATION_INPUT_MANIFEST_SHA256
  runtime_input_sha256=$(runtime_application_input_sha256 "$1")
  require_sha256 runtime_input_sha256
  [ "$runtime_input_sha256" = "$APPLICATION_INPUT_MANIFEST_SHA256" ] \
    || fail "runtime application input manifest mismatch"
  compose --profile ops run --rm --no-deps --volume "$(evidence_volume)" migrator \
    verify-production-build --receipt "/evidence/$BUILD_RECEIPT_RELATIVE_PATH" \
    --receipt-sha256 "$BUILD_RECEIPT_SHA256" --receipt-size-bytes "$BUILD_RECEIPT_SIZE_BYTES" \
    --release-candidate "$RELEASE_CANDIDATE_SHA" --candidate-tree "$CANDIDATE_TREE" \
    --tooling-head "$REVIEWED_TOOLING_HEAD" --runtime-image-digest "$RUNTIME_IMAGE_DIGEST" \
    --ops-image-digest "$OPS_IMAGE_DIGEST" --runtime-application-input-sha256 "$runtime_input_sha256" \
    --application-input-manifest-sha256 "$APPLICATION_INPUT_MANIFEST_SHA256"
}

container_csv() {
  root=$1
  input=$2
  output=
  remaining=$input
  while :; do
    case "$remaining" in
      *,*) entry=${remaining%%,*}; remaining=${remaining#*,} ;;
      *) entry=$remaining; remaining= ;;
    esac
    [ -n "$entry" ] || fail "comma-separated path contains an empty entry"
    case "$entry" in
      .|..|/*|*\\*|*\**|*\?*|*\[*|*\]*) fail "comma-separated path is not a safe relative path" ;;
      *[![:print:]]*) fail "comma-separated path contains a control character" ;;
    esac
    case "/$entry/" in */../*|*/./*|*//* ) fail "comma-separated path is not normalized" ;; esac
    if [ -n "$output" ]; then output="$output,$root/$entry"; else output="$root/$entry"; fi
    [ -n "$remaining" ] || break
  done
  printf '%s\n' "$output"
}

evidence_volume() {
  printf '%s:/evidence' "$EVIDENCE_ROOT"
}

verify_freeze_receipt() {
  require_absolute_directory EVIDENCE_ROOT
  require_relative_path FREEZE_RECEIPT_RELATIVE_PATH
  require_sha256 FREEZE_RECEIPT_SHA256
  require_git_sha RELEASE_CANDIDATE_SHA
  require_git_sha REVIEWED_TOOLING_HEAD
  require_value FREEZE_ID
  require_relative_path SOURCE_SQLITE_RELATIVE_PATH
  require_value RESOURCE_RELATIVE_PATHS
  require_value GO_LIVE_OWNER
  compose --profile ops run --rm --no-deps --volume "$(evidence_volume)" migrator \
    verify-freeze-receipt --receipt "/evidence/$FREEZE_RECEIPT_RELATIVE_PATH" \
    --receipt-sha256 "$FREEZE_RECEIPT_SHA256" --release-candidate "$RELEASE_CANDIDATE_SHA" \
    --tooling-head "$REVIEWED_TOOLING_HEAD" --freeze-id "$FREEZE_ID" \
    --source-sqlite "$SOURCE_SQLITE_RELATIVE_PATH" --resources "$RESOURCE_RELATIVE_PATHS" \
    --go-live-owner "$GO_LIVE_OWNER"
}

source_volume() {
  printf '%s:/source:ro' "$SOURCE_ROOT"
}
