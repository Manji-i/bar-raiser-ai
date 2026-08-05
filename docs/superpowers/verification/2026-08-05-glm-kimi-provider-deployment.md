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

## 生产验证

- 初始生产提交：`b361946104035f4b6abc31f68560984d081a0f8d`
- 功能部署提交：`04c209f47a812bbc6a278ffb6930aae20328da72`
- 数据与环境备份：`/root/bar-raiser-ai-backups/glm-kimi-20260805-205740`
- Bundle：`/root/bar-raiser-ai-bundles/glm-kimi-04c209f.bundle`
- 备份目录权限：700；生产 `.env.local` 权限：600
- 生产机未运行测试或构建。

密钥通过关闭终端回显的交互输入写入 `.env.local`，未进入命令行参数、stdout、PM2 日志、Git 或本文档。只读模型列表验证结果：

- GLM：HTTP 200，包含 `glm-5.2`
- Kimi：HTTP 200，包含 `kimi-k3`

PM2 重启后：

- `bar-raiser-ai`：online
- Nginx：active
- `https://evalbar.cn/`：HTTP 200
- 未认证 `/api/admin/reports`：HTTP 401
- 默认 Provider：`doubao`
- 默认模型：`doubao-seed-2-1-pro-260628`

## 真实报告验证

源招聘报告：`92f497f0-c393-42e6-a93e-e8a8edd315eb`。只读取并复用其职位、能力要求和面试内容，没有在终端或文档中展开；构造后的统一模型输入为 34,771 字符。

| Provider | 模型 | 状态 | 实际耗时 | 输出字符 | 新报告 ID |
| --- | --- | --- | ---: | ---: | --- |
| GLM | `glm-5.2` | success | 90,860 ms | 4,505 | `f71aaa70-9a5d-458b-a241-20ebf7f33e02` |
| Kimi | `kimi-k3` | success | 274,661 ms | 5,382 | `3b1697fb-983b-43b7-9d49-f40411bc9a49` |

两次调用都使用最高推理强度、流式接收和零自动重试。两份报告已进入 `reportService.getAll('recruiter')` 的管理后台数据源，所属用户与源报告一致；文件名后缀分别为 `GLM 5.2` 与 `Kimi K3`。验证时未读取或输出报告正文。
