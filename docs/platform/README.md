# CloudNote Platform Docs

CloudNote now runs on a single product path built with NestJS, PostgreSQL, `/admin/`, `/student/`, and `/api/v1/*`.

## Recommended Reading Order

1. [architecture-roadmap.md](./architecture-roadmap.md)
   Current platform shape, supported contracts, and maintenance direction.
2. [release-handoff.md](./release-handoff.md)
   Operational handoff summary, default production settings, and release expectations.
3. [cutover-checklist.md](./cutover-checklist.md)
   Deployment and production switch checklist for the active platform.
4. [manual-acceptance-checklist.md](./manual-acceptance-checklist.md)
   Final manual acceptance items for `/admin/`, `/student/`, and `/api/v1/*`.

## Official Entrypoints

- `npm start` / `npm run dev`: start the NestJS platform.
- `/admin/`: admin app.
- `/student/`: student app.
- `/api/v1/*`: official API namespace.
- `/api/v1/open/*`: official open endpoints for student-side loading and submissions.

## Verification Commands

```bash
npm run typecheck
npm run build:platform
npm run smoke:platform
npm run smoke:platform:web
npm run smoke:platform:web-apps
npm run smoke:platform:backup
npm run smoke:platform:verify
```

## Related Docs

- [../deploy-aliyun.md](../deploy-aliyun.md)
- [../backup-restore.md](../backup-restore.md)
