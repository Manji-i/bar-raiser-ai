# 录音与飞书妙记接入、验收和发布

## 任务清单

| Task | 主要工作 | 依赖 |
|---|---|---|
| 配置 | 项目专用语音服务、飞书应用及回调域名 | 服务开通与管理员安全配置 |
| 验收 | 合成录音真实转写、测试妙记 OAuth 导入 | 配置完成 |
| 发布 | 本地构建、备份、Bundle 和静态产物切换 | 全部验收通过 |

## 第一版范围

两种分析模式均支持 MP3、M4A、WAV、OGG 本地录音和飞书妙记链接。录音上限为 100 MiB、60 分钟，按 4 MiB 分块保存到私有目录，核验真实格式与时长后转换为 16 kHz 单声道 PCM WAV。元信息解析在限时、限内存 Worker 内运行，转换进程最多运行 120 秒。应用只分析用户检查并确认后的文字，不做声学或情绪评分。

上传、处理、确认是独立步骤。刷新后可恢复服务器任务；中断的上传需要放弃并重新选择文件。已知 ASR 任务编号的重试只查询同一任务，不重复提交；不确定的提交也不自动重新付费。每用户同时一份任务，每 24 小时最多创建 10 份；全站最多 20 份活动任务，原文件和标准化 WAV 合计预留不超过 2 GiB。单机部署只运行一个材料调度进程。

## 管理员配置清单

下列值通过生产机安全配置流程注入，不提交到 Git，不在聊天或日志中提供密钥。不要复用开发者本机 Lark CLI 的授权。现有文本分析的 AI 凭证不能自动视为语音识别凭证。

| 配置名 | 用途 |
|---|---|
| `ASR_API_KEY` | 项目专用火山语音识别 API Key；或使用下列旧式凭证二选一 |
| `ASR_APP_ID`、`ASR_ACCESS_KEY` | 旧式语音应用认证，必须成对配置 |
| `ASR_RESOURCE_ID` | 默认 `volc.seedasr.auc`，需开通对应标准录音识别资源 |
| `AUDIO_PUBLIC_BASE_URL` | `https://evalbar.cn`，只允许 HTTPS 根地址，不带路径、查询或账号密码 |
| `FEISHU_APP_ID`、`FEISHU_APP_SECRET` | Eval Bar AI 专用飞书应用 |
| `FEISHU_REDIRECT_URI` | `https://evalbar.cn/api/integrations/feishu/callback`，同时登记到飞书应用回调白名单 |

飞书申请 `minutes:minutes.transcript:export` 权限。使用者必须完成自己的 OAuth 授权，且具有目标妙记导出权限；仅有浏览权限不保证可导出。企业自建应用受可用范围限制；面向不同企业的任意用户需要合适的商店应用分发和审核，不能将单租户测试等同于全用户可用。

OAuth token 仅存在服务器内存，按本站登录会话摘要隔离；退出、断开、授权过期或服务重启后需要重新连接。使用 state、HttpOnly nonce Cookie 和 PKCE。妙记链接只提取合法 token，服务端调用固定官方 API，不抓取用户输入 URL，也不绕过权限下载录音。

服务未配置时，相应入口明确显示尚未配置，并保留文字上传和粘贴路径。

## 代理和服务器准备

修改环境变量、Nginx 和生产 schema 前遵守项目授权规则。发布与 GitHub 推送已有本次用户授权；配置值仍须由管理员安全提供。

