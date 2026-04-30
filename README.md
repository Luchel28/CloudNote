# CloudNote 云笺

CloudNote 云笺是一个网页端作业/文件收集工具，使用 Express、SQLite、本地上传目录和静态前端页面实现。当前阶段保留前后端一体部署，核心目标是稳定创建收集任务、生成上传链接、接收学生文件并支持后台下载。

## 本地运行步骤

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量示例：

```bash
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

3. 按需修改 `.env`，本地开发可以暂时使用默认管理员密码 `admin123456`。

4. 启动项目：

```bash
npm start
```

5. 打开管理后台：

```text
http://localhost:3000/admin.html
```

学生上传链接由管理员在后台创建任务后复制获得。

## .env 配置说明

| 配置项 | 说明 |
|---|---|
| `PORT` | Express 服务监听端口，默认 `3000`。 |
| `ADMIN_PASSWORD` | 管理员后台登录密码。本地开发可用默认值；生产环境必须改成强密码。 |
| `ADMIN_TOKEN_EXPIRE_HOURS` | 管理员登录 token 有效期，单位为小时，默认 `12`。 |
| `CLOUDNOTE_DB_PATH` | SQLite 数据库文件路径，保存任务、提交记录、字段配置等数据。相对路径基于项目根目录解析。 |
| `UPLOAD_DIR` | 学生上传文件保存目录。相对路径基于项目根目录解析，部署时应持久化保存。 |
| `PUBLIC_BASE_URL` | 对外访问地址，用于生成公开任务链接，部署后应改成真实域名或公网 IP。 |
| `MAX_UPLOAD_SIZE_MB` | 服务器系统级单文件上传上限，由 multer 强制限制，用于保护服务器资源。 |

## 上传限制说明

- `MAX_UPLOAD_SIZE_MB` 是服务器系统级安全限制，始终生效。
- `enableLimit` 是单个任务的文件数量/大小限制开关。
- 当任务关闭 `enableLimit` 时，不再按该任务的 `maxFiles`、`maxFileSizeMb` 拦截，但仍会受 `MAX_UPLOAD_SIZE_MB`、允许扩展名、必传文件等规则限制。
- 当任务开启 `enableLimit` 时，上传文件数量超过 `maxFiles` 或单文件大小超过 `maxFileSizeMb` 会返回中文错误提示。

## 生产环境注意事项

- `NODE_ENV=production` 时必须显式配置 `ADMIN_PASSWORD`。
- 生产环境的 `ADMIN_PASSWORD` 不能为空，也不能是默认值 `admin123456`。
- 推荐设置足够长、不可猜测的强密码。
- 部署服务器前必须检查 `.env`，确认端口、公开访问地址、数据库路径、上传目录和上传大小限制符合实际环境。
- 如果使用 Nginx、宝塔、PM2 或云服务器反向代理，还需要同步检查代理层上传大小限制、防火墙和安全组。

## 交付与部署前检查

不要提交或上传以下内容：

- `.env`
- `cloudnote.db` 或其他 `*.db` 数据库文件
- `uploads` 中的真实上传文件
- `node_modules`
- 临时测试文件、日志文件和系统缓存文件

可以保留：

- `.env.example`
- `uploads/.gitkeep`
- `README.md`
- `修改说明.md`
- `package.json`
- `package-lock.json`
- `server.js`
- `public` 目录源码
## MAX_UPLOAD_FILES 说明

`MAX_UPLOAD_FILES` 是系统级单次最多上传文件数量，默认 `20`。任务级 `maxFiles` 仍不能超过该系统上限，前端公开配置 `/api/public-config` 会返回 `maxUploadFiles` 用于页面提示和校验。
