# CloudNote 云笺

CloudNote 云笺是一个网页端作业与文件收集工具，适合教师、班委或培训管理人员快速创建提交任务、生成上传链接，并在后台统一查看与下载学生提交内容。

项目当前采用前后端一体部署方案，基于 Express、SQLite、本地上传目录与静态页面实现，目标是优先保证部署简单、上传稳定、后台管理直观。

## 功能特性

- 创建收集任务并生成公开上传链接
- 支持学生按任务要求上传文件
- 后台查看提交记录与统计信息
- 支持管理员下载提交文件
- 使用 SQLite 保存任务和提交元数据
- 使用本地目录持久化上传文件

## 技术栈

- Node.js
- Express
- SQLite
- Multer
- 原生 HTML / CSS / JavaScript

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 创建环境变量文件

```bash
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

3. 根据需要修改 `.env`

本地开发阶段可以暂时使用默认管理员密码 `admin123456`。

4. 启动项目

```bash
npm start
```

5. 打开管理后台

```text
http://localhost:3000/admin.html
```

创建任务后，管理员可复制公开上传链接发给学生使用。

## 环境变量说明

| 配置项 | 说明 |
| --- | --- |
| `PORT` | Express 服务监听端口，默认 `3000` |
| `ADMIN_PASSWORD` | 管理员后台登录密码 |
| `ADMIN_TOKEN_EXPIRE_HOURS` | 管理员登录 token 有效期，单位为小时，默认 `12` |
| `CLOUDNOTE_DB_PATH` | SQLite 数据库文件路径 |
| `UPLOAD_DIR` | 学生上传文件保存目录 |
| `PUBLIC_BASE_URL` | 对外访问地址，用于生成公开任务链接 |
| `MAX_UPLOAD_SIZE_MB` | 系统级单文件上传大小上限 |
| `MAX_UPLOAD_FILES` | 系统级单次最多上传文件数量，默认 `20` |

## 上传限制说明

- `MAX_UPLOAD_SIZE_MB` 是系统级安全限制，始终生效
- `MAX_UPLOAD_FILES` 是系统级单次最多上传文件数量限制
- `enableLimit` 是单个任务的文件数量与大小限制开关
- 当任务关闭 `enableLimit` 时，不再按任务级 `maxFiles` 和 `maxFileSizeMb` 拦截，但仍会受到系统级上传大小、系统级上传数量、允许扩展名和必传文件等规则限制
- 当任务开启 `enableLimit` 时，上传文件数量超过 `maxFiles` 或单文件大小超过 `maxFileSizeMb` 会返回中文错误提示

## 生产环境注意事项

- `NODE_ENV=production` 时必须显式配置 `ADMIN_PASSWORD`
- 生产环境的 `ADMIN_PASSWORD` 不能为空，也不能使用默认值 `admin123456`
- 部署前应检查 `.env` 中的端口、公开访问地址、数据库路径、上传目录和上传限制
- 如果使用 Nginx、宝塔、PM2 或云服务器反向代理，还需要同步检查代理层上传大小限制、防火墙和安全组

## 目录结构

```text
.
├─ public/      静态前端页面与脚本
├─ src/         路由、服务、工具与数据库逻辑
├─ uploads/     上传文件目录
├─ server.js    服务入口
└─ package.json 项目配置
```

## 提交与部署前检查

以下内容不要提交到仓库：

- `.env`
- `cloudnote.db` 或其他数据库文件
- `uploads` 中的真实上传文件
- `node_modules`
- 临时测试文件、日志文件和缓存文件

以下内容建议保留：

- `.env.example`
- `uploads/.gitkeep`
- `README.md`
- `package.json`
- `package-lock.json`
- `server.js`
- `public/`
- `src/`

## Release

当前已发布版本：`v1.0.0`

Release 页面：

https://github.com/Luchel28/CloudNote/releases
