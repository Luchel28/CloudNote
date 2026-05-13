# CloudNote Platform Handoff

Updated: 2026-05-12

## Current Status

- NestJS + PostgreSQL is the only supported runtime path.
- Official web entrypoints are `/admin/` and `/student/`.
- Official API namespace is `/api/v1/*`.
- Student loading and submission flows use `/api/v1/open/*`.
- Admin assets are built from `apps/web-admin/src`.
- Student assets are built from `apps/web-student/src`.
- The old root static shell, Express routes, and runtime compatibility layer are no longer part of production code.

## Verified Commands

- `npm run typecheck`
- `npm run build:platform`
- `npm run smoke:platform`
- `npm run smoke:platform:web`
- `npm run smoke:platform:web-apps`
- `npm run smoke:platform:backup`

## Ongoing Maintenance

- Keep `/admin/`, `/student/`, and `/api/v1/*` as the only external entrypoints.
- Keep frontend calls aligned with shared API clients where practical.
- Run `npm run smoke:platform:verify` before release.

## Default Production Settings

```dotenv
NODE_ENV=production
API_PORT=3001
DATABASE_URL=postgres://cloudnote:strong-password@db-host:5432/cloudnote
CLOUDNOTE_REQUIRE_DATABASE=true
CLOUDNOTE_RUN_MIGRATIONS=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong-password
ADMIN_JWT_SECRET=long-random-secret
UPLOAD_DIR=/opt/cloudnote/data/uploads
UPLOAD_TMP_DIR=/opt/cloudnote/data/uploads/.tmp
PUBLIC_BASE_URL=https://your-domain.example
```
