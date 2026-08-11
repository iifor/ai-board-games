#!/bin/sh
set -eu

for source in ca.crt server.crt server.key; do
  if [ ! -r "/run/postgres-tls-source/$source" ] || [ ! -s "/run/postgres-tls-source/$source" ]; then
    echo "PostgreSQL TLS source must be a readable, non-empty file: $source" >&2
    exit 1
  fi
done

install -d -m 0755 /run/postgres-tls
install -m 0644 /run/postgres-tls-source/ca.crt /run/postgres-tls/ca.crt
install -m 0644 /run/postgres-tls-source/server.crt /run/postgres-tls/server.crt
install -o postgres -g postgres -m 0600 /run/postgres-tls-source/server.key /run/postgres-tls/server.key
exec /usr/local/bin/docker-entrypoint.sh "$@"
