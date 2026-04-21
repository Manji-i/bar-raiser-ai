# 飞书 OAuth 登录设置指南

## 1. 在飞书开放平台创建应用

### 步骤 1：注册飞书开放平台
访问 [飞书开放平台](https://open.feishu.cn/)，登录并进入开发者后台。

### 步骤 2：创建企业自建应用
1. 点击「创建应用」→「企业自建应用」
2. 填写应用名称和描述
3. 点击「创建」

### 步骤 3：获取凭证
在「凭证与基础信息」页面找到：
- **App ID** (`FEISHU_APP_ID`)
- **App Secret** (`FEISHU_APP_SECRET`)

## 2. 配置安全设置

### 配置重定向 URL
在「安全设置」→「重定向 URL」中添加：
```
http://localhost:3000/api/auth/feishu/callback
```
或者生产环境的实际 URL：
```
https://yourdomain.com/api/auth/feishu/callback
```

## 3. 配置权限

在「权限管理」页面，添加以下权限：
- `contact:user.id:readonly` - 获取用户 ID
- `contact:user.email:readonly` - 获取用户邮箱
- `contact:user.name:readonly` - 获取用户姓名
- `contact:user.avatar:readonly` - 获取用户头像

## 4. 发布应用

在「版本管理与发布」页面创建版本并发布到企业。

## 5. 环境变量配置

复制 `.env.example` 为 `.env.local`，配置飞书相关变量：

```env
# 飞书OAuth配置
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
FEISHU_REDIRECT_URI=http://localhost:3000/api/auth/feishu/callback
FRONTEND_URL=http://localhost:5173
```

## 6. 测试登录

1. 启动服务
2. 访问首页，点击「使用飞书登录」
3. 完成飞书授权
4. 自动登录并创建账户

## 7. 用户体验说明

- 第一个使用飞书登录的用户自动成为管理员
- 后续用户自动创建账户（无需密码）
- 用户信息（姓名、邮箱、头像）从飞书同步

## 8. 故障排查

### 问题：重定向 URL 不匹配
检查 `.env` 中的 `FEISHU_REDIRECT_URI` 与飞书开放平台配置是否一致。

### 问题：权限不足
确保在飞书开放平台申请了足够的权限，并且应用已发布。

### 问题：登录后看不到飞书按钮
检查环境变量是否正确配置，重新启动服务。
