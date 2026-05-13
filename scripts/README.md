# scripts Directory

## Main Scripts

- `backup.sh`: backs up PostgreSQL and `UPLOAD_DIR`.
- `platform-smoke.mjs`: core API smoke tests.
- `platform-web-smoke.mjs`: `/admin/` and `/student/` entry smoke tests.
- `platform-web-apps-smoke.mjs`: SPA fallback and mounted app smoke tests.
- `platform-backup-smoke.mjs`: backup script smoke test.
- `platform-verify.mjs`: combined platform verification.

## `backup.sh`

Default directories:

```text
/opt/cloudnote/app
/opt/cloudnote/data
/opt/cloudnote/backups
```

When `DATABASE_URL` or `POSTGRES_URL` is set, the script:

- Dumps PostgreSQL to `postgres.sql`
- Archives `UPLOAD_DIR`
- Writes a redacted `env.redacted`

Key environment variables:

- `APP_ROOT`
- `DATA_ROOT`
- `BACKUP_ROOT`
- `UPLOAD_DIR`
- `KEEP_DAYS`
- `DATABASE_URL` / `POSTGRES_URL`
- `PG_DUMP_BIN`

Common usage:

```bash
chmod +x ./scripts/backup.sh
./scripts/backup.sh
```
