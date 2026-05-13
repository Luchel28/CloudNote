# CloudNote 阿里云部署说明

## 目标

当前推荐部署方式：

- NestJS 平台 API
- PostgreSQL
- 本地磁盘 `uploads/`
- 正式入口 `/admin/`、`/student/`

## 推荐环境

- Ubuntu 22.04 LTS 或 Alibaba Cloud Linux 3
- Node.js 20 LTS
- PostgreSQL 16
- Nginx
- PM2

## 推荐目录

```text
/opt/cloudnote/
  app/
  data/
    uploads/
  backups/
```

## 安装依赖

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git nginx nodejs postgresql-client build-essential python3
sudo npm install -g pm2
```

## 获取代码

```bash
git clone https://github.com/Luchel28/CloudNote.git /opt/cloudnote/app
cd /opt/cloudnote/app
npm install
```

## 配置 `.env`

```dotenv
NODE_ENV=production
API_PORT=3001
PUBLIC_BASE_URL=https://your-domain.example
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong-password
ADMIN_JWT_SECRET=long-random-secret
DATABASE_URL=postgres://cloudnote:strong-password@127.0.0.1:5432/cloudnote
CLOUDNOTE_REQUIRE_DATABASE=true
CLOUDNOTE_RUN_MIGRATIONS=true
UPLOAD_DIR=/opt/cloudnote/data/uploads
UPLOAD_TMP_DIR=/opt/cloudnote/data/uploads/.tmp
MAX_UPLOAD_SIZE_MB=500
MAX_UPLOAD_FILES=20
```

## 构建与启动

```bash
cd /opt/cloudnote/app
npm run build:platform
npm run db:migrate
pm2 start ecosystem.config.js
pm2 save
```

## Nginx

```nginx
server {
    listen 80;
    server_name your-domain-or-ip;

    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

## 部署后验证

- `https://你的域名/admin/`
- `https://你的域名/student/`
- `https://你的域名/api/v1/health`

## 更新建议

```bash
cd /opt/cloudnote/app
/bin/bash ./scripts/backup.sh
git pull origin main
npm install
npm run build:platform
npm run db:migrate
pm2 restart cloudnote
```
