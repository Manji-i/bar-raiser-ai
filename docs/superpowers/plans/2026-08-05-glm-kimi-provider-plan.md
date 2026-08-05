# GLM 5.2 与 Kimi K3 Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有环境变量 Provider 架构中加入 GLM 5.2 与 Kimi K3，并安全完成生产部署及两份真实对比报告。

**Architecture:** 两家服务都复用现有 OpenAI SDK 和统一流式正文聚合函数；浏览器协议、SQLite schema 和默认 Doubao Provider 不变。新增显式执行的运维脚本，从最近一份招聘报告构建同一输入，按指定 Provider 生成、校验并保存带模型标签的报告，同时只输出结构化耗时元数据。

**Tech Stack:** Node.js 22 ESM、OpenAI Node SDK、node:test、SQLite、PM2、Nginx

---

## 文件结构

- 修改 `services/aiService.js`：新增 GLM/Kimi Provider，并抽取流式正文聚合。
- 修改 `tests/aiService.test.mjs`：覆盖两家模型契约和公共流式行为。
- 新建 `scripts/generate-provider-comparison.mjs`：显式执行真实对比报告，禁止打印敏感正文。
- 新建 `tests/providerComparisonScript.test.mjs`：锁定脚本的执行门、Provider 白名单和输出标签。
- 修改 `.env.example`：加入不含真实值的变量模板。
- 修改 `docs/operator-runbook.md`：记录 Provider 切换、比较脚本与耗时查询。

### Task 1：用失败测试定义 GLM 5.2 与 Kimi K3 请求契约

**Files:**
- Modify: `tests/aiService.test.mjs`
- Test: `tests/aiService.test.mjs`

- [ ] **Step 1: 写 GLM 失败测试**

新增测试，断言客户端使用 `https://open.bigmodel.cn/api/paas/v4`、`glm-5.2`、600 秒超时、零重试，并发送：

```js
{
  model: 'glm-5.2',
  thinking: { type: 'enabled' },
  reasoning_effort: 'max',
  stream: true,
}
```

伪流中先返回 `reasoning_content`，再返回两段 `content`；结果必须只拼接正文。还要断言请求收到调用方的 `AbortSignal`。

- [ ] **Step 2: 写 Kimi 失败测试**

新增测试，断言客户端使用 `https://api.moonshot.cn/v1`、`kimi-k3`、600 秒超时、零重试，并发送：

```js
{
  model: 'kimi-k3',
  reasoning_effort: 'max',
  stream: true,
}
```

请求体不得包含 `thinking` 和 `temperature`。伪流必须忽略 `reasoning_content` 并拼接最终 `content`。

- [ ] **Step 3: 写缺少 Key 的失败测试**

分别以 `AI_PROVIDER=glm` 和 `AI_PROVIDER=kimi` 创建服务，断言抛出 `AI_PROVIDER_NOT_CONFIGURED`，状态码为 500。

- [ ] **Step 4: 运行定向测试验证 RED**

Run: `node --experimental-strip-types --test tests/aiService.test.mjs`

Expected: 新增 GLM/Kimi 测试因 Provider 不受支持而 FAIL，既有测试保持 PASS。

### Task 2：实现统一流式聚合与两个 Provider

**Files:**
- Modify: `services/aiService.js`
- Test: `tests/aiService.test.mjs`

- [ ] **Step 1: 抽取流式正文聚合函数**

在 `services/aiService.js` 内新增私有函数：

```js
const collectStreamingContent = async (stream) => {
  let content = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string') content += delta;
  }
  return content;
};
```

Doubao 改为复用该函数，保持请求体和返回行为不变。

- [ ] **Step 2: 实现 GLM Provider**

使用现有 `OpenAIClass` 初始化：

```js
const client = new OpenAIClass({
  apiKey: requireApiKey(env.GLM_API_KEY, 'GLM'),
  baseURL: env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
  timeout,
  maxRetries,
});
```

默认 `GLM_MODEL=glm-5.2`、`GLM_REASONING_EFFORT=max`，请求启用 `thinking` 和 `stream`，并由 `runSafely` 统一映射错误。

- [ ] **Step 3: 实现 Kimi Provider**

