# Eval Bar AI 运维手册

## 1. 生产事实

- 线上地址：`http://14.103.45.4:3000/`
- 主机：`root@14.103.45.4`
- 目录：`/root/bar-raiser-ai-new/bar-raiser-ai`
- PM2 进程：`bar-raiser-ai`
- 启动命令：`npm start`
- 运行要求：Node.js ≥ 22

完整部署步骤见项目根 [DEPLOYMENT.md](../DEPLOYMENT.md)。本文聚焦冒烟、数据保护和故障定位。

## 2. 发布前检查

本地：

```bash
git fetch origin
git status -sb
git log --oneline --left-right main...origin/main
npm install
npm test
npm run build
```

确认：

- 部署来源是明确的本地 `main` 提交。
- 没有把 `.env*`、`data/`、候选人材料或原型文件纳入提交。
- 24 个现有自动化测试全部通过；新增测试后以实际总数为准。
- 生产构建成功。Tailwind CDN 和大 chunk 是当前已知警告，不等于构建失败。

## 3. 数据备份

Candidate 功能同时依赖 SQLite 与 `data/uploads/resumes/`。只备份 `app.db` 会丢失源文件，完整发布前应备份整个 `data/`：

```bash
cd /root/bar-raiser-ai-new/bar-raiser-ai
umask 077
mkdir -p /root/bar-raiser-ai-backups
cp -a data "/root/bar-raiser-ai-backups/data-before-$(date +%Y%m%d-%H%M%S)"
```

备份目录应为 root-only，不进入 Web 目录或 Git。恢复属于数据覆盖操作，必须单独确认后执行。

## 4. 发布后冒烟

### 4.1 版本与进程

```bash
cd /root/bar-raiser-ai-new/bar-raiser-ai
git rev-parse --short HEAD
git status -sb
pm2 status bar-raiser-ai
```

PM2 必须为 `online`。服务器可能因本地 Bundle 尚未推 GitHub而显示 `main...origin/main [ahead N]`；这不是脏工作区，必须根据 GitHub 真实状态解释。

### 4.2 HTTP 与静态资源

```bash
curl -sS -o /dev/null -w 'home=%{http_code}\n' http://127.0.0.1:3000/
curl -sS -o /dev/null -w 'auth=%{http_code}\n' 'http://127.0.0.1:3000/api/reports?analysisMode=candidate'
curl -sS -L http://127.0.0.1:3000/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
```

预期：首页 `200`，未认证报告接口 `401`，HTML 指向本次构建的新 asset。

### 4.3 数据结构

只检查表名和列名，不展开报告、用户或附件内容：

```bash
node --input-type=module -e '
import { db } from "./services/db.js";
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = '\''table'\'' AND name IN ('\''candidate_system_prompt'\', '\''report_attachments'\') ORDER BY name").all();
const columns = db.prepare("PRAGMA table_info(reports)").all()
  .map((row) => row.name)
  .filter((name) => ["analysis_mode", "job_description", "resume_text"].includes(name));
console.log(JSON.stringify({ tables: tables.map((row) => row.name), columns }));
'
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

历史日志可能包含旧错误。判断本次发布是否异常时，应结合 PM2 重启时间、最新 PID 和日志时间，不把无时间戳的旧行直接当作当前故障。

## 6. 常见故障

### GitHub 拉取卡住

停止重复重试，使用 [DEPLOYMENT.md](../DEPLOYMENT.md) 的 Bundle 路径。Bundle 来自本地 `main` 时抓取 `main`；只有 Bundle 实际暴露 `refs/remotes/origin/main` 时才抓取该 ref。

### 页面仍是旧版本

依次检查：

1. 服务器 `HEAD` 是否为目标提交。
2. `npm run build` 是否成功。
3. HTML 中的 asset hash 是否变化。
4. PM2 是否重启并指向当前目录。

### Candidate 接口返回 400

检查 `analysisMode`、`jobTitle`、`transcript` 和 `resumeParseStatus`。有文件时还要检查 10 MB 限制、MIME、扩展名和文件签名。

### 简历下载 404

报告仍可查看。检查附件元数据是否存在、磁盘文件是否存在、请求用户是否为所有者或管理员。禁止直接把磁盘路径暴露给客户端。

### AI 请求失败

检查 PM2 日志中的错误类型，再由有权限的人核对 `.env` 中的 Provider、模型和 Key。不要打印或复制配置值。AI 失败不应创建报告或源文件。

## 7. 回滚边界

代码回滚、数据库恢复、删除报告/附件、清理备份和修改 `.env` 都是高风险操作，必须先确认具体目标。新增 schema 对旧代码是向后兼容的，但恢复旧数据库会丢失 Candidate 报告和附件关联，不能只恢复单个 `app.db` 而忽略上传目录。
