# Bar Raiser AI 项目规则

## 项目定位

这是一个面向面试记录分析的人岗匹配工具。前端负责上传/粘贴面试材料、展示报告和收集反馈；后端负责认证、AI 调用、报告存储、Prompt 管理和飞书 OAuth。

## 技术栈

- 前端：React、TypeScript、Vite、React Router、Tailwind CDN、lucide-react
- 后端：Node.js ESM、Express
- AI 服务：Google Gemini 或豆包 Ark，按环境变量 `AI_PROVIDER` 切换
- 存储：本地 JSON 文件，位于 `data/`

## 目录约定

- `App.tsx`、`index.tsx`：当前前端入口和主路由，不随意迁移。
- `components/`：业务页面和可复用组件。新增主业务组件优先放这里。
- `src/context/`：React context，例如认证状态。
- `src/components/`：当前只放登录页相关组件；新增前先判断是否应归入根目录 `components/`。
- `services/*.ts`：前端调用或浏览器侧工具，例如 API client、文件解析。
- `services/*.js`：后端服务模块，例如用户、报告、Prompt、飞书。
- `server.js`：Express 入口、API 路由和静态资源托管。
- `data/`：运行时数据目录，只做本地运行和部署持久化，不提交。
- `dist/`、`node_modules/`：生成物和依赖目录，不手改、不提交。
- `.trae/`：工具技能目录，除非明确处理工具配置，否则不要纳入业务改动。

## 敏感数据边界

- 不读取、不打印、不提交 `.env.local`、`.env.production` 或任何真实密钥文件。
- 不把 API Key、token、密码、飞书凭证、候选人面试原文写入代码、日志、提交信息或文档。
- `data/users.json` 可能包含密码哈希和会话 token；`data/reports.json`、`data/feedback.json` 可能包含候选人材料。默认只查看结构和数量，不展开内容。
- 修改 `.env*`、密钥、token、部署环境变量前必须先停下来确认。

## 开发流程

1. 开始改动前先读本文件，再看相关代码。
2. 先用 `git status -sb` 确认工作区状态，识别已有用户改动。
3. 不覆盖未提交改动；若目标文件已有改动，先读 diff 再决定如何叠加。
4. 大改动先产出方案并等待确认；小改动直接做，但保持范围收敛。
5. 后端和前端接口字段要同步修改，避免只改一侧。
6. 代码和命令保持英文；项目文档和说明默认中文。

## Git 和远端同步

- 默认分支：`main`。
- 远端仓库：`https://github.com/Manji-i/bar-raiser-ai.git`。
- 每次正式迭代前先执行 `git fetch origin`，再用 `git status -sb` 和 `git log --oneline --left-right HEAD...origin/main` 判断本地是否落后。
- 如果本地落后但工作区有未提交改动，不要直接 merge/rebase；先说明差异和风险。
- `git push`、`git rebase`、`git reset --hard`、强制推送、创建远端仓库都属于红线，必须先获得明确授权。

## 运行和验证

- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 生产构建：`npm run build`
- 本地生产启动：`npm start`
- 当前项目没有专门的自动化测试脚本。代码改动后至少运行 `npm run build`；涉及后端路由或认证时，还要启动服务做接口或页面验证。
- 文档类改动至少检查文件存在、格式和关键内容；不需要因为纯文档改动重建前端。

## 部署注意

- 线上站点：`http://14.103.45.4:3000/`。
- `dist/` 是构建产物，线上是否最新不能只看源码，要对比线上 HTML 引用的 asset hash。
- Dockerfile、部署脚本、生产环境配置会影响发布路径；修改前先说明影响，生产发布必须先确认。
- 当前后端依赖 `services/` 和 `data/`。调整 Dockerfile 或部署方式时，必须验证运行时是否复制了必要文件并具备写入 `data/` 的权限。

## 代码注意点

- 认证统一使用 `Authorization: Bearer <token>`。
- 普通用户只能访问自己的报告；管理员入口需要后端权限校验。
- Prompt 相关接口属于高权限能力，新增或调整时必须考虑认证和管理员限制。
- 文件解析在浏览器侧完成，PDF worker 配置变化要实际上传 PDF 验证。
- 本地 JSON 存储适合 MVP；涉及多人生产、审计、并发写入时，应先设计持久化方案，不直接扩大 JSON 写法。