- 仅在本地或 CI 构建。服务器执行平台对应的 `npm ci --omit=dev`，确认 `ffmpeg-static` 安装出的 Linux 二进制可执行；不得上传 macOS 的 `node_modules`。
- Nginx 现有 12 MiB 请求体限制可容纳 4 MiB 分块，无需放宽为 100 MiB。
- 对 `/api/audio-source/` 和精确路径 `/api/integrations/feishu/callback` 禁用访问日志，避免记录临时媒体凭证、授权 code 和 state。若配置了错误日志、上游 tracing、CDN 或 WAF，须确认同样不记录这些完整 URL。服务端不输出逐字稿和上游凭证。
- 调度器仅在直接启动 `server.js` 时运行。PM2 保持单实例；多实例需要共享队列和分布式锁，不能直接提高实例数。
- `data/uploads/audio/<UUID>/` 目录私有。音频通过所有者鉴权接口访问，供应商通过 256 bit 随机短时凭证读取；成功、取消或超时会撤销凭证。原音频在任务创建 24 小时后清理，清理周期一分钟。
- `material_jobs` 为新增 SQLite 表及索引，启动时幂等创建。发布前备份数据库和上传目录；回滚保留新增表及数据，不能直接删除表或覆盖运行中数据库。
- 一个材料可关联多份报告。删除最后一份关联报告后清理其材料；删除其中一份不影响其他报告。报告保留自己的确认稿快照。

## API 概览

除 OAuth 回调和短时媒体凭证接口外，均要求本站登录。写接口沿用站点的同源保护。

| 方法与路径 | 行为 |
|---|---|
| `GET /api/materials/capabilities` | 音频开通状态、限制、当前会话飞书连接状态 |
| `GET /api/materials?analysisMode=candidate` | 当前用户当前模式最近未过期任务 |
| `POST /api/materials/audio` | `{analysisMode,fileName,sizeBytes}` 创建私有上传任务 |
| `PUT /api/materials/:id/chunks/:index` | 二进制分块，序号从 0 开始，同块重传幂等 |
| `POST /api/materials/:id/submit` | 上传完整后进入转写队列 |
| `POST /api/integrations/feishu/connect` | 建立会话绑定的 OAuth 流，返回授权地址 |
| `DELETE /api/integrations/feishu` | 撤销本站会话内连接并中止在途读取 |
| `POST /api/materials/feishu` | `{analysisMode,url}` 导入该用户可导出的妙记 |
| `GET /api/materials/:id` | 状态、逐字稿、时间戳和说话人，不含凭证 |
| `PATCH /api/materials/:id` | `{confirmed:true,transcript,speakerRoles}` 保存确认稿 |
| `POST /api/materials/:id/retry` | 最多 3 次显式重试，已知任务只重新查询 |
| `POST /api/materials/:id/cancel` | 放弃上传或处理；上游已提交任务可能仍产生费用 |
| `GET /api/materials/:id/audio` | 当前所有者试听私有原录音 |
| `POST /api/analyze` | 可选 `materialId`，服务端核对用户、模式和确认稿完全一致后分析 |

首次转写会生成带时间戳、未知角色的编辑稿。用户选择角色时仅同步标签，保留手工修改的正文。片段不完整时回退完整文本，避免静默丢字；无法可靠区分说话人时由用户人工补充。修改文字或角色后必须再次确认。

## 真实上线验收门槛

1. 使用专门合成的中文面试录音，通过生产候选环境完成上传、真实 ASR、试听、角色修订、确认和文本分析。记录实际耗时和任务状态，不记录原始凭证。
2. 使用测试账号和测试妙记，完成真实 OAuth、逐字稿导入、断开、重连；确认无导出权限和无权访问时显示明确错误。至少验证实际使用租户的可用范围。
3. 验证两用户互访被拒绝，取消和重启不重复提交，超过 24 小时后音频不可访问。
4. 按 `DEPLOYMENT.md` 准备 Bundle 与本地 `dist`，校验 SHA-256、备份、快进发布并原子切换；线上核对 PM2、健康接口、HTML 引用的资源 hash 和实际页面。
5. 真实服务验收通过后才发布该能力。只有本地模拟测试通过时，可以保存开发分支供审阅，不能宣称已上线或真实转写通过。

官方接口依据：[飞书逐字稿导出](https://open.feishu.cn/document/minutes-v1/minute-transcript/get)、[火山录音文件识别](https://www.volcengine.com/docs/6561/1354868)。
