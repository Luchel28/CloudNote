# scripts 目录说明

## 文件用途

- `backup.sh`：Linux 服务器上的可选备份脚本，用于备份 CloudNote 的 SQLite 数据库和 `uploads` 上传目录

该脚本默认按推荐部署目录工作：

```text
/opt/cloudnote/app
/opt/cloudnote/data
/opt/cloudnote/backups
```

如果你的实际部署路径不同，可以通过环境变量覆盖。

## 使用前提

建议服务器已安装：

- `bash`
- `tar`
- `find`
- `sqlite3`

其中 `sqlite3` 不是绝对必需，但安装后脚本会优先使用 `.backup` 方式导出数据库，更适合 SQLite 在线备份。

## 权限设置

首次使用前，请为脚本增加执行权限：

```bash
# 进入项目目录
cd /opt/cloudnote/app

# 为备份脚本增加可执行权限
chmod +x ./scripts/backup.sh
```

## 直接运行

如果你的服务器目录与部署文档一致，可以直接执行：

```bash
# 进入项目目录
cd /opt/cloudnote/app

# 执行备份脚本
./scripts/backup.sh
```

成功后会在 `/opt/cloudnote/backups/` 下生成类似目录：

```text
/opt/cloudnote/backups/cloudnote-20260503-030000/
```

目录内通常包含：

- `cloudnote.db`
- `uploads.tar.gz`
- `metadata.txt`

## 自定义路径或保留天数

脚本支持以下环境变量：

- `APP_ROOT`：应用目录，默认 `/opt/cloudnote/app`
- `DATA_ROOT`：数据目录，默认 `/opt/cloudnote/data`
- `BACKUP_ROOT`：备份目录，默认 `/opt/cloudnote/backups`
- `DB_PATH`：数据库文件路径，默认 `$DATA_ROOT/cloudnote.db`
- `UPLOAD_DIR`：上传目录路径，默认 `$DATA_ROOT/uploads`
- `KEEP_DAYS`：保留天数，默认 `7`

示例：

```bash
# 使用自定义路径执行备份
APP_ROOT=/srv/cloudnote/app \
DATA_ROOT=/srv/cloudnote/data \
BACKUP_ROOT=/srv/cloudnote/backups \
KEEP_DAYS=14 \
/bin/bash /srv/cloudnote/app/scripts/backup.sh
```

说明：

- 当系统安装了 `sqlite3` 时，脚本会优先执行 `.backup`
- 未安装 `sqlite3` 时，脚本会退回为直接复制数据库文件
- `KEEP_DAYS` 大于 `0` 时，脚本会自动清理更早的 `cloudnote-*` 备份目录

## crontab 示例

每天凌晨 3 点执行一次：

```cron
0 3 * * * cd /opt/cloudnote/app && /bin/bash ./scripts/backup.sh >> /opt/cloudnote/backups/backup.log 2>&1
```

保留 14 天备份、每天凌晨 2 点执行一次：

```cron
0 2 * * * cd /opt/cloudnote/app && KEEP_DAYS=14 /bin/bash ./scripts/backup.sh >> /opt/cloudnote/backups/backup.log 2>&1
```

## 使用建议

- 首次上线后先手动跑一次，确认备份目录、权限和输出文件都正常
- 恢复时请搭配同一批次的 `cloudnote.db` 与 `uploads.tar.gz`
- 重要数据建议在本机备份之外，再同步到其他磁盘或异地存储
- 详细恢复流程请参考 [`docs/backup-restore.md`](../docs/backup-restore.md)
