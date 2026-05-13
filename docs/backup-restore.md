# CloudNote 备份与恢复说明

## 备份范围

当前平台主线需要备份两部分：

```text
PostgreSQL 数据库
UPLOAD_DIR 上传目录
```

旧 SQLite 数据库只作为一次性迁移输入，不再作为正式备份格式。

## 推荐备份输出

```text
/opt/cloudnote/backups/cloudnote-20260512-120000/
  postgres.sql
  uploads.tar.gz
  env.redacted
  metadata.txt
```

## 使用脚本备份

```bash
cd /opt/cloudnote/app
/bin/bash ./scripts/backup.sh
```

## PostgreSQL 模式要求

- `.env` 中已配置 `DATABASE_URL`。
- 服务器已安装 `pg_dump`。
- `UPLOAD_DIR` 可读。

## 恢复前准备

1. 停止平台服务。
2. 额外备份当前数据库和上传目录。
3. 确认数据库备份和上传目录备份来自同一批次。

## PostgreSQL 恢复示例

```bash
pm2 stop cloudnote

dropdb cloudnote
createdb cloudnote
psql postgres://cloudnote:password@127.0.0.1:5432/cloudnote -f /opt/cloudnote/backups/cloudnote-20260512-120000/postgres.sql

rm -rf /opt/cloudnote/data/uploads
mkdir -p /opt/cloudnote/data/uploads
tar -C /opt/cloudnote/data -xzf /opt/cloudnote/backups/cloudnote-20260512-120000/uploads.tar.gz

pm2 start cloudnote
```

## 恢复后检查

- `/admin/` 可打开并登录。
- `/student/` 可打开。
- `/api/v1/health` 数据库可达。
- 抽查历史任务、提交记录和文件下载。
