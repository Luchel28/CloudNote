# CloudNote 备份与恢复说明

## 1. 备份范围

CloudNote 当前使用：

- SQLite 数据库存储任务、提交记录和元数据
- 本地 `uploads` 目录存储实际上传文件

因此，生产环境备份至少要覆盖以下两部分：

```text
/opt/cloudnote/data/cloudnote.db
/opt/cloudnote/data/uploads/
```

不要只备份数据库或只备份上传目录。两者必须尽量保持同一时间点的对应关系，否则可能出现：

- 后台记录存在，但文件已丢失
- 磁盘文件还在，但数据库记录不存在
- 下载、统计或回收站数据不一致

## 2. 推荐备份目录

推荐使用如下目录：

```text
/opt/cloudnote/backups/
  cloudnote-20260503-030000/
    cloudnote.db
    uploads.tar.gz
    metadata.txt
```

其中：

- `cloudnote.db` 为同一时刻导出的 SQLite 数据库副本
- `uploads.tar.gz` 为上传目录归档
- `metadata.txt` 用于记录备份时间、源路径和脚本版本

## 3. 备份前注意事项

- 优先在低峰期执行备份，避免上传高峰时目录变化过快
- 恢复时必须使用同一批次的数据库和上传目录
- 备份脚本建议放在服务器本地执行，不建议直接在开发机上操作生产数据
- 备份文件不要与业务数据混放，避免误删或磁盘打满
- 如果数据很重要，建议在本地磁盘备份之外，再同步一份到另一块云盘或异地介质

## 4. 手动备份示例

以下示例基于推荐部署目录：

```bash
# 定义时间戳
TS="$(date +%Y%m%d-%H%M%S)"

# 创建本次备份目录
mkdir -p "/opt/cloudnote/backups/cloudnote-$TS"

# 使用 SQLite 官方 .backup 方式导出数据库
sqlite3 /opt/cloudnote/data/cloudnote.db ".backup '/opt/cloudnote/backups/cloudnote-$TS/cloudnote.db'"

# 打包上传目录
tar -C /opt/cloudnote/data -czf "/opt/cloudnote/backups/cloudnote-$TS/uploads.tar.gz" uploads

# 记录备份元数据
cat >"/opt/cloudnote/backups/cloudnote-$TS/metadata.txt" <<EOF
backup_time=$TS
db_path=/opt/cloudnote/data/cloudnote.db
upload_dir=/opt/cloudnote/data/uploads
EOF
```

说明：

- `sqlite3 .backup` 比直接复制数据库文件更适合在线备份 SQLite
- `tar -C /opt/cloudnote/data` 可以保持 `uploads/` 目录结构
- 如果需要自动化，可直接使用 [`scripts/backup.sh`](../scripts/backup.sh)

## 5. 可选：备份前暂停写入

如果你希望进一步降低“备份时仍有新上传写入”的风险，可在维护窗口中临时停止服务：

```bash
# 停止 CloudNote
pm2 stop cloudnote

# 执行备份
bash /opt/cloudnote/app/scripts/backup.sh

# 重新启动 CloudNote
pm2 start cloudnote
```

这种方式会带来短暂不可用，但数据库文件与上传目录的一致性更好。

## 6. 恢复前准备

执行恢复前，建议先做四件事：

1. 确认要恢复的数据库文件和 `uploads` 归档来自同一批次备份。
2. 停止 CloudNote，避免恢复过程中继续写入。
3. 将当前线上数据先额外备份一份，避免误操作后无法回退。
4. 检查目标磁盘空间是否足够解压恢复包。

## 7. 恢复步骤示例

假设要恢复以下备份：

```text
/opt/cloudnote/backups/cloudnote-20260503-030000/cloudnote.db
/opt/cloudnote/backups/cloudnote-20260503-030000/uploads.tar.gz
```

恢复步骤如下：

```bash
# 停止 CloudNote
pm2 stop cloudnote

# 备份当前线上数据，防止恢复失败后无法回退
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "/opt/cloudnote/backups/pre-restore-$TS"
cp -p /opt/cloudnote/data/cloudnote.db "/opt/cloudnote/backups/pre-restore-$TS/cloudnote.db"
tar -C /opt/cloudnote/data -czf "/opt/cloudnote/backups/pre-restore-$TS/uploads.tar.gz" uploads

# 恢复数据库文件
cp -f /opt/cloudnote/backups/cloudnote-20260503-030000/cloudnote.db /opt/cloudnote/data/cloudnote.db

# 清空旧上传目录
rm -rf /opt/cloudnote/data/uploads

# 重建上传目录
mkdir -p /opt/cloudnote/data/uploads

# 解压恢复上传目录
tar -C /opt/cloudnote/data -xzf /opt/cloudnote/backups/cloudnote-20260503-030000/uploads.tar.gz

# 校正目录权限
chown -R "$USER":"$USER" /opt/cloudnote/data

# 重启 CloudNote
pm2 start cloudnote
```

如果你使用的是专门的部署账号，请将 `"$USER"` 替换成实际账号。

## 8. 恢复后检查

恢复完成后，至少确认以下内容：

- 能正常打开 `/admin.html`
- 管理员可以登录后台
- 作业列表、提交记录和统计数据可正常显示
- 任意抽查几份历史上传文件，确认可下载
- `pm2 logs cloudnote` 中没有数据库或文件路径报错

如果后台记录存在但文件下载失败，通常意味着数据库和 `uploads` 没有来自同一批次备份。

## 9. 定期备份建议

- 建议至少每天自动备份一次
- 上传量高的场景可改为每 6 小时或每 12 小时一次
- 至少保留最近 7 天到 14 天的备份
- 每次系统升级、批量导入或重要考试周前，额外手动做一次备份

可结合 `cron` 和 [`scripts/backup.sh`](../scripts/backup.sh) 实现自动执行，详见 [`scripts/README.md`](../scripts/README.md)。
