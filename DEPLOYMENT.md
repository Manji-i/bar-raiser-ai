# 部署指南

## 线上现状

- 线上地址：`http://14.103.45.4:3000/`
- 服务器：`root@14.103.45.4`
- 项目目录：`/root/bar-raiser-ai-new/bar-raiser-ai`
- 进程管理：PM2，进程名 `bar-raiser-ai`
- 启动命令：`npm start`

线上服务器访问 GitHub 不稳定。若 `git fetch` 或 `git pull` 卡住，使用下方“Bundle 部署路径”。

## 标准部署路径

适用于服务器能正常访问 GitHub 的情况：

```bash
ssh root@14.103.45.4
cd /root/bar-raiser-ai-new/bar-raiser-ai
umask 077
mkdir -p /root/bar-raiser-ai-backups
deploy_backup_dir="/root/bar-raiser-ai-backups/data-before-$(date +%Y%m%d-%H%M%S)"
cp -a data "$deploy_backup_dir"
chmod -R go-rwx "$deploy_backup_dir"
git fetch origin
git pull --ff-only origin main
npm ci
npm test
npm run build
pm2 restart bar-raiser-ai --update-env
pm2 save
```

验证：

```bash
pm2 status bar-raiser-ai
curl -sS -I http://127.0.0.1:3000/
```

## Bundle 部署路径

适用于服务器拉 GitHub 失败、卡住，或本地 `main` 已确认但尚未推送 GitHub 的情况。先确认本地 `main` 是本次要部署的唯一来源：

```bash
git status -sb
git rev-parse --short main
git log --oneline --left-right main...origin/main
git bundle create /private/tmp/bar-raiser-ai-main.bundle main
git bundle verify /private/tmp/bar-raiser-ai-main.bundle
scp /private/tmp/bar-raiser-ai-main.bundle root@14.103.45.4:/tmp/bar-raiser-ai-main.bundle
```

服务器合并前先备份 SQLite。简历源文件已经存在时，备份必须同时覆盖整个 `data/`；下面用受限目录保存完整数据副本：

```bash
cd /root/bar-raiser-ai-new/bar-raiser-ai
umask 077
mkdir -p /root/bar-raiser-ai-backups
deploy_backup_dir="/root/bar-raiser-ai-backups/data-before-$(date +%Y%m%d-%H%M%S)"
cp -a data "$deploy_backup_dir"
chmod -R go-rwx "$deploy_backup_dir"
git bundle verify /tmp/bar-raiser-ai-main.bundle
git fetch /tmp/bar-raiser-ai-main.bundle main
git merge --ff-only FETCH_HEAD
npm ci
npm test
npm run build
pm2 restart bar-raiser-ai --update-env
pm2 save
```

只有 GitHub 的 `origin/main` 已经真实推送到同一个提交时，才能更新服务器的 `refs/remotes/origin/main`。如果 Bundle 来自尚未推送的本地 `main`，服务器显示 `main...origin/main [ahead N]` 是正确状态，不要伪造远端引用。

验证线上资源是否更新：

```bash
pm2 status bar-raiser-ai
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
curl -sS -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/api/reports?analysisMode=candidate'
curl -sS -L http://14.103.45.4:3000/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
```

预期首页为 `200`，未认证报告接口为 `401`，PM2 为 `online`。数据库结构检查和更完整的冒烟步骤见 `docs/operator-runbook.md`。

## Docker 部署

```bash
docker build -t bar-raiser-ai .
mkdir -p data
docker run -d \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/.env:/app/.env" \
  --name bar-raiser-ai \
  --restart unless-stopped \
  bar-raiser-ai
```

Dockerfile 会复制 `server.js`、`services/` 和 `dist/`，并创建可写的 `/app/data`。

候选人模式会把简历源文件写入 `/app/data/uploads/resumes/`。容器部署必须继续持久化整个 `/app/data`，不能只单独挂载 `app.db`。

## 直接部署

```bash
npm ci
npm test
npm run build
npm start
```

生产环境建议用 PM2：

```bash
pm2 start npm --name bar-raiser-ai -- start
pm2 save
```

## 环境配置

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `PORT` | 服务端口 | `3000` |
| `FRONTEND_URL` | 前端访问地址 | `https://your-domain.com` |
| `AI_PROVIDER` | AI 服务提供商 | `doubao` |
| `DOUBAO_MODEL` | 豆包模型 ID，默认 Seed 2.1 Pro | `doubao-seed-2-1-pro-260628` |
| `DOUBAO_ENDPOINT_ID` | 旧版豆包 Endpoint ID（`DOUBAO_MODEL` 优先） | `ep-xxx` |
| `DOUBAO_API_KEY` | 豆包 API Key | `xxx` |
| `DOUBAO_BASE_URL` | 豆包 OpenAI-compatible Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| `GEMINI_API_KEY` | Gemini API Key | `xxx` |

不要在 `.env` 文件里设置 `NODE_ENV=production`。Vite 会提示该写法不受支持；生产构建由 `npm run build` 控制。

## 数据管理

应用数据存储在 `data/app.db`（SQLite，Node 内置 `node:sqlite` 驱动，见 `services/db.js`）：

- `users` / `tokens` 表：用户数据和会话 token
- `reports` 表：评估报告
- `report_attachments` 表：简历附件元数据、解析状态与 SHA256
- `feedback` 表：用户反馈
- `system_prompt` / `candidate_system_prompt` 表：招聘评估与个人复盘两套独立 Prompt（含版本历史）
- `uploads/resumes/`：候选人简历源文件，按用户目录和随机文件名保存

历史 JSON 文件（`users.json` 等）已被 `scripts/migrate-to-sqlite.mjs` 迁移并备份为 `*.migrated.bak`。

这些数据可能包含用户 token、候选人材料、简历源文件和评估结果。部署时要持久化整个 `data/`，不要提交真实内容。简历上传上限为 10 MB，支持 PDF、DOCX、TXT；反向代理的请求体限制必须不低于 10 MB，并预留 multipart 开销。

生产环境应确保：

- 运行进程对 `data/` 有读写权限，但该目录不在静态资源目录中；
- 备份同时覆盖 `app.db` 与 `uploads/resumes/`，并按敏感数据加密和限制访问；
- 多实例部署使用共享持久卷，避免报告元数据与源文件落在不同节点；
- 更新或回滚应用代码时不覆盖、清空 `data/`。

## 故障排查

### 端口被占用

```bash
ss -ltnp | grep ':3000'
```

### PM2 服务异常

```bash
pm2 status bar-raiser-ai
pm2 logs bar-raiser-ai
pm2 restart bar-raiser-ai --update-env
```

### 服务器 git fetch 卡住

1. 用 `ps -eo pid,ppid,etime,cmd | grep 'git fetch'` 确认卡住进程。
2. 终止本次部署启动的卡住进程。
3. 改用 Bundle 部署路径。

### AI 服务问题

检查对应 API Key、Endpoint ID、Base URL 是否正确，查看 PM2 日志里的后端错误。
