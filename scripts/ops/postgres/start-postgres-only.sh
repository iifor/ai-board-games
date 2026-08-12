#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$SCRIPT_DIR/linux-ops-lib.sh"

compose_exec up -d --no-deps --wait postgres
