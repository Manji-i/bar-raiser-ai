# Eval Bar AI 接口接入指南

## 1. 适用范围

本文面向需要调用 Eval Bar AI HTTP API 的前端或集成方。当前服务没有独立 SDK，所有接口由 Express 提供，默认与页面同源。

示例使用：

```bash
BASE_URL=http://localhost:3000
COOKIE_JAR="$(mktemp)"
```

不要把真实 token、候选人材料或简历写进代码仓库、命令历史或共享日志。

## 2. 认证

网页端使用同源 HttpOnly Cookie，会话有效期为 12 小时。Cookie 不能被前端 JavaScript 读取；注册和网页登录响应只返回用户信息，不返回 Token。

非浏览器集成必须显式调用 `/api/auth/token` 获取短期 Bearer Token，业务接口使用：

```http
Authorization: Bearer <token>
```

### 注册

```bash
curl -X POST "$BASE_URL/api/auth/register" \
  -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo-user","password":"至少十位的合成密码"}'
```

### 登录

```bash
curl -X POST "$BASE_URL/api/auth/login" \
  -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo-user","password":"至少十位的合成密码"}'
```

### 非浏览器 Token

```bash
token_response="$(curl -sS -X POST "$BASE_URL/api/auth/token" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo-user","password":"至少十位的合成密码"}')"
```

响应中的 Token 只显示一次，数据库只保存其 SHA-256 摘要。调用方必须在受保护的内存或密钥存储中使用，不能写入命令历史或日志。

### 当前用户与退出

```http
GET  /api/auth/me
POST /api/auth/logout
```

网页端请求应携带 Cookie；命令行可用 `curl -b "$COOKIE_JAR"`。非浏览器集成也可以继续发送 Bearer Token。

当前注册和登录 API 不接收、也不在 token 中保存角色。网页端选择的“提升自己 / 判断他人”仅由 `AuthContext` 在浏览器侧锁定，用于产品导航和历史展示；API 调用方必须显式传递并自行保持正确的 `analysisMode`。该值不是服务端权限声明，同一账号仍可请求本人另一模式的数据。需要服务端强隔离时应升级为 token 绑定角色，具体见[未来需迭代内容](未来需迭代内容.md)。

## 3. 发起分析

统一接口：

```http
POST /api/analyze
```

响应：

```json
{
  "result": "Markdown 报告",
  "reportId": "report-id"
}
```

### 3.1 Candidate：无简历文件

职位名称与面试记录必填，JD 和简历选填。

```bash
curl -X POST "$BASE_URL/api/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "analysisMode":"candidate",
    "jobTitle":"高级产品经理",
    "jobDescription":"负责增长策略与跨团队交付",
    "transcript":"这里放合成或已获授权的面试记录",
    "fileName":"interview.txt",
    "resumeText":"",
    "resumeParseStatus":"not_provided"
  }'
```

### 3.2 Candidate：上传简历源文件

支持 PDF、DOCX、TXT，最大 10 MB。使用 multipart 时不要手动指定 `Content-Type` 边界。

```bash
curl -X POST "$BASE_URL/api/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -F analysisMode=candidate \
  -F jobTitle='高级产品经理' \
  -F jobDescription='负责增长策略与跨团队交付' \
  -F transcript='这里放合成或已获授权的面试记录' \
  -F fileName=interview.txt \
  -F resumeText='浏览器解析或人工确认后的文本' \
  -F resumeParseStatus=manual \
  -F resumeFile=@/absolute/path/to/resume.pdf
```

`resumeParseStatus` 可用值：

| 值 | 含义 | 是否进入模型 |
|---|---|---|
| `usable` | 规则判断可用 | 是 |
| `manual` | 用户人工确认 | 是 |
| `low_quality` | 文本过少或乱码偏高 | 否 |
| `empty` | 未识别到足够正文 | 否 |
| `not_provided` | 未提供简历 | 否 |

上传合法源文件但浏览器解析失败时，可以保留文件并以 `empty` 提交；用户补充文本后改为 `manual`。

分析请求的 JSON 请求体上限为 512 KB。字段上限为：`jobTitle` 200、`jobDescription` 50000、`competencies` 5000、`transcript` 100000、`resumeText` 100000、`fileName` 255 个字符。multipart 只接受 1 个文件、7 个文本字段和 8 个分段，单个文本字段最大 200 KB。

