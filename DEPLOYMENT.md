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
git fetch origin
git pull --ff-only origin main
npm install
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

适用于服务器拉 GitHub 失败或卡住的情况。在本机项目目录执行：

```bash
git status -sb
git push origin main
git bundle create /private/tmp/bar-raiser-ai-main.bundle origin/main
scp /private/tmp/bar-raiser-ai-main.bundle root@14.103.45.4:/tmp/bar-raiser-ai-main.bundle
```

然后在服务器执行：

```bash
cd /root/bar-raiser-ai-new/bar-raiser-ai
git fetch /tmp/bar-raiser-ai-main.bundle refs/remotes/origin/main
git merge --ff-only FETCH_HEAD
git update-ref refs/remotes/origin/main HEAD
npm install
npm run build
pm2 restart bar-raiser-ai --update-env
pm2 save
```

验证线上资源是否更新：

```bash
curl -sS -L http://14.103.45.4:3000/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
```

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

## 直接部署

```bash
npm install
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
- `feedback` 表：用户反馈
- `system_prompt` 表：系统提示词（含版本历史）

历史 JSON 文件（`users.json` 等）已被 `scripts/migrate-to-sqlite.mjs` 迁移并备份为 `*.migrated.bak`。

这些数据可能包含用户 token、候选人材料和评估结果。部署时要持久化 `data/`，不要提交真实内容。

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
