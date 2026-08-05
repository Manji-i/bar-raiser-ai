# GLM 5.2 与 Kimi K3 Provider 验证记录

## 本地验证

- 工作树：`/Users/bytedance/Documents/bar-raiser-ai/.worktrees/deepseek-timeout`
- 分支：`codex/deepseek-timeout`
- 日期：2026-08-05

### 自动化测试

```bash
npm test
```

结果：109/109 通过，0 失败。新增覆盖包括：

- GLM 5.2 的模型、Base URL、思考模式、最高推理强度、流式正文、600 秒超时和零重试。
- Kimi K3 的模型、Base URL、固定思考模式、最高推理强度、流式正文、固定参数约束、600 秒超时和零重试。
- 两家 Provider 缺少 Key 时失败关闭。
- 对比脚本的显式执行门、Provider 白名单、管理后台标签与敏感正文不落日志。

### 生产构建

```bash
npm run build
```

结果：Vite 构建成功，3097 个模块完成转换，产物为：

- `/assets/index-CH85fL1J.js`
- `/assets/index-DZT1nRDZ.css`
- `/assets/reportPdf.worker-BvCZpIHk.js`

构建保留两个既有警告：`.env` 中 `NODE_ENV=production` 的 Vite 提示，以及大 chunk 提示；二者均未导致失败。

### 格式与敏感信息

```bash
git diff --check
git grep -nE 'sk-[A-Za-z0-9_-]{20,}|[0-9a-f]{32}\.[A-Za-z0-9_-]{8,}'
```

结果：diff 检查通过；已跟踪文件未发现真实 Key 形态。仓库中只存在环境变量名、占位值和测试值。

### 依赖边界

`npm install` 报告 2 个既有 high severity 告警。本次未修改依赖版本，也未运行可能引入破坏性升级的 `npm audit fix --force`。

## 生产验证待记录

生产发布后补充目标提交、备份路径、PM2/Nginx/HTTPS 状态、只读模型列表验证、两份真实报告 ID 与结构化耗时。不得写入 API Key、候选人材料、Prompt 或报告正文。
