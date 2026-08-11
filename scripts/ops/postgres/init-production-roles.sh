#!/bin/sh
set -eu

app_password_file="${POSTGRES_APP_PASSWORD_FILE:-/run/secrets/postgres_app_password}"
migrator_password_file="${POSTGRES_MIGRATOR_PASSWORD_FILE:-/run/secrets/postgres_migrator_password}"

require_non_empty_secret() {
  if [ ! -r "$1" ] || [ ! -s "$1" ]; then
    echo "PostgreSQL role secret must be a readable, non-empty file: $1" >&2
    exit 1
  fi
}

require_non_empty_secret "$app_password_file"
require_non_empty_secret "$migrator_password_file"

# Init scripts run only for a newly initialized PGDATA. The SQL remains
# repeatable so a deliberate manual rerun does not create duplicate roles.
psql --set=ON_ERROR_STOP=1 --username "${POSTGRES_USER:?POSTGRES_USER is required}" --dbname "${POSTGRES_DB:?POSTGRES_DB is required}" <<SQL
\\set app_password \`cat "$app_password_file"\`
\\set migrator_password \`cat "$migrator_password_file"\`

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
GRANT CONNECT ON DATABASE consensus TO consensus_app, consensus_migrator;
CREATE SCHEMA IF NOT EXISTS consensus AUTHORIZATION consensus_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA consensus TO consensus_app;
GRANT ALL ON SCHEMA consensus TO consensus_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA consensus TO consensus_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA consensus TO consensus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE consensus_migrator IN SCHEMA consensus GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO consensus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE consensus_migrator IN SCHEMA consensus GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO consensus_app;
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
