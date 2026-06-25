# Bar Raiser AI

Bar Raiser AI 是一个面向面试记录分析的人岗匹配工具。它支持上传或粘贴面试材料，基于 STAR 方法和岗位胜任力模型生成结构化评估报告，并沉淀报告、反馈和 Prompt 迭代数据。

当前项目由 React 前端和 Node.js/Express 后端组成，AI 能力可通过环境变量在 Google Gemini 与豆包 Ark 之间切换。

## 核心功能

- **面试材料输入**：支持上传 `.txt`、`.md`、`.pdf`、`.docx` 文件，也支持直接粘贴文本。
- **人岗匹配分析**：围绕目标岗位、胜任力要求和面试记录生成结构化评估报告。
- **多模型支持**：通过 `AI_PROVIDER` 在 `gemini` 和 `doubao` 之间切换。
- **登录与权限**：支持账号登录和飞书 OAuth 登录；普通用户只能访问自己的报告，管理员可查看全量报告和反馈。
- **报告管理**：支持查看历史报告、复制分享链接、删除报告，并导出 Markdown 或 PDF。
- **反馈闭环**：用户可对报告评分并提交问题反馈；管理员可查看反馈并用于 Prompt 迭代。
- **服务端密钥管理**：AI Key 和飞书凭证只在服务端读取，不暴露给浏览器端代码。

## 技术栈

- 前端：React、TypeScript、Vite、React Router、Tailwind CDN、lucide-react
- 后端：Node.js ESM、Express
- AI 服务：Google Gemini 或豆包 Ark
- 存储：本地 JSON 文件，运行时数据位于 `data/`

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env.local`，按需填写 AI 服务和飞书 OAuth 配置。

```env
# AI Provider: gemini 或 doubao
AI_PROVIDER=doubao

# Google Gemini
GEMINI_API_KEY=your_gemini_key

# 豆包 Ark / 火山引擎
DOUBAO_API_KEY=your_doubao_key
DOUBAO_ENDPOINT_ID=your_endpoint_id
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 服务端口
PORT=3000
```

如需启用飞书 OAuth，请补充飞书应用相关环境变量，并参考 `FEISHU_OAUTH_SETUP.md`。

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
docker build -t bar-raiser-ai .
docker run -p 3000:3000 \
  -e AI_PROVIDER=doubao \
  -e DOUBAO_API_KEY=your_key \
  -e DOUBAO_ENDPOINT_ID=your_endpoint_id \
  bar-raiser-ai
```

部署到火山引擎 VCI、VKE 或其他容器平台时，需要在容器环境变量中配置 `AI_PROVIDER`、`DOUBAO_API_KEY`、`DOUBAO_ENDPOINT_ID` 等必要参数，并暴露 3000 端口。

## 项目结构

```text
.
├── App.tsx                  # 前端主路由和核心页面入口
├── index.tsx                # React 挂载入口
├── components/              # 业务页面和可复用组件
├── src/context/             # 认证状态等 React Context
├── services/*.ts            # 前端 API 调用和浏览器侧工具
├── services/*.js            # 后端服务模块
├── server.js                # Express 入口和 API 路由
├── data/                    # 本地运行时数据，不应提交真实内容
├── dist/                    # 前端构建产物
├── Dockerfile               # 容器构建配置
└── FEISHU_OAUTH_SETUP.md    # 飞书 OAuth 配置说明
```

## 常用命令

```bash
npm run dev      # 同时启动前端 Vite 和后端 Express 开发服务
npm run build    # 构建生产前端资源
npm start        # 启动生产服务
npm run preview  # 预览 Vite 构建结果
```

## 数据与安全说明

- `.env.local`、`.env.production` 和任何真实密钥文件不应提交到仓库。
- `data/` 下的 JSON 文件可能包含用户、报告、反馈或候选人材料，仅用于本地运行和部署持久化。
- 当前本地 JSON 存储适合 MVP；如果用于多人生产、审计或高并发场景，应先设计数据库、权限审计和数据迁移方案。
