# CloudNote 阿里云部署说明（本地磁盘版）

## 1. 部署目标

本文档用于将 CloudNote 部署到阿里云服务器。

- 当前方案为 Node.js/Express + SQLite + 本地 `uploads` 目录
- 当前不接入 OSS
- 适合班级作业收集、小规模文件收集、单机部署

## 2. 推荐服务器环境

- 操作系统：Ubuntu 22.04 LTS 或 Alibaba Cloud Linux 3
- Node.js：18 LTS 或更高 LTS
- 内存：2 GB 可先运行本地磁盘版
- 磁盘：建议至少 10 GB，并根据上传文件量持续扩容
- 需安装组件：`git`、`Node.js`、`npm`、`pm2`、`nginx`、`build-essential`、`python3`
- 备份建议额外安装：`sqlite3`

## 3. 推荐目录结构

推荐将源码、数据和备份分开存放：

```text
/opt/cloudnote/
  app/                  # Git clone 的源码
  data/
    uploads/            # 学生上传文件
    cloudnote.db        # SQLite 数据库
  backups/              # 备份目录
```

这样做的好处是：

- 更新代码时不容易误删数据
- 备份和扩容时更清晰
- 能直接通过 `.env` 将数据库和上传目录指向 `data/`

## 4. 安装基础环境

以下为 Ubuntu 22.04 示例。Node.js 这里使用 NodeSource 的 20 LTS，符合“18 LTS 或更高 LTS”的建议。

```bash
# 更新软件包索引
sudo apt update

# 安装基础工具和 HTTPS 软件源支持
sudo apt install -y ca-certificates curl gnupg

# 导入 NodeSource GPG 密钥
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

# 配置 Node.js 20 LTS 软件源
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

# 再次更新软件包索引
sudo apt update

# 安装 Git、Nginx、Node.js、SQLite CLI 和原生依赖编译工具
sudo apt install -y git nginx nodejs sqlite3 build-essential python3

# 全局安装 PM2
sudo npm install -g pm2
```

安装完成后可检查版本：

```bash
# 查看 Node.js 版本
node -v

# 查看 npm 版本
npm -v

# 查看 PM2 版本
pm2 -v

# 查看 Nginx 版本
nginx -v
```

## 5. 准备部署目录

```bash
# 创建部署目录、数据目录和备份目录
sudo mkdir -p /opt/cloudnote/app /opt/cloudnote/data/uploads /opt/cloudnote/backups

# 将目录所有权交给当前登录用户
sudo chown -R "$USER":"$USER" /opt/cloudnote
```

如果你使用的是单独的部署账号，请将上面的 `"$USER"` 替换为实际账号。

## 6. 获取源码

```bash
# 克隆仓库到部署目录
git clone https://github.com/Luchel28/CloudNote.git /opt/cloudnote/app

# 进入项目目录
cd /opt/cloudnote/app

# 切换到主分支
git checkout main

# 查看当前提交
git rev-parse --short HEAD
```

如果你要和当前这次交付保持一致，提交应为 `133ef34` 或之后基于 `main` 的明确版本。

## 7. 安装项目依赖

```bash
# 进入项目目录
cd /opt/cloudnote/app

# 安装生产依赖
npm install --omit=dev
```

说明：

- `sqlite3` 依赖会在安装时进行本地编译或下载预编译包，因此服务器上保留 `build-essential` 和 `python3` 更稳妥
- 如果你需要运行代码检查或开发脚本，再执行完整的 `npm install`

## 8. 配置生产环境 `.env`

先复制模板：

```bash
# 复制环境变量模板
cp /opt/cloudnote/app/.env.example /opt/cloudnote/app/.env
```

然后编辑 `/opt/cloudnote/app/.env`，至少确认以下内容：

```dotenv
NODE_ENV=production
PORT=3000
ADMIN_PASSWORD=请替换为强密码
ADMIN_TOKEN_EXPIRE_HOURS=12
CLOUDNOTE_DB_PATH=/opt/cloudnote/data/cloudnote.db
UPLOAD_DIR=/opt/cloudnote/data/uploads
PUBLIC_BASE_URL=https://你的域名或公网IP
MAX_UPLOAD_SIZE_MB=500
MAX_UPLOAD_FILES=20
```

重点说明：

