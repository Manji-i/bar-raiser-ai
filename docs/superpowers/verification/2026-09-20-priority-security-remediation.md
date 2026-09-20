# 文件权限、SSH、Multer 与录音清理加固验收

## 任务清单

| Task | 主要工作 | 结果 |
|---|---|---|
| 文件权限 | 运行时 `umask 0077`，敏感目录 `0700`、文件 `0600`，收紧生产现有文件 | 通过 |
| SSH | 新建独立运维账号，公钥与 `sudo` 验证后禁用密码和 root 直登 | 通过 |
| Multer | 精确升级至 `2.4.0`，禁用 multipart 数组索引展开并加入真实 HTTP 回归 | 通过 |
| 录音占位 | 取消后清理、30 分钟上传空闲清理、释放容量预留且保留每日次数 | 通过 |
| 发布 | GitHub `main`、本地构建产物、生产应用和权限回归 | 通过 |

## 代码与测试

- 核心修复提交：`d0e0052a2edd6b3a06f4729a2dd9aa6f00b00c51`。
- `npm test`：180 项通过，0 项失败。
- `npm run build`：成功；生产资源为 `/assets/index-CaJa9-5-.js` 和 `/assets/index-Ba3jjskP.css`。
- 本地生产进程冒烟：首页 `200`，未认证报告和材料接口 `401`，首版关闭的飞书材料接口 `404`。
- `npm audit --omit=dev` 不再报告 Multer；仍有 `react-router-dom`、`qs` 和 `@xmldom/xmldom` 共 4 个依赖项风险，留待后续升级与回归。
- `npx tsc --noEmit` 仍有 10 处既有 PDF 类型错误，位于本次未改动的 `services/pdf/*`，不影响本次 Vite 构建；该技术债不能视为已修复。

## 生产发布证据

- 发布时间：2026-09-20。
- 发布前一致性备份：`/root/bar-raiser-ai-backups/security-before-20260920-104946`。
- GitHub 与生产核心代码均为 `d0e0052a2edd6b3a06f4729a2dd9aa6f00b00c51`；生产远端引用已回读到同一提交。
- 本地与生产 `dist` 全文件清单哈希一致：`2b53a507c75787b1fa24373dddd39fea9ae1207d48bc816cd0116404f5ade48a`。
- 生产 Multer 为 `2.4.0`，PM2 进程在线，Node 只监听 `127.0.0.1:3000`。
- 外部 `https://evalbar.cn/` 返回 `200`；安全响应头、首页资源、未认证 `401` 和关闭接口 `404` 均符合预期。

## 权限与 SSH 证据

- 实际监听端口的 Node 进程 `Umask` 为 `0077`。
- 项目根和 `data/` 为 `0700`；`.env`、`.env.local`、`data/app.db` 与 `/root/.pm2/dump.pm2` 为 `0600`。
- 以 `www-data` 回读上述文件均被拒绝；`data/` 下目录和文件分别完成 `0700`、`0600` 全量检查。
- 运维入口为 `evalbar-admin@14.103.45.4`。全新会话已验证公钥登录、`sudo -n`、项目读取和 root PM2 管理。
- SSH 生效配置：`PasswordAuthentication no`、`KbdInteractiveAuthentication no`、`PermitRootLogin no`、`MaxAuthTries 3`、`X11Forwarding no`、`AllowTcpForwarding no`。
- `sshd -t` 通过，SSH 服务 reload 后新管理员会话成功；root 公钥直登与密码认证测试均被拒绝。

## 验收边界

本次没有发送真实候选人材料、没有调用真实 AI 或 ASR，也没有创建生产录音任务。录音修复通过存储层、管理器并发测试和真实 HTTP multipart 回归验证；真实 ASR 业务验收仍按 `docs/audio-minutes-operations.md` 的独立门槛执行。
