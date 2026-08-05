# Eval Bar AI 当前交接状态

## 当前部署检查点

截至 2026-08-05，PDF 冷启动导出修复已合并到 `main`、推送 GitHub，并通过 Bundle 与本地构建产物部署生产。生产服务器仍为 1.9 GB 且无 swap，后续继续禁止在生产机构建。

- 线上地址：`https://evalbar.cn/`；Node 的 `127.0.0.1:3000` 仅供本机 Nginx 反代。
- 生产目录：`/root/bar-raiser-ai-new/bar-raiser-ai`
- PM2 进程：`bar-raiser-ai`，状态 `online`
- 当前生产代码：`55921f7020d1c9a4cc07e2c3a0d526ed1bab4574`
- 当前首页资源：`/assets/index-HWNnjYkV.js`、`/assets/index-DZT1nRDZ.css`
- 2026-08-05 PDF 修复前完整数据备份：`/root/bar-raiser-ai-backups/data-before-20260805-161503`
- 2026-08-05 PDF 修复前静态资源备份：`/root/bar-raiser-ai-backups/dist-before-20260805-161541`
- 2026-08-05 完整数据备份：`/root/bar-raiser-ai-backups/data-before-20260805-154223`
- 2026-08-05 静态资源备份：`/root/bar-raiser-ai-backups/dist-before-20260805-154333`
- 2026-08-05 Nginx 配置备份：`/root/bar-raiser-ai-backups/evalbar.nginx-before-20260805-154321`

安全版本在本地和生产分别完成 86 项测试；生产外部验收确认 HTTPS 200、HTTP 301、Node 仅监听回环地址、公网 3000 拒绝连接、安全响应头生效、恶意 Origin 被拒绝，且线上 `dist` 与本地验证产物的全文件清单哈希一致。

## 已交付能力

- 登录和注册时选择“提升自己 / 判断他人”，按钮文案保持“登录 / 注册”；登录后产品内不能切换角色。
- `/app`、`/history`、显式模式路由、首页入口和报告详情统一服从 `AuthContext.analysisMode`，历史列表只展示当前角色报告。
- Candidate“提升自己”支持职位名称、选填 JD、选填简历和面试记录；报告不打招聘分，聚焦少数核心问题。
- Recruiter“判断他人”保留胜任力、STAR、人岗匹配评分和招聘建议。
- Candidate“本场表现结论”由 `candidate-conclusion-v2` 契约固定为“一句话总结 / 本场重点 / 下次准备”三个独立段落；旧数据库 Prompt 在调用前动态兼容，无需迁移。
- 产品图标已改为随应用构建的 `lucide-react` 图标；Candidate 职位名称与 JD 输入区域等高。
- 首页已重构为求职者/招聘方双视角：Hero 行距与单行副标题、两个模式介绍区统一左对齐布局、核心能力按角色分组面板展示、脱敏报告示例支持"求职者复盘 / 招聘方评估"切换；站点 favicon（`public/favicon.svg`）与标签页标题统一为 Eval Bar AI 品牌。
- 简历支持 PDF、DOCX、TXT，最大 10 MB；低质量解析文本不会直接进入模型，源文件通过受保护接口下载。

## 2026-08-03 已发布：文字型 PDF 导出

浏览器端文字型 PDF 导出已合并到 `main`、推送 GitHub 并部署生产，首个生产发布提交为 `109cb7e`。

- 用户点击“导出 PDF”后由隐藏的 `<a download>` 直接下载，不打开打印或系统存储窗口。
- 网页和 PDF 共用 `ReportDocumentModel`；Candidate 与 Recruiter 保持各自内容语义。
- `pdfmake` 在独立 Web Worker 中排版，报告页空闲时预生成并缓存 Blob；字体自托管且单次生成只加载一次。
- 旧 `html2pdf/html2canvas` CDN、整页截图导出和系统打印路径已经移除。
- 匿名真实长度夹具验证结果：Recruiter 4 页、Candidate 2 页、超长连续段落 6 页；12 页逐页检查均未发现截字、重叠、缺字或孤立标题。
- 冷缓存 Blob ready 中位数 890.6 ms，热缓存 284.5 ms，Blob ready 后点击触发下载中位数 0.3 ms；主线程未观察到超过 50 ms 的长任务。
- 当前 Chromium 不提供包含 Worker 的精确峰值内存数据，因此没有把 Worker 峰值内存写成已确认结论。

完整验证数据见[客户端文字型 PDF 导出验证记录](superpowers/verification/2026-08-03-client-side-text-pdf-export.md)。

## 2026-08-05 已发布：PDF 冷启动导出稳定性修复

- 根因是生产网络首次下载两份中文字体分别约需 15–22 秒，而 PDF Worker 原先在 15 秒固定终止；HTTPS、安全响应头和 Worker 加载本身均正常。
- PDF Worker 的准备与探针超时统一调整为 60 秒；报告页仍在后台预生成 Blob，用户交互仍是点击后直接下载。
- 带内容哈希的 `/assets/*` 与版本化中文字体改为一年 `immutable` 缓存；`index.html` 不强缓存，避免版本更新后继续加载旧入口。
- 本地和生产均通过 88 项测试；本地生产构建成功，生产机未执行构建。
- 线上首页、主资源、Worker 和两份字体均返回 `200`，字体与主资源缓存头生效，PM2 在线；已登录报告页实际点击生成了 6 页 A4 有效 PDF，无失败弹窗。

