#!/usr/bin/env bash
#
# Disposable local PostgreSQL for the database security tests.
#
# This NEVER touches a hosted Supabase project. It creates a throwaway cluster
# under /tmp, applies the local auth/storage shim plus every migration, and
# prints the connection string the integration suite expects.
#
#   ./scripts/local-db.sh up      start and migrate
#   ./scripts/local-db.sh reset   drop and recreate the database
#   ./scripts/local-db.sh down    stop and delete the cluster
#   ./scripts/local-db.sh psql    open a shell
#
# In CI, a postgres service container is used instead — set TEST_DATABASE_URL
# and skip this script entirely.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA_DIR="${PGDATA_DIR:-/tmp/nuoidaycon-pg/data}"
RUN_DIR="${RUN_DIR:-/tmp/nuoidaycon-pg/run}"
PORT="${DB_PORT:-55432}"
DB_NAME="${DB_NAME:-nuoidaycon_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="postgresql://postgres@127.0.0.1:${PORT}/${DB_NAME}"

start_cluster() {
  if [ ! -d "$PGDATA_DIR" ]; then
    mkdir -p "$PGDATA_DIR" "$RUN_DIR"
    chown -R postgres:postgres "$(dirname "$PGDATA_DIR")" 2>/dev/null || true
    su postgres -c "$PGBIN/initdb -D $PGDATA_DIR -U postgres --auth=trust" >/dev/null
  fi
  if ! pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA_DIR \
      -o '-p $PORT -k $RUN_DIR -c listen_addresses=127.0.0.1' \
      -l /tmp/nuoidaycon-pg/server.log start" >/dev/null
    sleep 1
  fi
}

migrate() {
  psql -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres \
    -c "select 1 from pg_database where datname='${DB_NAME}'" | grep -q 1 || \
    psql -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c "create database ${DB_NAME};"

  psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB_NAME" \
    -f "$ROOT/supabase/tests/bootstrap.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "  applying $(basename "$f")"
    psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB_NAME" -f "$f"
  done
}

case "${1:-up}" in
  up)
    start_cluster; migrate
    echo
    echo "  TEST_DATABASE_URL=$URL"
    ;;
  reset)
    start_cluster
    psql -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres \
      -c "drop database if exists ${DB_NAME};" -c "create database ${DB_NAME};"
    migrate
    echo "  reset: $URL"
    ;;
  down)
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA_DIR stop" >/dev/null 2>&1 || true
    rm -rf "$(dirname "$PGDATA_DIR")"
    echo "  cluster removed"
    ;;
  psql)
    exec psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB_NAME"
    ;;
  *)
    echo "usage: $0 {up|reset|down|psql}" >&2; exit 1
    ;;
esac
