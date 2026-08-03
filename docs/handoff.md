# Eval Bar AI 当前交接状态

## 当前部署检查点

截至 2026-08-03 本次文档同步前，GitHub `origin/main` 为提交 `6e81b57`（`docs: document PDF export server footprint`），生产服务器代码为 `d97c450`（`docs: record text PDF production deployment`）；两者都包含首个文字型 PDF 生产代码提交 `109cb7e`。`6e81b57` 只更新文档，未再次部署，不影响线上功能版本。本次 `neat-freak` 同步产生的提交先保留在本地，推送或部署后再更新远端检查点。服务器直连 GitHub 不稳定，代码发布继续使用 Bundle 路径。

- 线上地址：`http://14.103.45.4:3000/`
- 生产目录：`/root/bar-raiser-ai-new/bar-raiser-ai`
- PM2 进程：`bar-raiser-ai`，状态 `online`
- 当前首页资源：`/assets/index-BYxbUDod.js`
- 2026-08-03 完整数据备份：`/root/bar-raiser-ai-backups/data-before-20260803-162514`
- 2026-08-03 静态资源备份：`/root/bar-raiser-ai-backups/dist-before-20260803-163237`
- 分支与 worktree：仅保留 `main`；已完成的功能分支和对应 worktree 已删除

合并后的 `main` 在本地完成 55 项自动化测试、生产构建和 12 页 PDF 校验；生产服务器完成 `npm ci` 和 55 项测试。服务器因 1.9 GB 内存且无 swap，不再承担本次 Vite 构建，改为发布本地已验证的 `dist/`。发布后 PM2 为 `online`，首页返回 `200`，未认证报告接口返回 `401`，主资源、PDF Worker 和两份字体均返回 `200`。

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

## 安全边界

普通用户报告和简历的所有权由服务端校验，管理员能力也由服务端 `isAdmin` 校验。但当前角色锁定仍是客户端产品约束：登录/注册 API 不保存角色，token 也没有绑定角色；同一账号可以修改浏览器存储或直接构造 API 请求访问本人另一模式的数据。

服务端 token 绑定角色、密码哈希、token 过期、登录限流、管理员初始化和前端第三方依赖等风险统一在[未来需迭代内容](未来需迭代内容.md)维护。

## 尚未完成的生产验证

- 未创建合成生产账号并发起真实 Gemini / Doubao 分析请求。
- 未使用两个合成账号验证跨账号简历下载一定被拒绝。
- 未创建并删除合成 Candidate 报告验证附件物理清理。

这些步骤会产生生产数据、模型费用或删除操作，执行前必须单独确认测试账号、合成材料和清理范围。

## 当前技术债

- `npm audit` 仍报告 2 个 high，均来自 React Router 的 RSC Action CSRF 公告 `GHSA-qwww-vcr4-c8h2`；当前应用使用 `BrowserRouter`，未使用 RSC API，因此现有架构不受该攻击路径影响。继续按风险登记跟踪，不运行破坏性的自动修复。
- Tailwind 和网页 Inter 字体仍依赖第三方 CDN；PDF 导出已移除 `html2pdf` CDN，PDF Worker 与 Noto Sans SC 字体已自托管；尚未建立严格 CSP，静态资源也尚未配置长期缓存。
- Vite 构建仍提示主 bundle 超过默认 500 kB；Tailwind CDN 和错误设置 `NODE_ENV=production` 也会产生已知提示。
- 生产服务器只有 1.9 GB 内存且没有 swap，直接执行 Vite 构建会耗尽资源；后续发布必须在本地或 CI 完成构建并上传已验证的 `dist/`。只有扩容或增加 swap 并重新验证后，才可调整该规则。
- 简历首版没有 OCR、病毒扫描或自动重解析。

## 下一步优先级

1. 用户量、企业客户或合规要求上升前，把角色升级为服务端 token 绑定并同步修复认证风险。
2. 用获批的合成账号完成真实 AI、跨账号附件权限和删除清理三项生产验收。
3. 将第三方前端运行时依赖纳入构建，增加 CSP，并拆分大 bundle。
4. 持续跟踪 React Router 公告；采用 RSC 前或官方提供兼容修复后重新评估升级。

## 权威文档

- [架构说明](architecture.md)
- [接口接入指南](integration-guide.md)
- [运维手册](operator-runbook.md)
- [部署指南](../DEPLOYMENT.md)
- [未来需迭代内容](未来需迭代内容.md)
- [登录角色锁定设计](superpowers/specs/2026-07-28-login-role-lock-and-ux-polish-design.md)
- [候选人模式设计规格](superpowers/specs/2026-07-27-candidate-interview-coaching-design.md)
