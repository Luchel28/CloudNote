#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cloudnote/app}"
DATA_ROOT="${DATA_ROOT:-/opt/cloudnote/data}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/cloudnote/backups}"
DB_PATH="${DB_PATH:-$DATA_ROOT/cloudnote.db}"
UPLOAD_DIR="${UPLOAD_DIR:-$DATA_ROOT/uploads}"
KEEP_DAYS="${KEEP_DAYS:-7}"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$BACKUP_ROOT/cloudnote-$timestamp"
db_backup_path="$backup_dir/cloudnote.db"
uploads_backup_path="$backup_dir/uploads.tar.gz"
metadata_path="$backup_dir/metadata.txt"

mkdir -p "$backup_dir"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database file not found: $DB_PATH" >&2
  exit 1
fi

if [[ ! -d "$UPLOAD_DIR" ]]; then
  echo "Upload directory not found: $UPLOAD_DIR" >&2
  exit 1
fi

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$db_backup_path'"
else
  cp -p "$DB_PATH" "$db_backup_path"
fi

tar -C "$(dirname "$UPLOAD_DIR")" -czf "$uploads_backup_path" "$(basename "$UPLOAD_DIR")"

cat >"$metadata_path" <<EOF
backup_time=$timestamp
app_root=$APP_ROOT
data_root=$DATA_ROOT
db_path=$DB_PATH
upload_dir=$UPLOAD_DIR
keep_days=$KEEP_DAYS
sqlite3_used=$(command -v sqlite3 >/dev/null 2>&1 && echo yes || echo no)
EOF

if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'cloudnote-*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
fi

echo "Backup completed: $backup_dir"
