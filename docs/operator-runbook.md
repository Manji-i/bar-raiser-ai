# Eval Bar AI 运维手册

## 录音上传迭代

录音功能涉及平台对应 ffmpeg 二进制、短时媒体 URL 日志过滤、单实例任务调度和 material_jobs 表。发布前按 [录音运维清单](audio-minutes-operations.md) 完成专用 ASR 配置与真实服务联调。飞书妙记首版不启用。

## 1. 生产事实

- 线上地址：`https://evalbar.cn/`
- 运维入口：`evalbar-admin@14.103.45.4`，仅允许公钥登录；管理项目和 root PM2 前执行 `sudo -i`
- 目录：`/root/bar-raiser-ai-new/bar-raiser-ai`
- PM2 进程：`bar-raiser-ai`
- 启动命令：`npm start`
- 运行要求：Node.js ≥ 22

完整部署步骤见项目根 [DEPLOYMENT.md](../DEPLOYMENT.md)。本文聚焦冒烟、数据保护和故障定位。

生产 SSH 禁止密码认证和 root 直接登录。修改 SSH 配置时必须先用新的 `evalbar-admin` 会话验证 `sudo -n true`，再运行 `sshd -t` 和 reload；reload 后另开会话复验，不能依赖已有连接。

## 2. 发布前检查

本地：

```bash
git fetch origin
git status -sb
git log --oneline --left-right main...origin/main
npm ci
npm test
npm run build
```

确认：

- 部署来源是明确的本地 `main` 提交。
- 没有把 `.env*`、`data/`、候选人材料或原型文件纳入提交。
- 全量自动化测试全部通过，以本次 `npm test` 的实际总数为准。
- 生产构建成功。Tailwind 和 Inter 已进入本地构建；大 chunk 和 Vite 对 `.env` 中 `NODE_ENV=production` 的提示是当前已知警告，不等于构建失败；不要在 `.env` 中设置该值。
- 构建在本地或 CI 完成并生成待发布的 `dist/`；1.9 GB、无 swap 的生产主机不得执行 `npm run build`。

## 3. 数据备份

Candidate 功能同时依赖 SQLite 与 `data/uploads/resumes/`。只备份 `app.db` 会丢失源文件，完整发布前应备份整个 `data/`：

```bash
cd /root/bar-raiser-ai-new/bar-raiser-ai
umask 077
mkdir -p /root/bar-raiser-ai-backups
deploy_backup_dir="/root/bar-raiser-ai-backups/data-before-$(date +%Y%m%d-%H%M%S)"
cp -a data "$deploy_backup_dir"
chmod -R go-rwx "$deploy_backup_dir"
```

备份目录应为 root-only，不进入 Web 目录或 Git。恢复属于数据覆盖操作，必须单独确认后执行。

生产应用在 `0077` umask 下运行。每次发布后检查 `.env*`、`data/app.db*`、`data/uploads/` 和 `/root/.pm2/dump.pm2`：文件只允许所有者读写（`0600`），目录只允许所有者进入（`0700`）。同时以 `www-data` 执行只读探测，以上内容必须返回拒绝访问。

## 4. 发布后冒烟

### 4.1 版本与进程

```bash
cd /root/bar-raiser-ai-new/bar-raiser-ai
git rev-parse --short HEAD
git status -sb
pm2 status bar-raiser-ai
```

PM2 必须为 `online`。服务器可能因本地 Bundle 尚未推 GitHub 而显示 `main...origin/main [ahead N]`；这不是脏工作区，必须根据 GitHub 真实状态解释。

### 4.2 HTTP 与静态资源

