#!/bin/sh
# This file is executed by Alpine /bin/sh and must remain LF-only.
set -eu

app_password_file="${POSTGRES_APP_PASSWORD_FILE:-/run/secrets/postgres_app_password}"
migrator_password_file="${POSTGRES_MIGRATOR_PASSWORD_FILE:-/run/secrets/postgres_migrator_password}"

carriage_return="$(printf '\r')"
newline='
'

read_secret() {
  if [ ! -r "$1" ] || [ ! -s "$1" ]; then
    echo "PostgreSQL role secret must be a readable, non-empty file: $1" >&2
    exit 1
  fi
  secret_value="$(cat "$1"; printf '\037')"
  secret_value=${secret_value%?}
  case "$secret_value" in
    *"$carriage_return$newline") secret_value=${secret_value%"$carriage_return$newline"} ;;
    *"$newline") secret_value=${secret_value%"$newline"} ;;
  esac
  if [ -z "$secret_value" ]; then
    echo "PostgreSQL role secret must be a readable, non-empty file: $1" >&2
    exit 1
  fi
}

read_secret "$app_password_file"
app_password=$secret_value
read_secret "$migrator_password_file"
migrator_password=$secret_value

# Init scripts run only for a newly initialized PGDATA. The SQL remains
# repeatable so a deliberate manual rerun does not create duplicate roles.
POSTGRES_APP_ROLE_PASSWORD="$app_password" \
POSTGRES_MIGRATOR_ROLE_PASSWORD="$migrator_password" \
psql --set=ON_ERROR_STOP=1 --username "${POSTGRES_USER:?POSTGRES_USER is required}" --dbname "${POSTGRES_DB:?POSTGRES_DB is required}" <<SQL
\\getenv app_password POSTGRES_APP_ROLE_PASSWORD
\\getenv migrator_password POSTGRES_MIGRATOR_ROLE_PASSWORD

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'consensus_app') THEN
    CREATE ROLE consensus_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'consensus_migrator') THEN
    CREATE ROLE consensus_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
\$\$;

ALTER ROLE consensus_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
ALTER ROLE consensus_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

REVOKE ALL ON DATABASE consensus FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE consensus TO consensus_migrator;
GRANT CONNECT ON DATABASE consensus TO consensus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE consensus_migrator GRANT USAGE ON SCHEMAS TO consensus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE consensus_migrator GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO consensus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE consensus_migrator GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO consensus_app;
SQL

# Local bootstrap uses the Unix socket. All TCP clients are explicitly either
# TLS + SCRAM or rejected before credential verification.
cat > "${PGDATA:?PGDATA is required}/pg_hba.conf" <<'HBA'
# Managed by init-production-roles.sh during first PGDATA initialization.
local   all             all                                     trust
hostnossl all           all             0.0.0.0/0               reject
hostnossl all           all             ::0/0                    reject
hostssl all             all             0.0.0.0/0               scram-sha-256
hostssl all             all             ::0/0                    scram-sha-256
HBA