使用现有 `OpenAIClass` 初始化：

```js
const client = new OpenAIClass({
  apiKey: requireApiKey(env.KIMI_API_KEY, 'Kimi'),
  baseURL: env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
  timeout,
  maxRetries,
});
```

默认 `KIMI_MODEL=kimi-k3`、`KIMI_REASONING_EFFORT=max`；仅传模型、消息、推理强度和 `stream: true`。

- [ ] **Step 4: 运行定向测试验证 GREEN**

Run: `node --experimental-strip-types --test tests/aiService.test.mjs`

Expected: 全部 PASS，且 Doubao 回归测试继续通过。

- [ ] **Step 5: 提交 Provider 实现**

```bash
git add services/aiService.js tests/aiService.test.mjs
git commit -m "feat: add GLM and Kimi analysis providers"
```

### Task 3：为真实对比生成增加安全执行脚本

**Files:**
- Create: `scripts/generate-provider-comparison.mjs`
- Create: `tests/providerComparisonScript.test.mjs`

- [ ] **Step 1: 写脚本契约失败测试**

测试脚本导出的纯函数：

```js
assert.deepEqual(parseComparisonArgs(['--execute', '--providers=glm,kimi']), {
  execute: true,
  providers: ['glm', 'kimi'],
});
assert.throws(() => parseComparisonArgs(['--providers=deepseek']), /Unsupported comparison provider/);
assert.equal(buildComparisonFileName('面试记录.txt', 'glm', 'glm-5.2'), '面试记录.txt · GLM 5.2');
assert.equal(buildComparisonFileName('面试记录.txt', 'kimi', 'kimi-k3'), '面试记录.txt · Kimi K3');
```

另断言没有 `--execute` 时主流程拒绝执行，不会创建 AI 客户端或写数据库。

- [ ] **Step 2: 运行测试验证 RED**

Run: `node --experimental-strip-types --test tests/providerComparisonScript.test.mjs`

Expected: FAIL，因为脚本尚不存在。

- [ ] **Step 3: 实现参数解析和标签**

脚本只允许 `glm`、`kimi`，要求显式 `--execute`。默认 Provider 顺序为 `glm,kimi`，输出文件名附加 `GLM 5.2` 或 `Kimi K3`，以便管理后台区分。

- [ ] **Step 4: 实现生产比较主流程**

主流程必须：

1. 载入 `.env` 与 `.env.local`。
2. 获取最近一份 `analysisMode=recruiter` 报告；若不存在则失败。
3. 用 `buildRecruiterInput` 和当前招聘 Prompt 构造输入。
4. 对每个 Provider 创建独立 AI 服务，保持 `AI_MAX_RETRIES=0`。
5. 调用 `validateAnalysisOutput` 后用 `reportService.create` 保存新报告，保留原岗位、能力维度和逐字稿，只修改 `fileName` 标签。
6. 输出单行结构化元数据：

```js
{
  event: 'provider_comparison_completed',
  provider,
  model,
  reportId,
  status: 'success',
  durationMs,
  inputChars,
  outputChars,
}
```

不得输出职位、能力要求、逐字稿、Prompt、报告正文或 Key。单个 Provider 失败时记录稳定错误码并继续下一个，最终以非零退出码表示存在失败。

- [ ] **Step 5: 运行测试验证 GREEN**

Run: `node --experimental-strip-types --test tests/providerComparisonScript.test.mjs`

Expected: 全部 PASS，测试中不发真实请求、不写生产数据库。

- [ ] **Step 6: 提交比较脚本**

```bash
git add scripts/generate-provider-comparison.mjs tests/providerComparisonScript.test.mjs
git commit -m "feat: add provider comparison runner"
```

### Task 4：更新非敏感配置模板和运维文档

**Files:**
- Modify: `.env.example`
- Modify: `docs/operator-runbook.md`

- [ ] **Step 1: 更新环境变量模板**

添加占位配置：

```dotenv
# AI_PROVIDER=glm
GLM_MODEL=glm-5.2
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_REASONING_EFFORT=max
GLM_API_KEY=your_glm_api_key

# AI_PROVIDER=kimi
KIMI_MODEL=kimi-k3
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_REASONING_EFFORT=max
KIMI_API_KEY=your_kimi_api_key
```