### 3.3 Recruiter

职位名称、胜任力要求和面试记录必填。旧客户端可以不传 `analysisMode`，但新接入应显式发送 `recruiter`。

```bash
curl -X POST "$BASE_URL/api/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "analysisMode":"recruiter",
    "jobTitle":"高级产品经理",
    "competencies":"战略思考、数据分析、跨团队协作",
    "transcript":"这里放合成或已获授权的面试记录",
    "fileName":"interview.txt"
  }'
```

## 4. 报告

| 接口 | 说明 |
|---|---|
| `GET /api/reports?analysisMode=candidate` | 当前用户 Candidate 报告 |
| `GET /api/reports?analysisMode=recruiter` | 当前用户 Recruiter 报告 |
| `GET /api/reports` | 兼容接口，返回当前用户全部报告 |
| `GET /api/reports/:id` | 报告详情；按所有者或管理员授权 |
| `DELETE /api/reports/:id` | 删除报告并清理简历附件 |
| `GET /api/reports/:id/resume` | 下载受保护的简历源文件 |

列表与详情会返回 `analysisMode`、`jobDescription`、`resumeFileName` 和 `resumeParseStatus`，但不会返回 `resumeText`、附件相对路径或磁盘绝对路径。

下载示例：

```bash
curl -L "$BASE_URL/api/reports/<report-id>/resume" \
  -H "Authorization: Bearer $TOKEN" \
  -o resume-download.pdf
```

客户端不得自己拼接或提交服务器文件路径。

## 5. 反馈

```http
POST /api/feedback
```

两种模式共享接口，但应发送报告自身的 `analysisMode`。Candidate 反馈围绕核心问题、证据、示范回答和行动建议；Recruiter 反馈围绕评分和人岗匹配。

管理员读取全部反馈：

```http
GET /api/feedback
```

## 6. Prompt 管理（管理员）

```http
GET /api/prompt/current?analysisMode=candidate
GET /api/prompt/current?analysisMode=recruiter
PUT /api/prompt/current
POST /api/prompt/iterate
```

更新请求：

```json
{
  "analysisMode": "candidate",
  "content": "完整 Candidate System Prompt"
}
```

每次更新创建新版本。`POST /api/prompt/iterate` 只支持 Recruiter；Candidate 请求会返回 `400`。

## 7. 管理员报告

```http
GET /api/admin/reports?analysisMode=candidate
GET /api/admin/reports?analysisMode=recruiter
```

只有管理员可以调用。未传模式时保持兼容行为。

## 8. 常见响应

| 状态码 | 常见原因 |
|---|---|
| `200` | 请求成功 |
| `400` | 模式非法、必填字段缺失、文件类型/签名/大小不合法 |
| `401` | 缺少或无效的浏览器会话 Cookie / Bearer Token |
| `403` | 非管理员调用管理接口 |
| `404` | 报告或简历不存在，或用户无权访问该报告 |
| `413` | JSON、multipart 字段/分段或简历文件超过资源上限；按响应 `code` 区分 |
| `429` | 请求窗口额度耗尽或同一用户已有分析在途；按 `Retry-After` 和响应 `code` 处理 |
| `500` | AI、持久化或内部服务失败 |

错误响应使用 `{ "error": "..." }`。客户端不应依赖完整英文错误文案做业务分支，应优先根据状态码处理。

浏览器 API 必须保持同源；生产允许 `https://evalbar.cn` 和 `https://www.evalbar.cn`，本地开发允许 Vite 的 `localhost:5173` 与 `127.0.0.1:5173`。服务端不返回跨域通配符，带恶意 `Origin` 的写请求返回 `403 ORIGIN_NOT_ALLOWED`。无浏览器 Origin 的受控集成仍可使用 Bearer Token。

## 9. 隐私与数据责任

- 文件正文先在浏览器解析，但提交分析后相关文本会发送给当前配置的 AI 服务。
- 上传简历时，源文件与解析文本会保存在服务器受保护目录和 SQLite 中。
- 集成方应在上传前取得候选人授权，并避免把真实材料发送到测试环境。
- 日志、监控、反馈和错误上报不得包含面试原文、简历正文、token 或服务端路径。
- 删除报告会清理关联简历源文件；删除行为不可恢复，调用前应由产品层确认。
