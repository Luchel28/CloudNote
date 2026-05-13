# CloudNote 第二优先级修改说明（历史归档）

更新时间：2026-04-29

本文档保留为历史记录，只描述平台早期阶段已经完成过的一批功能优化。
当前正式平台以 `docs/platform/` 下的现行文档为准。

## 历史范围摘要

- 创建和编辑任务体验增强
- 自定义字段、模板、回收站和学生提交联动优化
- 提交展示、下载和统计体验优化

## 当前对应能力

- 模板能力已接入当前平台 API
- 回收站、统计、提交记录和存储统计由 `/api/v1/*` 提供
- PostgreSQL 是当前唯一受支持的数据源

## 当前验收入口

- 平台总验收：`npm run smoke:platform:verify`
- 人工验收清单：`docs/platform/manual-acceptance-checklist.md`
- 发布交接：`docs/platform/release-handoff.md`
