| 任务清单 | 主要工作 | 依赖关系 |
|---|---|---|
| Task 1 | 建立 DeepSeek/豆包/Gemini 统一 Provider 与错误模型 | 无 |
| Task 2 | 记录安全的报告生成耗时 | Task 1 |
| Task 3 | 协调 HTTP 生命周期、取消与并发锁 | Task 1、2 |
| Task 4 | 更新前端错误信息与部署文档 | Task 3 |
| Task 5 | 完整验证并准备低内存生产发布 | Task 1～4 |

# DeepSeek V4 Flash 与同步超时协调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将生产 AI Provider 切换到 DeepSeek V4 Flash 思考模式，修复 Nginx 60 秒截断，并为每次报告生成记录安全的结构化耗时。

**Architecture:** 从 `server.js` 提取可注入、可测试的 AI Provider 服务，统一 DeepSeek、豆包和 Gemini 的调用及错误语义。HTTP 路由拥有取消控制器和并发锁，Nginx 超时始终大于应用超时；耗时只写结构化 PM2 日志，不修改 SQLite schema。

**Tech Stack:** Node.js 22 ESM、Express 5、OpenAI Node SDK 6、Google GenAI SDK、Node Test、Nginx、PM2。

---

### Task 1: 统一 AI Provider 并接入 DeepSeek V4 Flash

**Files:**
- Create: `services/aiService.js`
- Create: `tests/aiService.test.mjs`
- Modify: `server.js:155-245`

- [ ] **Step 1: 写 DeepSeek 配置失败测试**

测试用注入的 `FakeOpenAI` 捕获构造参数和 `chat.completions.create` 参数，断言：

```js
assert.deepEqual(clientOptions, {
  apiKey: 'test-key',
  baseURL: 'https://api.deepseek.com',
  timeout: 600000,
  maxRetries: 0,
});
assert.equal(request.model, 'deepseek-v4-flash');
assert.deepEqual(request.thinking, { type: 'enabled' });
assert.equal(request.reasoning_effort, 'high');
assert.equal('temperature' in request, false);
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `node --test tests/aiService.test.mjs`

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小 Provider 服务**

`createAiService` 接受 `env`、`OpenAIClass`、`GoogleGenAIClass`，返回：

```js
{
  provider,
  model,
  runAnalysis({ systemPrompt, inputContent, signal })
}
```

DeepSeek 使用 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_THINKING`、`DEEPSEEK_REASONING_EFFORT`；豆包保持 `temperature: 0.4`；DeepSeek 思考模式不发送 `temperature`。OpenAI 兼容 Provider 将 `signal` 作为 SDK 请求选项传入。

- [ ] **Step 4: 添加缺失配置和错误归一化测试**

覆盖：缺少 Key、非法 Provider、429、503、SDK 超时、用户取消和普通上游错误。统一错误对象包含安全的 `code` 与 HTTP `status`，不得把 SDK 原始响应体返回客户端。

- [ ] **Step 5: 运行 Provider 测试**

Run: `node --test tests/aiService.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 6: 提交 Provider 变更**

```bash
git add services/aiService.js tests/aiService.test.mjs server.js
git commit -m "feat: add DeepSeek analysis provider"
```

### Task 2: 记录报告生成耗时

**Files:**
- Create: `services/analysisTelemetry.js`
- Create: `tests/analysisTelemetry.test.mjs`
- Modify: `server.js:323-405`

- [ ] **Step 1: 写耗时遥测失败测试**

使用注入的时钟和写入函数，断言完成事件为：

```js
{
  event: 'analysis.completed',
  analysisId: 'analysis-test-id',
  analysisMode: 'recruiter',
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  status: 'succeeded',
  durationMs: 414000,
  inputChars: 12000,
  outputChars: 3600,
  errorCode: null,
}
```

并断言事件 JSON 不包含测试输入正文、Prompt、API Key 或用户 ID。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/analysisTelemetry.test.mjs`

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现一次性遥测计时器**

实现 `createAnalysisTelemetry({ analysisMode, provider, model, inputChars, now, createId, write })`，返回 `succeed(outputChars)`、`fail(errorCode)`、`cancel()`；同一计时器最多写一次完成事件，`durationMs` 最小为 0。

- [ ] **Step 4: 覆盖失败、取消和重复结束测试**

断言 `failed`/`cancelled` 状态、错误码白名单和重复结束不重复写日志。

- [ ] **Step 5: 运行遥测测试并提交**

```bash
node --test tests/analysisTelemetry.test.mjs
git add services/analysisTelemetry.js tests/analysisTelemetry.test.mjs server.js
git commit -m "feat: record analysis generation duration"
```

### Task 3: 协调取消、并发锁和响应超时

**Files:**
- Create: `services/analysisExecution.js`
- Create: `tests/analysisExecution.test.mjs`
- Modify: `server.js:323-405`

