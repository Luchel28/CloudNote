# CloudNote Platform Manual Acceptance Checklist

Use this checklist to verify the current production platform at `/admin/` and `/student/`.

## Environment

- [ ] `npm run build:platform` passes
- [ ] `npm run smoke:platform` passes
- [ ] `npm run smoke:platform:web` passes
- [ ] `npm run smoke:platform:web-apps` passes
- [ ] PostgreSQL is connected and `/api/v1/health` reports `configured=true` and `reachable=true`

## Admin `/admin/`

- [ ] Admin login works
- [ ] Create assignment view loads correctly
- [ ] Assignments, statistics, submissions, recycle bin, and storage views all open normally
- [ ] Templates can be viewed, saved, applied, and deleted
- [ ] Single download, archive download, and CSV export all work

## Student `/student/`

- [ ] Default entry loads
- [ ] Assignment links with `id` and `code` load the correct assignment
- [ ] Field validation, file picking, drag-and-drop upload, and selected-file removal work
- [ ] Successful submission appears in the admin submission list
- [ ] Repeat-submit guards, closed assignments, and deadline restrictions behave as expected

## Historical Data Sampling

- [ ] Review at least 5 historical assignments
- [ ] Review at least 5 historical submissions
- [ ] Review at least 5 historical file downloads
- [ ] Confirm recycle bin data can be read and restored correctly
