# GLM 5.2 与 Kimi K3 Provider 接入设计

## 任务清单

| 任务 | 主要工作 | 依赖关系 |
| --- | --- | --- |
| Task 1 | 扩展 AI Provider，接入 GLM 5.2 与 Kimi K3 | 无 |
| Task 2 | 为两家模型补充思考模式、流式聚合与错误处理测试 | Task 1 的接口契约 |
| Task 3 | 更新非敏感环境变量模板和运维文档 | Task 1 |
| Task 4 | 本地全量测试、构建与敏感信息扫描 | Task 1–3 |
| Task 5 | 配置生产密钥、部署并完成在线冒烟 | Task 4 |
| Task 6 | 用最近一次报告的输入分别生成两份真实报告并记录耗时 | Task 5 |

## 目标与边界

在现有 `AI_PROVIDER` 环境变量切换机制中新增 `glm` 与 `kimi`，不增加前端模型选择器，不改变浏览器请求和报告展示协议。生产环境继续默认使用当前 Doubao Seed 2.1 Pro；GLM 5.2 与 Kimi K3 作为已配置备用 Provider，可通过环境变量切换。

真实验收经用户明确授权：复用生产数据库中最近一份招聘报告的职位与面试输入，分别调用 GLM 5.2 和 Kimi K3，保存为该报告所属用户可见的两份新报告。过程中不得把输入原文、Prompt、API Key 或模型思考内容输出到终端、应用日志、文档或提交。

## Provider 契约

### GLM 5.2

- Provider：`glm`
- 模型：`glm-5.2`
- Base URL：`https://open.bigmodel.cn/api/paas/v4`
- 环境变量：`GLM_API_KEY`、`GLM_MODEL`、`GLM_BASE_URL`、`GLM_REASONING_EFFORT`
- 请求参数：`thinking: { type: 'enabled' }`、`reasoning_effort: 'max'`、`stream: true`
- 仅拼接 `choices[0].delta.content`，忽略 `reasoning_content`

### Kimi K3

- Provider：`kimi`
- 模型：`kimi-k3`
- Base URL：`https://api.moonshot.cn/v1`
- 环境变量：`KIMI_API_KEY`、`KIMI_MODEL`、`KIMI_BASE_URL`、`KIMI_REASONING_EFFORT`
- K3 始终开启思考模式，请求设置 `reasoning_effort: 'max'`、`stream: true`
- 不显式发送 `temperature` 等 K3 固定参数
- 仅拼接 `choices[0].delta.content`，忽略 `reasoning_content`

## 公共行为

- 复用 OpenAI 兼容 SDK，默认超时 `600000ms`，自动重试 `0` 次。
- 复用客户端断开后的上游取消信号。
- 流式响应只在服务端聚合；浏览器仍等待最终报告，不改变前端数据流。
- 继续使用既有稳定错误码，包括上游超时、限流、服务繁忙、取消和通用 Provider 错误。
- 遥测继续记录 `analysisId`、`provider`、`model`、`status`、`durationMs`、输入/输出字符数和错误码，不记录原始材料。
- 抽取内部流式正文聚合函数，Doubao、GLM、Kimi 共用，避免三份实现漂移；DeepSeek 维持当前非流式行为。

## 配置与安全

- 真实 Key 只写入生产服务器私有环境文件，并保持仅 root 可读。
- 仓库模板仅添加变量名和占位符，不包含真实值。
- 部署前备份生产环境文件与完整 `data/` 目录，备份收紧为仅 root 可读。
- 生产服务器低内存且无 swap，不执行构建；测试和构建在本地完成，上传已验证代码与 `dist/`。
- 上线后先分别通过只读模型列表接口验证 Key 和模型可用性，再执行真实报告生成。

## 真实报告验收

1. 只查询最近一份 `recruiter` 报告的内部标识、所属用户和生成所需输入字段，不打印字段内容。
2. 先切换为 `glm`，通过现有分析执行与报告保存链路生成并保存一份报告。
3. 再切换为 `kimi`，用完全相同的职位和面试输入生成并保存一份报告。
4. 两次调用均禁止自动重试，避免失败时重复扣费。
5. 每次完成后核对新报告记录、Provider、模型、成功状态和结构化遥测；不读取或输出报告正文。
6. 验收结束后把生产默认 Provider 恢复为 Doubao Seed 2.1 Pro，并验证 PM2、HTTPS 和当前 Provider。

## 测试策略

- 先写失败测试，覆盖两家客户端配置、默认模型、思考参数、推理强度、流式聚合、取消信号和缺少 Key 时失败关闭。
- 回归测试 Doubao 的流式聚合和 DeepSeek 既有思考模式。
- 运行 `npm test`、`npm run build`、`git diff --check` 和敏感信息扫描。
- 生产验证只执行只读健康检查和两次已授权的真实分析，不在生产机运行测试或构建。

## 非目标

- 不新增前端模型选择器。
- 不改变数据库 schema。
- 不修改 Prompt 内容。
- 不引入新的 SDK 依赖。
- 不推送 GitHub，除非用户另行明确授权。
