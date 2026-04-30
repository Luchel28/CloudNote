# Contributing

感谢你参与 CloudNote 的改进。

## 开发前准备

1. 安装依赖

```bash
npm install
```

2. 创建本地环境变量

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

3. 启动本地服务

```bash
npm start
```

## 提交建议

- 保持改动范围聚焦，避免顺手混入无关重构
- 变更上传、下载、任务配置时，尽量手动验证对应流程
- 不要提交 `.env`、数据库文件、真实上传文件或日志文件
- 修改接口行为时，同步更新 README 或相关文档

## Pull Request

- 清楚描述改动目的
- 写明影响范围
- 列出你做过的验证
- 如涉及界面变更，附上截图会更容易评审

## Issue

提交 bug 时，尽量补充部署方式、浏览器、任务配置、报错信息和复现步骤。