完整诊断和发布证据见[PDF 冷字体超时修复验证记录](superpowers/verification/2026-08-05-pdf-cold-font-timeout.md)。

## 2026-08-05 已发布：安全加固

- Node 默认只监听 `127.0.0.1`；公开入口文档统一为 `https://evalbar.cn`。
- 新密码使用 scrypt；历史 SHA-256 只读兼容且不改写。新 Token 仅存摘要、12 小时绝对过期；浏览器改用 HttpOnly/SameSite Cookie，不再把 Token 放入 `localStorage`。
- 首用户不再自动成为管理员；管理员初始化只允许空 users 表，本轮未在现有数据上执行。
- 注册、登录、集成 Token、反馈和分析增加进程内窗口额度；AI 增加用户小时/每日额度和单用户并发限制。
- JSON、模型输入和 multipart 增加固定预算；超字段、超 200 KB 字段和超 10 MB 文件隔离请求均返回 `413`。
- 反馈使用严格 Schema；历史异常反馈只在读取时安全归一化，数据库原值不变。
- 两种 Prompt 增加不可信输入契约和输出校验；报告禁用 Markdown 图片、原始 HTML 和危险链接协议。
- 移除宽松 CORS、Tailwind CDN、Google Fonts 和 import map；Tailwind/Inter 进入本地构建，并增加 CSP、HSTS、frame、MIME、Referrer、Permissions Policy。
- 未知 `/api/*` 返回 JSON `404`，注册冲突不再暴露用户名或邮箱字段。

完整提交、测试、隔离回归、残余风险和生产验收见[安全加固验证台账](superpowers/verification/2026-08-05-security-hardening.md)。

## 安全边界

普通用户报告和简历的所有权由服务端校验，管理员能力由服务端 `isAdmin` 校验。角色锁定仍是客户端产品约束：登录/注册 API 不保存角色，Token 也没有绑定角色；同一账号可以直接构造 API 请求访问本人另一模式的数据。这不是跨账号越权，但若未来要求 Candidate/Recruiter 服务端强隔离，仍需升级 Token 角色绑定。

Prompt Injection 只能分层缓解；历史 SHA-256 密码哈希按“不改现有数据”要求保留；限流状态当前只在单个 Node 进程内。这三项是明确残余风险，不得写成彻底关闭。

## 尚未完成的授权型生产验证

- 未验证旧会话失效、原账号重新登录、Cookie 属性和正常小文件上传。
- 未创建合成生产账号并发起真实 Gemini / Doubao 分析请求。
- 未使用两个合成账号验证跨账号简历下载一定被拒绝。
- 未创建并删除合成 Candidate 报告验证附件物理清理。

这些步骤会产生生产数据、模型费用或删除操作，执行前必须单独确认测试账号、合成材料和清理范围。

## 当前技术债

- `npm audit` 仍报告 2 个 high，均来自 React Router RSC Action 公告 `GHSA-qwww-vcr4-c8h2`；当前只使用 `BrowserRouter`，未使用 RSC/Action API。npm 当前最新 `react-router-dom` 为 7.18.2，官方修复标记为尚不可用的 8.3.0；继续观察，不运行 `npm audit fix --force`。
- Vite 构建仍提示主 bundle 超过默认 500 kB；环境模板中的 `NODE_ENV=production` 仍产生已知提示。
- 生产服务器只有 1.9 GB 内存且没有 swap，直接执行 Vite 构建会耗尽资源；后续发布必须在本地或 CI 完成构建并上传已验证的 `dist/`。只有扩容或增加 swap 并重新验证后，才可调整该规则。
- 简历首版没有 OCR、病毒扫描或自动重解析。

## 下一步优先级

1. 使用获批测试账号验证旧会话失效、重新登录、Cookie 属性和正常页面/小文件上传；不得在现有库运行 `admin:bootstrap`。
2. 真实 AI、注册、反馈、报告创建/删除和跨账号附件测试继续单独申请数据与费用授权。
3. 在云控制台持续确认安全组只开放 22/80/443；虽然应用已仅监听回环地址，仍建议增加网络层纵深防御。
4. 多实例部署前迁移共享限流；未来获批时处理历史密码迁移和服务端角色绑定；持续跟踪 React Router 公告。

## 权威文档

- [架构说明](architecture.md)
- [接口接入指南](integration-guide.md)
- [运维手册](operator-runbook.md)
- [部署指南](../DEPLOYMENT.md)
- [未来需迭代内容](未来需迭代内容.md)
- [登录角色锁定设计](superpowers/specs/2026-07-28-login-role-lock-and-ux-polish-design.md)
- [候选人模式设计规格](superpowers/specs/2026-07-27-candidate-interview-coaching-design.md)
