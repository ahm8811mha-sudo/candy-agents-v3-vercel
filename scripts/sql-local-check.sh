#!/usr/bin/env bash
# Applies the release migrations to a throwaway Postgres and runs their
# suites, exactly as the production build will (scripts/release-migrations.mjs),
# after a bootstrap that stands in for Supabase and the earlier migrations.
#
#   PGURL=postgresql://postgres:postgres@localhost:5432/postgres scripts/sql-local-check.sh
#
# Without PGURL it creates a cluster in a temporary directory with the local
# PostgreSQL binaries and removes it on exit (as the postgres user when run as
# root, because initdb refuses root).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${PGURL:-}" ]; then
  exec node scripts/release-migrations.mjs --local --url "$PGURL"
fi

bin=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$bin" ] || { echo "No PostgreSQL binaries found; set PGURL instead." >&2; exit 2; }
as_db() { if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

dir=$(as_db mktemp -d)
port=54329
cleanup() { as_db "$bin/pg_ctl" -D "$dir/data" stop -m fast >/dev/null 2>&1 || true; as_db rm -rf "$dir"; }
trap cleanup EXIT

as_db "$bin/initdb" -D "$dir/data" -A trust -U postgres >/dev/null
as_db "$bin/pg_ctl" -D "$dir/data" -o "-p $port -k $dir" -l "$dir/log" start >/dev/null
node scripts/release-migrations.mjs --local --url "postgresql://postgres@localhost:$port/postgres?host=$dir"
