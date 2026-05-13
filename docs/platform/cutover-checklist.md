# CloudNote Platform Cutover Checklist

Use this checklist when deploying or switching production traffic to the current platform.

## Before Deployment

- [ ] `npm run build:platform` passes
- [ ] Production `.env` sets `NODE_ENV=production`
- [ ] `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`, `UPLOAD_DIR`, `UPLOAD_TMP_DIR`, and `PUBLIC_BASE_URL` are configured
- [ ] `CLOUDNOTE_REQUIRE_DATABASE=true`
- [ ] `CLOUDNOTE_RUN_MIGRATIONS=true`
- [ ] PostgreSQL, `UPLOAD_DIR`, and the current `.env` have been backed up

## Deployment Steps

```bash
cd /opt/cloudnote/app
npm install
npm run build:platform
npm run db:migrate
pm2 start ecosystem.config.js
# or
pm2 restart cloudnote
```

## After Deployment

- [ ] `/admin/` opens and admin login works
- [ ] `/student/` opens and the upload page renders
- [ ] `/api/v1/health` reports a reachable database
- [ ] `npm run smoke:platform` passes
- [ ] `npm run smoke:platform:web` passes
- [ ] `npm run smoke:platform:web-apps` passes
- [ ] `npm run smoke:platform:verify` passes

## Reverse Proxy

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

## Final Checks

- [ ] `/admin/` and `/student/` are served by NestJS
- [ ] Frontend requests only use `/api/v1/*`
- [ ] New share links use `/student?id=...&code=...` or `/student?code=...`