```bash
curl -sS -o /dev/null -w 'home=%{http_code}\n' http://127.0.0.1:3000/
curl -sS -o /dev/null -w 'auth=%{http_code}\n' 'http://127.0.0.1:3000/api/reports?analysisMode=candidate'
curl -sS -L http://127.0.0.1:3000/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
pdf_worker_path="$(find dist/assets -maxdepth 1 -name 'reportPdf.worker-*.js' -print -quit | sed 's#^dist##')"
test -n "$pdf_worker_path"
curl -sS -o /dev/null -w 'pdf_worker=%{http_code}\n' "http://127.0.0.1:3000$pdf_worker_path"
curl -sS -o /dev/null -w 'font_regular=%{http_code}\n' http://127.0.0.1:3000/fonts/NotoSansSC-Regular-v1.otf
curl -sS -o /dev/null -w 'font_bold=%{http_code}\n' http://127.0.0.1:3000/fonts/NotoSansSC-Bold-v1.otf
```

预期：首页、PDF Worker 和两份字体均为 `200`，未认证报告接口为 `401`，HTML 指向本次构建的新 asset。

服务器本机执行 `ss -ltnp | grep ':3000'` 时，Node 必须只监听 `127.0.0.1:3000`。外部检查 `evalbar.cn:3000` 和服务器 IP `:3000` 必须拒绝连接或超时；若返回应用页面，发布不能验收。

### 4.3 数据结构

只检查表名和列名，不展开报告、用户或附件内容：

```bash
node --input-type=module <<'NODE'
import { db } from "./services/db.js";
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('candidate_system_prompt', 'report_attachments') ORDER BY name").all();
const columns = db.prepare("PRAGMA table_info(reports)").all()
  .map((row) => row.name)
  .filter((name) => ["analysis_mode", "job_description", "resume_text"].includes(name));
console.log(JSON.stringify({ tables: tables.map((row) => row.name), columns }));
NODE
```

预期存在两张新表和三个 reports 新列。

### 4.4 页面

用真实浏览器检查：

- 首页出现“提升自己”和“判断他人”。
- Candidate 入口先进入对应介绍区，CTA 再进入登录。
- 未登录直接访问 `/app/candidate` 会被保护。
- 浏览器控制台没有新的运行错误。

不要在生产冒烟中上传真实候选人材料。真实 AI 请求、账号创建和报告删除会产生数据或费用，必须使用已批准的合成测试方案。

## 5. 日志

```bash
pm2 logs bar-raiser-ai --lines 50 --nostream
```

允许记录启动状态、AI Provider 名称和错误类型；不得记录 token、API Key、面试原文、简历正文、原文件路径或候选人个人信息。

每个真正进入模型调用的分析会在结束时写一条 `event=analysis_completed` 的 JSON 日志，字段为 `analysisId`、`analysisMode`、`provider`、`model`、`status`、`durationMs`、`inputChars`、`outputChars` 和 `errorCode`。统计生成时间时只筛选该事件；`status=success` 表示报告已持久化，`failure` 表示失败，`cancelled` 表示客户端提前断开。日志不包含用户 ID 或候选人材料。

```bash
pm2 logs bar-raiser-ai --lines 1000 --nostream \
  | grep '"event":"analysis_completed"'
```

历史报告没有生成开始时间，不能从 `reports.created_at` 反推真实耗时。上线该日志后，平均耗时使用成功记录的 `durationMs` 计算，并同时观察 P50、P90、最大值和失败率，避免平均数掩盖长尾。

经明确授权执行 Provider 对比时，`scripts/generate-provider-comparison.mjs` 会记录 `event=provider_comparison_completed`，字段仅包含源报告 ID、Provider、模型、新报告 ID、状态、`durationMs`、输入/输出字符数和错误码。脚本不会记录职位、能力要求、逐字稿、Prompt、报告正文或 Key：

```bash
node scripts/generate-provider-comparison.mjs --execute --providers=glm,kimi
```

该命令会产生真实模型费用并新增两份报告；没有 `--execute` 时必须失败关闭。新报告的文件名会附加 `GLM 5.2` 或 `Kimi K3`，便于在管理后台区分。

历史日志可能包含旧错误。判断本次发布是否异常时，应结合 PM2 重启时间、最新 PID 和日志时间，不把无时间戳的旧行直接当作当前故障。

## 6. 常见故障

### GitHub 拉取卡住

