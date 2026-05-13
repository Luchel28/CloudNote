# CloudNote

CloudNote now runs as a single NestJS platform application.

- Admin app: `/admin/`
- Student app: `/student/`
- Official API: `/api/v1/*`
- Student open endpoints: `/api/v1/open/*`

## Stack

- Node.js
- NestJS
- TypeScript
- PostgreSQL
- Vite apps in `apps/web-admin` and `apps/web-student`

## Local Development

1. Install dependencies

```bash
npm install
```

2. Copy environment variables

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Start PostgreSQL

```bash
docker compose -f docker-compose.platform.yml up -d postgres
```

4. Configure database settings in `.env`

```env
DATABASE_URL=postgres://cloudnote:cloudnote_dev_password@localhost:5432/cloudnote
CLOUDNOTE_REQUIRE_DATABASE=true
CLOUDNOTE_RUN_MIGRATIONS=true
```

5. Start the platform

```bash
npm run dev
```

6. Open the apps

```text
http://localhost:3001/admin/
http://localhost:3001/student/
```

## Lightweight Startup Without PostgreSQL

If you only want to inspect static shell loading and asset delivery:

```env
# DATABASE_URL=
CLOUDNOTE_REQUIRE_DATABASE=false
CLOUDNOTE_RUN_MIGRATIONS=false
```

In this mode the platform can start, but data-backed endpoints will report that the database is unavailable.

## Common Commands

```bash
npm run build:platform
npm run db:migrate
npm run smoke:platform
npm run smoke:platform:web
```

## Build Outputs

- `dist/apps/api`
- `apps/web-admin/dist`
- `apps/web-student/dist`

## Key Environment Variables

| Variable | Purpose |
| --- | --- |
| `API_PORT` / `PORT` | Platform port, default `3001` |
| `PUBLIC_BASE_URL` | Public base URL |
| `ADMIN_USERNAME` | Admin username, default `admin` |
| `ADMIN_PASSWORD` | Admin password |
| `ADMIN_JWT_SECRET` | Admin JWT secret |
| `DATABASE_URL` | PostgreSQL connection string |
| `CLOUDNOTE_REQUIRE_DATABASE` | Block startup if PostgreSQL is unavailable |
| `CLOUDNOTE_RUN_MIGRATIONS` | Run migrations on startup |
| `UPLOAD_DIR` | Upload directory |
| `UPLOAD_TMP_DIR` | Temporary upload directory |
| `MAX_UPLOAD_SIZE_MB` | Per-file upload limit |
| `MAX_UPLOAD_FILES` | Maximum files per submission |
| `WEB_ADMIN_DIST` | Admin app build directory |
| `WEB_STUDENT_DIST` | Student app build directory |

## Repository Layout

```text
.
|-- apps/api               NestJS platform API
|-- apps/web-admin         Admin Vite app
|-- apps/web-student       Student Vite app
|-- packages/shared-types  Shared DTOs and contracts
|-- packages/sdk           Platform SDK
`-- uploads/               Uploaded files
```
