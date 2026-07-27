# Eval Bar AI

Eval Bar AI 是一个面向面试记录分析的双模式工具：招聘方可以评估人岗匹配，候选人可以复盘自己的真实面试表现。系统支持上传或粘贴面试材料，并分别生成招聘评估报告或个人提升报告。

当前项目由 React 前端和 Node.js/Express 后端组成，AI 能力可通过环境变量在 Google Gemini 与豆包 Ark 之间切换。

## 核心功能

- **双模式入口**：`/` 为公开落地页；`/app/candidate` 用于“提升自己”，`/app/recruiter` 用于“判断他人”，两套历史记录分别位于 `/history/candidate` 和 `/history/recruiter`。
- **面试材料输入**：支持上传 `.txt`、`.md`、`.pdf`、`.docx` 文件，也支持直接粘贴文本。
- **人岗匹配分析**：围绕目标岗位、胜任力要求和面试记录生成结构化评估报告。
- **个人面试复盘**：职位名称和面试记录必填，JD 与简历选填；首次报告集中呈现 3–5 个核心问题，不输出录用等级或匹配分数。
- **简历解析兜底**：简历支持 PDF、DOCX、TXT，最大 10 MB；解析质量较低时可人工修订文本，低质量原文不会直接进入 AI 输入。
- **多模型支持**：通过 `AI_PROVIDER` 在 `gemini` 和 `doubao` 之间切换。
- **登录与权限**：支持用户名密码注册和登录；普通用户只能访问自己的报告，管理员可查看全量报告和反馈。
- **报告管理**：支持查看历史报告、复制分享链接、删除报告，并导出 Markdown 或 PDF。
- **反馈闭环**：用户可对报告评分并提交问题反馈；管理员可查看反馈并用于 Prompt 迭代。
- **服务端密钥管理**：AI Key 只在服务端读取，不暴露给浏览器端代码。

## 技术栈

- 前端：React、TypeScript、Vite、React Router、Tailwind CDN、lucide-react
- 后端：Node.js ESM、Express
- AI 服务：Google Gemini 或豆包 Ark
- 存储：SQLite（Node 内置 `node:sqlite`），数据库文件 `data/app.db`

## 本地运行

要求 Node.js ≥ 22（后端使用内置 `node:sqlite` 模块）。

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env.local`，按需填写 AI 服务配置。

```env
# AI Provider: gemini 或 doubao
AI_PROVIDER=doubao

# Google Gemini
GEMINI_API_KEY=your_gemini_key

# 豆包 Ark / 火山引擎
DOUBAO_API_KEY=your_doubao_key
# 模型 ID，默认 doubao-seed-2-1-pro-260628（Seed 2.1 Pro）
DOUBAO_MODEL=doubao-seed-2-1-pro-260628
# 旧版接入点方式仍兼容，DOUBAO_MODEL 优先
# DOUBAO_ENDPOINT_ID=your_endpoint_id
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 服务端口
PORT=3000
```

### 3. 启动开发环境

```bash
npm run dev
```

默认情况下：

- 前端开发服务运行在 `http://localhost:5173`
- 后端 API 服务运行在 `http://localhost:3000`

## 生产构建与启动

### 标准 Node.js 部署

```bash
npm run build
npm start
```

`npm run build` 会将前端构建到 `dist/`，`npm start` 会启动 Express 服务并托管静态资源与 API。

### Docker 部署

```bash
mkdir -p data
docker build -t bar-raiser-ai .
docker run -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -e AI_PROVIDER=doubao \
  -e DOUBAO_API_KEY=your_key \
  -e DOUBAO_MODEL=doubao-seed-2-1-pro-260628 \
  bar-raiser-ai
```

部署到火山引擎 VCI、VKE 或其他容器平台时，需要在容器环境变量中配置 `AI_PROVIDER`、`DOUBAO_API_KEY`、`DOUBAO_MODEL` 等必要参数（旧版 `DOUBAO_ENDPOINT_ID` 仍兼容），暴露 3000 端口，并为 `/app/data` 挂载持久化存储。否则容器重建会丢失用户、报告和简历源文件。

## 项目结构

```text
.
├── App.tsx                  # 前端主路由和核心页面入口
├── index.tsx                # React 挂载入口
├── components/              # 业务页面和可复用组件
├── src/context/             # 认证状态等 React Context
├── services/*.ts            # 前端 API 调用和浏览器侧工具
├── services/*.js            # 后端服务模块（含 db.js：SQLite 连接与建表）
├── scripts/                 # 开发启动和一次性数据迁移脚本
├── server.js                # Express 入口和 API 路由
├── data/                    # 本地运行时数据（app.db 等），不应提交真实内容
├── dist/                    # 前端构建产物
└── Dockerfile               # 容器构建配置
```

## 常用命令

```bash
npm run dev      # 同时启动前端 Vite 和后端 Express 开发服务
npm test         # 运行 Node.js 内置测试套件
npm run build    # 构建生产前端资源
npm start        # 启动生产服务
npm run preview  # 预览 Vite 构建结果
```

## 项目文档

- [架构说明](docs/architecture.md)：双模式数据流、路由、模块和数据模型。
- [接口接入指南](docs/integration-guide.md)：认证、分析、报告、简历附件和 Prompt API。
- [运维手册](docs/operator-runbook.md)：生产冒烟、数据保护和故障定位。
- [部署指南](DEPLOYMENT.md)：PM2、Bundle、Docker 和持久化部署。
- [当前交接状态](docs/handoff.md)：已交付范围、验证结果和剩余风险。

## 数据与安全说明

- `.env.local`、`.env` 和任何真实密钥文件不应提交到仓库。
- `.env.production` 当前作为生产配置模板维护；不要写入真实密钥。
- `data/app.db` 可能包含用户密码哈希、会话 token、报告、反馈和候选人材料，仅用于本地运行和部署持久化。
- 用户上传的简历源文件保存在 `data/uploads/resumes/<user-id>/` 的随机文件名下，附件元数据与 SHA256 存在 SQLite；该目录不由 Express 静态托管，只能通过带权限校验的报告下载接口访问。
- 简历文件先在浏览器解析；提交分析后，面试文本及可用的简历文本会发送给当前配置的 AI 服务。上传简历时，源文件与解析文本会保存在服务器，删除报告会同步清理对应源文件。
- 部署、备份和迁移时必须把整个 `data/` 作为敏感持久化数据处理，并限制服务器目录访问权限。
- 历史 JSON 存储已由 `scripts/migrate-to-sqlite.mjs` 一次性迁移到 SQLite；`data/*.migrated.bak` 是迁移备份，同样不要提交。
