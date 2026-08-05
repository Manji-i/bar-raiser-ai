# DeepSeek V4 Flash 与同步超时协调设计

## 目标

在不改变现有“提交分析后等待完整报告”的产品流程下，修复 HTTPS/Nginx 切换后 `/api/analyze` 在 60 秒被截断的问题；将 AI Provider 切换到 DeepSeek V4 Flash 正式版思考模式；记录每次分析的模型、模式、结果状态和生成耗时，同时不记录候选人材料、Prompt 或密钥。

## 决策

- Provider：新增 `deepseek`，生产使用 `deepseek-v4-flash`。
- 推理参数：`thinking.type=enabled`，`reasoning_effort=high`；思考模式下不发送无效的 `temperature`。
- SDK：复用现有 `openai` 依赖；DeepSeek Base URL 为 `https://api.deepseek.com`。
- 超时顺序：AI 请求 600 秒，Nginx `/api/analyze` 读取/发送超时 660 秒，SDK 自动重试为 0。
- 取消：客户端断开且响应尚未结束时，通过 `AbortController` 取消上游请求。
- 并发：单用户并发锁在上游请求真正结束后释放，不因下游连接关闭而提前释放。
- 指标：以单行 JSON 写入 PM2 标准输出，字段为 `event`、`analysisId`、`analysisMode`、`provider`、`model`、`status`、`durationMs`、`inputChars`、`outputChars`、`errorCode`；不含用户 ID、材料正文、Prompt、API Key。
- 数据库：本轮不修改 schema；长期异步任务方案再持久化任务级耗时。

## 模块边界

### `services/aiService.js`

负责 Provider 初始化、统一调用、超时和错误归一化。Gemini、豆包、DeepSeek 共享 `runAnalysis({ systemPrompt, inputContent, signal })` 接口；调用方不感知 SDK 差异。

### `services/analysisTelemetry.js`

负责生成分析 ID、计算耗时并输出安全的结构化事件。所有字符串字段使用受控枚举或程序生成值，禁止传入候选人原文。

### `server.js`

负责 HTTP 生命周期：校验请求、获取并发锁、创建取消信号、调用 AI、校验输出、保存报告，以及在 `finally` 中清理监听器和释放锁。

### Nginx

为精确路由 `location = /api/analyze` 设置 660 秒代理超时，其他页面和 API 保持默认超时，避免扩大慢连接影响面。

## 错误语义

- AI 主动超时：`504`，`code=AI_UPSTREAM_TIMEOUT`。
- 用户断开：取消上游，不再写报告；因下游已关闭，不尝试追加响应。
- Provider 限流：`429`，`code=AI_PROVIDER_RATE_LIMITED`。
- Provider 繁忙：`503`，`code=AI_PROVIDER_BUSY`。
- Provider 其他错误：`502`，`code=AI_PROVIDER_ERROR`。
- 输出格式不合法：沿用 `502 INVALID_ANALYSIS_OUTPUT`。

前端优先展示服务端 `error`，并为上述错误码提供中文提示；不得把 SDK 原始错误或密钥相关信息返回浏览器。

## 配置

生产环境使用以下变量，密钥仅写入权限为 `600` 的服务器 `.env.local`：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=<secret>
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_THINKING=enabled
DEEPSEEK_REASONING_EFFORT=high
AI_REQUEST_TIMEOUT_MS=600000
AI_MAX_RETRIES=0
```

## 验证

1. 单元测试验证 DeepSeek 客户端、模型、思考参数、超时、零重试和取消信号。
2. 路由测试验证并发锁不会在客户端关闭时提前释放，取消后不保存报告。
3. 遥测测试验证成功、失败、超时的耗时计算，且日志不含输入正文。
4. 全量执行 `npm test && npm run build`。
5. 生产机只安装运行依赖、同步本地构建产物并重启 PM2，不运行构建。
6. 执行 `nginx -t` 后 reload，验证生效配置包含 `/api/analyze` 的 660 秒超时。
7. 真实 DeepSeek 冒烟仅使用用户授权的合成材料，并核对只生成一份报告、日志记录耗时、网页不在 60 秒返回 504。

## 非目标

- 本轮不引入异步任务表、队列、进度百分比或跨 Provider 自动回退。
- 本轮不迁移历史报告，不尝试补算 32 份历史报告耗时。
- 本轮不修改 Prompt 内容和报告展示结构。