- [ ] **Step 1: 写客户端断开失败测试**

构造延迟中的 Provider Promise，触发下游 `close`，断言上游收到 abort、不会调用持久化函数、并发锁只在上游结束后释放。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/analysisExecution.test.mjs`

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现 HTTP 无关的执行协调器**

`executeAnalysis({ run, persist, signal, telemetry, release })` 在 `try/finally` 中执行：调用 Provider、校验并持久化结果、记录成功/失败/取消，最后释放并发锁。取消后禁止持久化。

- [ ] **Step 4: 将路由连接到协调器**

路由创建 `AbortController`；`res.close` 且 `!res.writableEnded` 时调用 `abort()`；在 `finally` 移除监听器。响应已经关闭时不得再调用 `res.status()`。

- [ ] **Step 5: 覆盖成功、上游超时和断开场景**

Run: `node --test tests/analysisExecution.test.mjs tests/requestGuards.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 6: 提交协调器变更**

```bash
git add services/analysisExecution.js tests/analysisExecution.test.mjs server.js
git commit -m "fix: coordinate analysis timeout and cancellation"
```

### Task 4: 错误信息、配置说明和 Nginx 边界

**Files:**
- Modify: `services/geminiService.ts:36-58`
- Create: `tests/analysisErrors.test.ts`
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`
- Modify: `docs/operator-runbook.md`
- Modify: `docs/handoff.md`

- [ ] **Step 1: 写前端错误映射失败测试**

断言 `AI_UPSTREAM_TIMEOUT`、`AI_PROVIDER_BUSY`、`AI_PROVIDER_RATE_LIMITED` 和 `AI_PROVIDER_ERROR` 映射为中文用户提示，未知错误保留安全服务端消息。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --experimental-strip-types --test tests/analysisErrors.test.ts`

Expected: FAIL，因为错误映射尚不存在。

- [ ] **Step 3: 实现错误映射并保留错误码**

前端解析 `{ error, code }`；抛出的 `Error` 使用中文消息并附加只读 `code`。不得在浏览器控制台输出请求正文。

- [ ] **Step 4: 更新配置和运行文档**

记录 DeepSeek 环境变量、600/660 秒超时关系、PM2 结构化耗时日志查询方式、Nginx 精确路由配置以及“生产机禁止构建”。文档示例只使用占位 Key。

- [ ] **Step 5: 运行相关测试并提交**

```bash
node --experimental-strip-types --test tests/analysisErrors.test.ts tests/analysisRequest.test.mjs tests/staticAssets.test.mjs
git add services/geminiService.ts tests/analysisErrors.test.ts README.md DEPLOYMENT.md docs/operator-runbook.md docs/handoff.md
git commit -m "docs: document DeepSeek timeout operations"
```

### Task 5: 完整验证与生产发布准备

**Files:**
- Modify: `docs/superpowers/verification/2026-08-05-deepseek-timeout-observability.md`

- [ ] **Step 1: 运行完整测试与构建**

```bash
npm test
npm run build
git diff --check
```

Expected: 0 failures、Vite build exit 0、`git diff --check` 无输出。

- [ ] **Step 2: 验证配置中没有密钥**

检查 Git diff 和 tracked files；只允许出现变量名与占位符，不得出现任何 `sk-` 密钥值。

- [ ] **Step 3: 记录本地验证证据**

写入测试数量、构建资源、超时参数、未执行的真实 AI/生产边界和低内存发布方式。

- [ ] **Step 4: 提交验证记录**

```bash
git add docs/superpowers/verification/2026-08-05-deepseek-timeout-observability.md
git commit -m "docs: record DeepSeek timeout verification"
```

- [ ] **Step 5: 获得并执行生产授权边界**

本次用户已授权 DeepSeek Key 环境变量与生产 Provider 切换；不得额外执行 Git push。发布时从已验证本地提交创建 Bundle 和 `dist` 包，在服务器备份 `.env.local`、Nginx 配置、完整 `data/` 和旧 `dist`，更新代码/依赖/构建产物，安全注入密钥，执行 `nginx -t`、reload 与 `pm2 restart bar-raiser-ai --update-env`。生产机不得运行 `npm run build`。

- [ ] **Step 6: 生产无内容探针与授权型 AI 冒烟**

先验证 HTTPS、认证、PM2、Provider 名称和 Nginx 生效配置。只有合成材料准备完成且用户授权费用/数据后才调用真实 DeepSeek；否则明确记录“配置已切换但真实 AI 未调用”。

## Self-Review

- Spec coverage：DeepSeek、思考模式、600/660 秒、取消、并发、耗时、安全日志、生产边界均有对应 Task。
- Placeholder scan：无 `TBD`、`TODO` 或未定义实现步骤；密钥示例明确为不可提交的占位值。
- Type consistency：所有模块使用 `analysisMode`、`provider`、`model`、`durationMs`、`errorCode`；错误码与设计文档一致。
