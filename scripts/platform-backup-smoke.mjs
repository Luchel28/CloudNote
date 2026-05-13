import { spawnSync } from 'node:child_process';

const script = String.raw`
set -euo pipefail

temp="$(mktemp -d)"
cleanup() {
  rm -rf "$temp"
}
trap cleanup EXIT

mkdir -p "$temp/app" "$temp/data/uploads" "$temp/backups"
fake_pg_dump="$temp/pg_dump"

cat >"$fake_pg_dump" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      out="$2"
      shift 2
      ;;
    --file=*)
      out="\${1#--file=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
test -n "$out"
printf 'postgres backup smoke\n' >"$out"
EOF
chmod +x "$fake_pg_dump"

printf 'upload smoke\n' >"$temp/data/uploads/sample.txt"

cat >"$temp/app/.env" <<EOF
UPLOAD_DIR=$temp/data/uploads
KEEP_DAYS=0
ADMIN_PASSWORD=super-secret
ADMIN_JWT_SECRET=jwt-secret
PUBLIC_BASE_URL=https://example.test
EOF

PG_DUMP_BIN="$fake_pg_dump" DATABASE_URL=postgres://example.invalid/cloudnote APP_ROOT="$temp/app" DATA_ROOT="$temp/data" BACKUP_ROOT="$temp/backups" bash scripts/backup.sh >/tmp/cloudnote-backup-smoke.out

backup="$(find "$temp/backups" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
test -n "$backup"
test -f "$backup/metadata.txt"
test -f "$backup/uploads.tar.gz"
test -f "$backup/env.redacted"
test -f "$backup/postgres.sql"

if grep -Eq 'super-secret|jwt-secret' "$backup/env.redacted"; then
  echo 'env.redacted leaked a secret' >&2
  exit 1
fi

grep -q 'ADMIN_PASSWORD=<redacted>' "$backup/env.redacted"
grep -q 'ADMIN_JWT_SECRET=<redacted>' "$backup/env.redacted"
grep -q 'db_backup_type=postgres' "$backup/metadata.txt"

echo "backup smoke ok: $(basename "$backup")"
`;

const result = spawnSync('bash', [], {
  input: script,
  stdio: ['pipe', 'inherit', 'inherit'],
  encoding: 'utf8',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
