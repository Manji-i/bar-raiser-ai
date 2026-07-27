# Eval Bar AI 当前交接状态

## 当前能力

项目已具备完整双模式入口和共享分析管线：

- Candidate“提升自己”：职位名称与面试记录必填，JD、简历选填；报告不打分，默认聚焦 3 个、最多 5 个核心问题。
- Recruiter“判断他人”：保留胜任力、STAR、人岗匹配评分和招聘建议。
- 两种模式共享账号、AI Provider、存储、反馈与导出，但 Prompt、报告结构和历史列表独立。
- 简历支持 PDF、DOCX、TXT，最大 10 MB；解析质量低时允许人工补充，源文件受保护存储。
- 管理员可分别读取和更新 Candidate / Recruiter Prompt 版本。

## 已验证

2026-07-27 的功能与部署验收包括：

- `npm test`：24/24 通过。
- `npm run build`：通过。
- 桌面与 390px 移动首页无横向溢出。
- 首页双入口、Candidate CTA 登录跳转和受保护路由通过。
- 生产首页与静态资源返回 `200`，未认证 Candidate 报告接口返回 `401`。
- 生产 PM2 `bar-raiser-ai` 为 `online`。
- `candidate_system_prompt`、`report_attachments` 与 reports 新列已经在生产 schema 中存在。
- 生产代码功能检查点为 `12b5fca`，首页 asset 为 `/assets/index-Dte5Pbtw.js`。

## 尚未完成的验证

- 没有在生产环境创建合成账号并发起一次真实 AI 请求。
- 没有在生产环境用两个账号执行跨账号简历下载权限测试。
- 没有在生产环境创建后再删除合成 Candidate 报告验证文件物理清理。
- PM2 历史日志中存在旧模型/连接错误记录；本次重启后只确认服务在线和页面可用，未用真实模型请求验证当前 Provider 配置。

这些验证会产生生产数据、模型费用或删除操作，执行前应单独批准测试账号、合成材料和清理范围。

## 仓库与部署状态

- 本地 `main` 和生产功能检查点已快进到 `12b5fca`。
- GitHub `origin/main` 仍停留在 `f6eb4ba`；功能尚未推送 GitHub。
- 本次知识同步会产生新的本地文档提交，但不会自动推送或重新部署。
- 生产目录存在既有未跟踪备份目录 `data.backup-20260721-230653/`，未触碰。
- 本地原工作区仍有用户自己的 `AGENTS.md`、`components/FileUpload.tsx`、`index.html` 和原型素材改动；功能合并和文档同步使用隔离 worktree，未覆盖它们。

## 已知技术债

- 生产构建会提示 Tailwind CDN 不适合生产使用。
- 主前端 bundle 超过 Vite 默认 500 kB 提示线，尚未拆包。
- `npm audit` 当前报告 17 个依赖漏洞；没有执行可能引入破坏性升级的 `npm audit fix`。
- `index.html` 仍引用不存在的 `/index.css`，构建会保留该引用；页面依靠 Tailwind CDN 正常渲染，但应在后续独立清理。
- 简历首版没有 OCR、病毒扫描或自动重解析。

## 下一步建议

1. 明确授权后把本地 `main` 推送到 GitHub，使 `origin/main` 与生产一致。
2. 使用合成账号和材料完成真实 AI、跨账号附件权限、删除清理三项生产验收。
3. 将 Tailwind 从 CDN 迁移到构建链，并删除失效的 `/index.css` 引用。
4. 对依赖漏洞做影响分析和分批升级，不直接运行全量自动修复。

## 权威文档

- [架构说明](architecture.md)
- [接口接入指南](integration-guide.md)
- [运维手册](operator-runbook.md)
- [部署指南](../DEPLOYMENT.md)
- [候选人模式设计规格](superpowers/specs/2026-07-27-candidate-interview-coaching-design.md)
