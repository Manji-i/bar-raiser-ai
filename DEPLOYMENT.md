# 部署指南

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 构建 Docker 镜像
docker build -t bar-raiser-ai .

# 2. 准备生产环境配置
cp .env.example .env
# 编辑 .env 文件，填入实际的生产环境配置

# 3. 创建数据目录
mkdir -p data

# 4. 运行容器
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.env:/app/.env \
  --name bar-raiser-ai \
  bar-raiser-ai
```

### 方式二：直接部署

```bash
# 1. 安装依赖
npm install --only=production

# 2. 构建前端（已完成）
# npm run build

# 3. 准备环境配置
cp .env.example .env
# 编辑 .env 文件，填入实际的生产环境配置

# 4. 确保 data 目录存在
mkdir -p data

# 5. 启动服务
npm start
```

## 📋 环境配置说明

### 必需配置项

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `PORT` | 服务端口 | `3000` |
| `NODE_ENV` | 环境模式 | `production` |
| `FRONTEND_URL` | 前端访问地址 | `https://your-domain.com` |
| `AI_PROVIDER` | AI 服务提供商 | `doubao` |
| `DOUBAO_ENDPOINT_ID` | 豆包 Endpoint ID | `ep-xxx` |
| `DOUBAO_API_KEY` | 豆包 API Key | `xxx` |

### 飞书 OAuth 配置（可选）

| 配置项 | 说明 |
|--------|------|
| `FEISHU_APP_ID` | 飞书应用 ID |
| `FEISHU_APP_SECRET` | 飞书应用密钥 |
| `FEISHU_REDIRECT_URI` | 回调地址 |

详细配置说明请参考 [FEISHU_OAUTH_SETUP.md](FEISHU_OAUTH_SETUP.md)

## 🔐 安全建议

1. **环境变量**：生产环境请使用环境变量管理工具，不要提交敏感信息到 Git
2. **数据持久化**：确保 data 目录有持久化存储
3. **HTTPS**：生产环境建议使用 HTTPS
4. **访问控制**：配置适当的访问控制和防火墙规则

## 📊 数据管理

应用数据存储在 `data/` 目录：
- `users.json` - 用户数据
- `reports.json` - 评估报告
- `feedback.json` - 用户反馈
- `systemPrompt.json` - 系统提示词

## 🔄 更新部署

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建前端
npm run build

# 3. 重启服务（Docker）
docker stop bar-raiser-ai
docker rm bar-raiser-ai
docker build -t bar-raiser-ai .
docker run -d ...  # 同上方启动命令

# 或者重启服务（直接部署）
# 停止旧进程，重新 npm start
```

## 🛠️ 故障排查

### 端口被占用
```bash
# 查找占用端口的进程
lsof -i :3000
# 或者修改 .env 中的 PORT
```

### 依赖问题
```bash
# 重新安装依赖
rm -rf node_modules
npm install
```

### AI 服务问题
检查 API Key 配置是否正确，查看服务端日志
