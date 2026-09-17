# 录音上传首版收敛实施计划

| Task | 主要工作 | 依赖 |
|---|---|---|
| 1 | 关闭飞书 HTTP 入口并回归音频权限 | 现有材料路由 |
| 2 | 工作台只展示录音上传和逐字稿确认 | Task 1 API 契约 |
| 3 | 更新文档、完整测试和部署门槛 | Task 1–2 |

> **For agentic workers:** 在现有隔离工作树内按任务逐项执行并验证；本轮采用 inline execution，用户已指定首版范围。

**Goal:** 所有已登录用户在两种模式下都可使用录音导入，首版不提供飞书妙记。

**Architecture:** 保持材料任务和音频 ASR 管道。飞书服务代码保留但路由默认不注册，前端只展示录音。配置缺失时继续保留文本输入路径。

**Tech Stack:** React、TypeScript、Express、SQLite、Node.js。

---

### Task 1：后端停止公开飞书

**Files:** `services/materialRoutes.js`、`server.js`、`tests/materialRoutes.test.mjs`。

- [x] 先增加 HTTP 测试：有合成飞书配置时，`GET /api/integrations/feishu/callback`、`POST /api/integrations/feishu/connect`、`POST /api/materials/feishu` 返回 404；`GET /api/materials/capabilities` 只有 audio 能力。运行 `node --test tests/materialRoutes.test.mjs` 验证新断言失败。
- [x] 在路由工厂增加默认关闭的 `enableFeishu=false`；仅明确测试注入 `true` 时才挂载旧路径。生产 `server.js` 使用默认值；旧飞书模块保持隔离，防止误配时开放。
- [x] 运行 `node --test tests/materialRoutes.test.mjs`，旧飞书契约测试显式开启测试标志，检查全部通过。

### Task 2：两种模式只展示录音

**Files:** `components/RecordingImport.tsx`、`components/CandidateFileUpload.tsx`、`components/FileUpload.tsx`、`services/materialClient.ts`、`scripts/verify-recording-ui.mjs`、客户端相关测试。

- [x] 先把浏览器脚本改为断言候选人、招聘方页面没有“飞书妙记”、没有飞书链接输入；运行脚本确认现版失败。
- [x] 将 `RecordingImport` 收敛为单一音频来源：保留上传进度、失败重试、试听、角色与确认稿；移除浏览器 OAuth 交互和入口。父页面标签改为“上传录音”，`materialClient` 的能力类型只保留 audio。
- [x] 浏览器两种模式上传和确认稿流程、编辑后重新确认、未配置服务的文字回退均通过。

### Task 3：文档和总验收

**Files:** `AGENTS.md`、`docs/audio-minutes-operations.md`、`docs/audio-minutes-verification.md`、相关架构与接口说明。

- [x] 明确首版仅音频、所有已登录用户、飞书后续未启用；记录 ASR 是生产启用的唯一外部服务门槛。
- [x] `npm test && npm run build`；比较 `npx tsc --noEmit` 与既有 PDF 类型错误基线，不引入本轮新错误。运行本地 HTTP 与浏览器测试。
- [ ] 按已授权的 GitHub 流程推送当前开发分支。只有 ASR 安全配置和真实联调完成后才将其部署生产。
