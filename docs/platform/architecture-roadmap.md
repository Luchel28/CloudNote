# CloudNote Platform Architecture

This repository now treats the NestJS + PostgreSQL platform as the only active product path.

## Current Platform Shape

- `apps/api`: NestJS + TypeScript backend.
- `apps/web-admin`: admin app served at `/admin/`.
- `apps/web-student`: student app served at `/student/`.
- `packages/shared-types`: shared DTOs and contracts.
- `packages/sdk`: typed API client.

## Public Contracts

- Official web entrypoints: `/admin/`, `/student/`.
- Official API prefix: `/api/v1`.
- Student share links: `/student?id=...&code=...` or `/student?code=...`.

## Current Architecture Notes

- Backend services run on PostgreSQL-backed NestJS modules.
- Local file storage remains the current upload provider through `UPLOAD_DIR`.
- The old Express/static shell and root compatibility routes have been removed from production code.
- Student-facing open endpoints are exposed under `/api/v1/open/*`.

## Remaining Direction

- Keep `/admin/`, `/student/`, `/api/v1`, and backup verification green.
- Continue consolidating frontend calls through shared API clients.
- Keep deployment and backup docs aligned with the PostgreSQL-only production path.