停止重复重试，使用 [DEPLOYMENT.md](../DEPLOYMENT.md) 的 Bundle 路径。Bundle 来自本地 `main` 时抓取 `main`；只有 Bundle 实际暴露 `refs/remotes/origin/main` 时才抓取该 ref。

### 页面仍是旧版本

依次检查：

1. 服务器 `HEAD` 是否为目标提交。
2. 本地或 CI 的 `npm run build` 是否成功，上传压缩包的 SHA-256 是否一致。
3. 服务器 `dist/` 是否已原子替换，HTML 中的 asset hash 是否变化。
4. PM2 是否重启并指向当前目录。

### 生产机误启动构建后资源耗尽

不要在生产机重试构建。只终止本次发布启动的构建进程，确认原 PM2 服务仍可返回首页 `200`，然后按 [DEPLOYMENT.md](../DEPLOYMENT.md) 上传本地已验证的 `dist/`。如果 SSH 或 HTTP 尚未恢复，等待资源释放后再做只读检查，不重启整台服务器。

### Candidate 接口返回 400

检查 `analysisMode`、`jobTitle`、`transcript` 和 `resumeParseStatus`。有文件时还要检查 10 MB 限制、MIME、扩展名和文件签名。

### 简历下载 404

报告仍可查看。检查附件元数据是否存在、磁盘文件是否存在、请求用户是否为所有者或管理员。禁止直接把磁盘路径暴露给客户端。

### AI 请求失败

检查 PM2 日志中的错误类型，再由有权限的人核对 `.env` 中的 Provider、模型和 Key。不要打印或复制配置值。AI 失败不应创建报告或源文件。

当前 OpenAI 兼容 Provider 的切换值与默认模型为：

- `AI_PROVIDER=doubao`：`doubao-seed-2-1-pro-260628`
- `AI_PROVIDER=deepseek`：`deepseek-v4-flash`
- `AI_PROVIDER=glm`：`glm-5.2`，`GLM_REASONING_EFFORT=max`
- `AI_PROVIDER=kimi`：`kimi-k3`，`KIMI_REASONING_EFFORT=max`

Doubao、GLM 与 Kimi 都使用服务端流式接收并聚合最终正文，忽略模型思考内容；浏览器仍等待完整报告。默认 SDK 超时为 600 秒，自动重试为 0，避免失败时重复计费。GLM 的默认 Base URL 是 `https://open.bigmodel.cn/api/paas/v4`，Kimi 开放平台默认 Base URL 是 `https://api.moonshot.cn/v1`。

### 分析返回 504

先区分两类 504：Nginx access/error log 在约 60 秒出现 `upstream timed out`，通常说明 `/api/analyze` 未命中 660 秒专用代理超时；PM2 结构化日志出现 `AI_UPSTREAM_TIMEOUT`，说明应用已等待模型 600 秒仍未完成。前者检查 `nginx -T` 中 `/api/analyze` 的 `proxy_read_timeout`，后者检查当前 Provider 状态与请求规模。不要通过无限放大超时掩盖持续的模型异常。

客户端断开会取消仍在途的模型请求，但并发锁要等上游 Promise 结束后才释放。看到 `AI_REQUEST_CANCELLED` 时应先判断用户刷新、关闭页面或网络中断，不当作模型 504。

### 接口返回 429

- `RATE_LIMITED`：当前 IP 或用户已达到固定窗口额度，响应中的 `Retry-After` 表示最少等待秒数。不要通过重启 PM2 绕过额度。
- `ANALYSIS_IN_PROGRESS`：同一用户已有分析在途，等待原请求完成或断开后重试。

当前限流状态保存在单个 Node.js 进程内存中，正常重启会清空。若生产改为 PM2 cluster 或多实例部署，发布前必须将额度和并发锁迁移到共享存储并补充跨实例验收。

## 7. 回滚边界

代码回滚、数据库恢复、删除报告/附件、清理备份和修改 `.env` 都是高风险操作，必须先确认具体目标。新增 schema 对旧代码是向后兼容的，但恢复旧数据库会丢失 Candidate 报告和附件关联，不能只恢复单个 `app.db` 而忽略上传目录。
