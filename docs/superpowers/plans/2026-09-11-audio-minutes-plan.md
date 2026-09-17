# 录音与飞书妙记导入实施计划

## 任务清单

| Task | 主要工作 | 依赖 |
|---|---|---|
| 1 | 飞书 OAuth、逐字稿和契约测试 | 官方接口 |
| 2 | 音频、任务、ASR 与 HTTP 集成 | 1、服务契约 |
| 3 | 共享前端与双模式集成 | 2 |
| 4 | 独立规格/质量审查、完整验证 | 1–3 |
| 5 | 真实联调、部署、GitHub 同步 | 配置和 4 |

执行方式：subagent-driven-development。主代理负责契约、集成与验收，子代理负责独立模块和审查。

**目标：** 上传音频或飞书链接，确认逐字稿后进入既有分析。
**架构：** 共享导入组件、SQLite 材料任务、云端 ASR 与飞书用户授权。
**技术栈：** React、TypeScript、Express、Node SQLite、原生 fetch。

### Task 1：飞书

新增 services/feishuMinutes.js 和 tests/feishuMinutes.test.mjs。
- [x] 先测试 URL、SRT、错误映射、state/nonce 重放/过期/会话隔离，确认模块缺失失败。
- [x] 实现纯解析器和可注入 fetch/clock 服务工厂；不导入真实数据库或凭证。
- [x] `node --test tests/feishuMinutes.test.mjs` 通过后依次做规格和质量审查。

### Task 2：材料

新增 services/materialJobs.js、materialAudio.js、materialRoutes.js；修改 schema.js、server.js、analysisRequest.js；新增对应测试。
- [x] 内存 SQLite 与临时目录覆盖用户隔离、状态转换、分块幂等和超限。
- [x] 实现 4 MiB 分块、500 MiB 总限额、随机路径、时长核验和到期清理。
- [x] 按官方契约实现 ASR 提交/查询、结果规范化、有界队列与重启恢复。
- [x] 按规格接入所有认证接口，供应商只使用短时授权文件地址。
- [x] 分析前校验材料归属及已确认稿，成功关联报告。
- [x] `node --test tests/material*.test.mjs` 通过并完成审查。

### Task 3：前端

新增 RecordingImport.tsx、materialClient.ts；修改两套 FileUpload、types.ts、geminiService.ts、App.tsx。
- [x] 实现请求契约测试；新增 UI 使用现有 Button/Input/Card。
- [x] 实现分块进度、任务恢复、失败重试和 OAuth 新窗口连接。
- [x] 展示片段、角色和修订文本；确认后回填 materialId。
- [x] 处理卸载、账号切换、替换文件与过期；修复中文按空格计数的校验。
- [ ] 类型检查及双模式页面验收。

### Task 4：验证

- [x] 独立规格和质量审查，无未修复高影响问题。
- [ ] `npm test`、`npx tsc --noEmit`、`npm run build`。
- [x] 隔离 HTTP/浏览器验证成功、权限拒绝、未配置、失败恢复和双模式。
- [x] 在 docs/audio-minutes-verification.md 分开记录模拟与真实结果。

### Task 5：发布

- [x] 更新架构、接口、运维和交接文档，生成准确配置清单。
- [ ] 用户配置专用 ASR/飞书应用后完成真实合成材料联调。
- [ ] 本地构建、生产备份、Bundle 快进、产物校验和原子替换，重启目标进程。
- [ ] 线上健康、资源 hash 和实际功能验收通过后推送 GitHub main。

## 当前执行结果（2026-09-15）

本地 172 项测试、生产构建和 6 个模拟 API 浏览器场景通过；类型检查与生产基线同样存在原有 PDF 错误，无新增错误。配置清单和验证边界见 `docs/audio-minutes-operations.md`、`docs/audio-minutes-verification.md`。真实语音、飞书 OAuth 和生产发布仍等待专用服务配置；开发分支可推送供审阅，main 尚不合并。
