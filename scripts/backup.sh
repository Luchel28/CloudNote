#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cloudnote/app}"
DATA_ROOT="${DATA_ROOT:-/opt/cloudnote/data}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/cloudnote/backups}"
UPLOAD_DIR="${UPLOAD_DIR:-$DATA_ROOT/uploads}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DATABASE_URL="${DATABASE_URL:-${POSTGRES_URL:-}}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$BACKUP_ROOT/cloudnote-$timestamp"
uploads_backup_path="$backup_dir/uploads.tar.gz"
metadata_path="$backup_dir/metadata.txt"
env_redacted_path="$backup_dir/env.redacted"

mkdir -p "$backup_dir"

if [[ ! -d "$UPLOAD_DIR" ]]; then
  echo "Upload directory not found: $UPLOAD_DIR" >&2
  exit 1
fi

write_redacted_env() {
  local env_file="$APP_ROOT/.env"
  if [[ ! -f "$env_file" ]]; then
    : >"$env_redacted_path"
    return
  fi

  awk '
    BEGIN {
      split("ADMIN_PASSWORD ADMIN_JWT_SECRET SESSION_SECRET DATABASE_URL POSTGRES_URL PGPASSWORD", secretKeys, " ");
      for (i in secretKeys) secrets[secretKeys[i]] = 1;
    }
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next }
    {
      line = $0;
      pos = index(line, "=");
      if (pos == 0) {
        print line;
        next;
      }
      key = substr(line, 1, pos - 1);
      value = substr(line, pos + 1);
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key);
      if (key in secrets) {
        print key "=<redacted>";
      } else {
        print key "=" value;
      }
    }
  ' "$env_file" >"$env_redacted_path"
}

backup_postgres() {
  local db_backup_path="$backup_dir/postgres.sql"
  if ! command -v "$PG_DUMP_BIN" >/dev/null 2>&1; then
    echo "pg_dump not found: $PG_DUMP_BIN" >&2
    exit 1
  fi

  "$PG_DUMP_BIN" "$DATABASE_URL" --no-owner --no-privileges --file "$db_backup_path"

  cat >"$metadata_path" <<EOF
backup_time=$timestamp
app_root=$APP_ROOT
data_root=$DATA_ROOT
db_backup_type=postgres
database_url=<redacted>
upload_dir=$UPLOAD_DIR
keep_days=$KEEP_DAYS
pg_dump_bin=$PG_DUMP_BIN
EOF
}

write_redacted_env

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL or POSTGRES_URL is required for platform backups." >&2
  exit 1
fi

backup_postgres

tar -C "$(dirname "$UPLOAD_DIR")" -czf "$uploads_backup_path" "$(basename "$UPLOAD_DIR")"

if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'cloudnote-*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
fi

echo "Backup completed: $backup_dir"
