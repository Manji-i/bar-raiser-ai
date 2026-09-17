# 录音与飞书妙记导入设计

> 本设计中的飞书首版范围已由 [2026-09-17 录音上传首版范围调整](2026-09-17-audio-only-design.md) 取代；当前首版仅开放录音上传。

## 任务清单

| Task | 主要工作 | 依赖 |
|---|---|---|
| 1 | 规范、接口和存储边界 | 线上基线 988c104 |
| 2 | 飞书用户授权与逐字稿导入 | 专用应用配置 |
| 3 | 音频上传、校验、异步 ASR 和任务管理 | 语音服务配置 |
| 4 | 双模式导入、角色确认和文字修订 | 2、3 |
| 5 | 独立审查、验证和发布 | 真实联调 |

## 范围

用户于 2026-09-11 授权自行收敛需求、制定方案、实施，测试通过后部署与推送 GitHub。首版仅分析回答文字；支持音频文件与飞书妙记链接。基于线上 988c104，保留已有 Provider 和超时管理。主目录未提交文件不覆盖。专用语音服务、飞书应用及安全配置位置待用户提供；不擅自读取或修改真实密钥文件。

## 用户流程

原文档和粘贴入口保留，增加音频与妙记。导入完成后展示时间戳、说话人编号、角色映射和可编辑文字；用户确认后分析。说话人编号不能自动等同面试官或候选人。两种业务模式共用组件，任务按用户与模式隔离。

## 后端边界

音频以 4 MiB 分块上传，适配线上现有 12 MiB 请求体限制，顺序写入私有目录。最多 500 MiB、60 分钟；服务端核验格式和时长，不信任浏览器 MIME/duration。MP3/WAV/OGG 送 ASR，M4A 在受限工作进程转换后提交。语音服务独立配置，不复用 Ark 文本 Key。新增 material_jobs 表，记录上传状态、服务商任务编号、原始转写、确认稿、来源和过期时间。已提交任务重启后恢复查询；提交状态不确定不自动重复收费。

限制用户每日创建任务数、在途任务数、磁盘总量与全局工作并发。临时音频及未关联报告的任务最多保留 24 小时；关联报告保留确认文本来源元数据。文件不进入静态目录。服务商读文件使用短时随机凭证，数据库只存摘要。

飞书仅解析 HTTPS 的 feishu.cn 及子域名下 `/minutes/<24位字母数字>` 链接。不抓取用户给定 URL，只向固定官方 API 请求，禁止跟随重定向。请求原始 SRT 逐字稿，保留时间戳和发言人，文字缺失/无导出权限时明确报错，不以 AI 总结代替。

OAuth 使用 state、PKCE、短时 HttpOnly SameSite=Lax 专用 nonce Cookie，本站登录 Cookie 保持 Strict。飞书令牌按发起连接的本站会话摘要隔离，仅存内存，不保存 refresh_token；过期/登出/断开后重新连接。回调显示固定完成页，不反射 code 或 token。申请权限仅 minutes:minutes.transcript:export。

## API 契约

- GET /api/materials/capabilities → `{audio:{enabled,maxBytes,maxDurationSeconds,extensions},feishu:{enabled,connected}}`。
- POST /api/materials/audio：`{analysisMode,fileName,sizeBytes}` 创建上传任务。
- PUT /api/materials/:id/chunks/:index：原始二进制最多 4 MiB，严格顺序，同块重试幂等。
- POST /api/materials/:id/submit：完成上传校验，后台转写。
- POST /api/materials/feishu：`{analysisMode,url}` 异步导入。
- GET /api/materials?analysisMode=candidate|recruiter：最近未过期任务列表。
- GET /api/materials/:id：任务详情。
- PATCH /api/materials/:id：`{transcript,speakerRoles,confirmed:true}` 保存确认稿。
- POST /api/materials/:id/retry：显式重试失败任务，重检权限和额度。
- GET /api/materials/:id/audio：仅所有者试听。
- POST /api/integrations/feishu/connect → `{url}`，设置 OAuth nonce Cookie。
- GET /api/integrations/feishu/callback：固定成功/失败页面。
- DELETE /api/integrations/feishu：断开当前会话连接。
- POST /api/analyze 可传 materialId；必须验证所有者、模式、状态和确认文本，报告成功关联材料。

材料返回 `{id,analysisMode,source,status,fileName,transcript,segments,speakerRoles,confirmed,error,createdAt,expiresAt}`。状态 uploading/queued/transcribing/ready/failed；来源 audio/feishu；片段 `{speaker,startMs,endMs,text}`。所有错误使用中文与稳定 code，不回传供应商原始错误或响应。

## 验收

已有 109 项基线通过。新增覆盖分块重复/越序/超限、伪造格式、跨用户/模式访问、重复付费提交、空/超长转写、服务超时、重启恢复、OAuth state/nonce/PKCE/会话隔离、妙记 URL SSRF 与权限失败。执行 npm test、TypeScript 检查、npm run build 和隔离 HTTP/浏览器测试。真实 ASR 用合成音频、妙记用指定合成链接。模拟验收与真实服务验收分开记录；生产不构建，按现有 Bundle/原子替换流程部署。

## 官方依据

- https://open.feishu.cn/document/minutes-v1/minute-transcript/get.md
- https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code.md
- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token-v3.md
- https://www.volcengine.com/docs/6561/1354868