- `ADMIN_PASSWORD` 在生产环境中不能为空，且不能使用默认值 `admin123456`
- `CLOUDNOTE_DB_PATH` 建议使用绝对路径并指向 `/opt/cloudnote/data/cloudnote.db`
- `UPLOAD_DIR` 建议使用绝对路径并指向 `/opt/cloudnote/data/uploads`
- `PUBLIC_BASE_URL` 必须写成用户实际访问的地址，用于生成公开任务链接
- `MAX_UPLOAD_SIZE_MB` 需要和 Nginx 的 `client_max_body_size` 一起核对

## 9. 初始化目录与首次启动验证

先准备日志目录：

```bash
# 创建 PM2 日志目录
mkdir -p /opt/cloudnote/app/logs
```

你可以先前台启动一次，确认 `.env` 和目录都正确：

```bash
# 进入项目目录
cd /opt/cloudnote/app

# 临时前台启动服务
npm start
```

首次启动时，程序会自动：

- 按 `.env` 中的路径创建数据库目录
- 创建 SQLite 数据库文件（如果不存在）
- 创建上传目录（如果不存在）

看到服务启动成功后，可按 `Ctrl + C` 结束，再改用 PM2 常驻运行。

## 10. 使用 PM2 常驻运行

项目根目录已包含 `ecosystem.config.js`，可直接使用：

```bash
# 进入项目目录
cd /opt/cloudnote/app

# 使用 PM2 启动 CloudNote
pm2 start ecosystem.config.js

# 查看运行状态
pm2 status

# 保存当前 PM2 进程列表
pm2 save

# 生成开机自启命令
pm2 startup
```

执行 `pm2 startup` 后，终端会输出一条需要再执行一次的 `sudo` 命令，请按提示复制执行。

常用运维命令：

```bash
# 重启 CloudNote
pm2 restart cloudnote

# 查看 CloudNote 日志
pm2 logs cloudnote

# 停止 CloudNote
pm2 stop cloudnote
```

## 11. 配置 Nginx 反向代理

新增站点配置文件：

```bash
# 编辑 Nginx 站点配置
sudo nano /etc/nginx/sites-available/cloudnote
```

示例配置如下：

```nginx
server {
    listen 80;
    server_name your-domain-or-ip;

    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

启用配置：

```bash
# 启用 CloudNote 站点
sudo ln -s /etc/nginx/sites-available/cloudnote /etc/nginx/sites-enabled/cloudnote

# 删除默认站点
sudo rm -f /etc/nginx/sites-enabled/default

# 检查 Nginx 配置语法
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx

# 设置 Nginx 开机自启
sudo systemctl enable nginx
```

说明：

- `client_max_body_size` 应不小于 `.env` 中的 `MAX_UPLOAD_SIZE_MB`
- 如果后续使用 HTTPS，请在 Nginx 层增加证书配置
- 反向代理后，建议仅对外开放 `80/443`，不要直接暴露 Node.js 的 `3000` 端口

## 12. 阿里云安全组与访问检查

至少检查以下项目：

- 安全组放行 `22` 端口用于 SSH
- 安全组放行 `80` 端口用于 HTTP
- 如启用 HTTPS，再放行 `443`
- `3000` 端口仅保留服务器本机访问更稳妥

部署完成后可验证：

```text
http://你的域名/admin.html
```

如果已配置 HTTPS，则使用：

```text
https://你的域名/admin.html
```

## 13. 更新发布建议

后续更新 CloudNote 时，建议按以下顺序操作：

```bash
# 进入项目目录
cd /opt/cloudnote/app

# 先做一次备份
bash ./scripts/backup.sh

# 拉取最新代码
git pull origin main

# 安装依赖
npm install --omit=dev

# 重启服务
pm2 restart cloudnote
```

如果更新涉及环境变量变更，请先比对 `.env.example` 再重启服务。

## 14. 运维注意事项

- 当前推荐方案是“阿里云服务器 + 本地磁盘存储”，先保证部署简单稳定，后续再考虑 OSS
- SQLite 与 `uploads` 必须一起管理和备份，不能只保留其中一项
- 建议将 `/opt/cloudnote/backups` 挂到更大磁盘，或定期同步到其他备份介质
- 生产环境发布前务必检查 `.env` 中的 `ADMIN_PASSWORD`、`PUBLIC_BASE_URL`、`CLOUDNOTE_DB_PATH`、`UPLOAD_DIR`
- 建议结合 [`docs/backup-restore.md`](./backup-restore.md) 制定日常备份计划