- [ ] **Step 2: 更新运维说明**

写明 Provider 切换值、两家默认模型、流式聚合、600 秒超时、零重试、比较脚本 `--execute` 门槛，以及如何从结构化日志读取 `durationMs`。明确真实生成会计费。

- [ ] **Step 3: 文档自检并提交**

Run: `git diff --check`

Expected: exit 0。

```bash
git add .env.example docs/operator-runbook.md
git commit -m "docs: document GLM and Kimi operations"
```

### Task 5：完成本地全量验证

**Files:**
- Verify: all changed files

- [ ] **Step 1: 运行全量测试**

Run: `npm test`

Expected: 所有测试 PASS，0 FAIL。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

Expected: Vite build exit 0。

- [ ] **Step 3: 运行格式与敏感信息检查**

Run: `git diff --check`

Expected: exit 0。

扫描所有已跟踪改动，确认不存在用户提供的任何 Key、`sk-` 密钥字面量或候选人原文；只允许测试中的 `test-key`。

- [ ] **Step 4: 提交验证记录**

在 `docs/superpowers/verification/2026-08-05-glm-kimi-provider-deployment.md` 记录命令、通过数量、构建结果和未执行边界，不记录敏感内容。

### Task 6：低内存生产部署与密钥配置

**Files:**
- Deploy: verified Git commits and local `dist/`
- Modify on server: `/root/bar-raiser-ai-new/bar-raiser-ai/.env.local`

- [ ] **Step 1: 重新核验生产状态**

检查生产 HEAD、PM2 `bar-raiser-ai`、Nginx、磁盘/内存和 HTTPS 200；不得读取环境变量值或报告正文。

- [ ] **Step 2: 创建受限备份**

备份完整 `data/`、当前 `.env.local` 和运行代码；对备份执行 `chmod -R go-rwx`。记录明确回滚路径。

- [ ] **Step 3: 安全写入 Key 和非敏感配置**

把 `GLM_API_KEY`、`KIMI_API_KEY` 写入服务器私有环境文件，设置模型、Base URL 与 `reasoning_effort=max`；保持 `AI_PROVIDER=doubao`，文件权限为 600。Key 不得出现在命令行参数、stdout 或日志中。

- [ ] **Step 4: 部署本地已验证产物**

生产机不运行 `npm run build`。使用 git bundle 或校验后的文件同步更新后端、脚本、文档和本地 `dist/`，快进到目标提交，再重启 PM2。

- [ ] **Step 5: 在线冒烟与只读模型验证**

确认 PM2 online、Nginx active、HTTPS 200、当前 Provider 仍为 Doubao；分别调用两家的 `/models` 只读接口，确认 Key 有效且模型列表包含 `glm-5.2` 和 `kimi-k3`。

### Task 7：生成两份真实报告并返回实际耗时

**Files:**
- Execute: `scripts/generate-provider-comparison.mjs`

- [ ] **Step 1: 记录源报告元数据**

只记录最近招聘报告的内部 ID、创建时间、输入字符数和所属用户 ID；不打印职位或逐字稿。

- [ ] **Step 2: 执行真实比较**

Run: `node scripts/generate-provider-comparison.mjs --execute --providers=glm,kimi`

Expected: 两条 `provider_comparison_completed` 成功记录，Provider 分别为 `glm`、`kimi`；各创建一份新报告。

- [ ] **Step 3: 验证持久化和可见性**

只查询两份新报告的 ID、创建时间、文件名标签、结果字符数和所属用户，不读取结果正文。确认管理后台 API 能列出两份报告。

- [ ] **Step 4: 恢复并验证默认 Provider**

确认 `.env.local` 中 `AI_PROVIDER=doubao`、模型为 `doubao-seed-2-1-pro-260628`，PM2 online、HTTPS 200。

- [ ] **Step 5: 交付耗时**

向用户返回 GLM 5.2 和 Kimi K3 的 `durationMs`，换算为秒和分钟，并给出两份报告 ID 或管理后台识别标签；不返回报告正文。
