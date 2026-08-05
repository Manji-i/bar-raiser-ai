# 2026-08-05 安全加固验证台账

## 1. 验证结论

本次在 `codex/security-hardening` 隔离 worktree 完成代码、自动化测试、生产构建和本机随机端口 HTTP 回归。未连接生产 AI，未读取候选人材料，未修改生产配置，也未对现有用户、报告、反馈、附件或 Prompt 执行 `UPDATE`、`DELETE`、迁移或清理。

当前不能把全部漏洞标记为“已关闭”：SEC-01、SEC-07、SEC-08、SEC-09 仍需要发布、Nginx/防火墙配置和外部复测。其余项目仅达到“本地验证通过”，生产尚未部署。

## 2. 实施提交

| Task | 提交 | 主题 |
|---|---|---|
| Task 1 | `4f0b1c5` | `fix: bind application server to loopback` |
| Task 2 | `2981b41` | `feat: add secure credential primitives` |
| Task 3 | `659949f` | `fix: harden users sessions and admin bootstrap` |
| Task 4 | `da9a70d` | `fix: move browser authentication to secure cookies` |
| Task 5 | `ac1c211` | `fix: rate limit authentication and analysis` |
| Task 6 | `a1dbabd` | `fix: bound analysis and upload resources` |
| Task 7 | `8b9237a` | `fix: validate and safely render feedback` |
| Task 8 | `edf9ace` | `fix: constrain model inputs and markdown output` |
| Task 9 | `b8fa4d9` | `fix: harden browser and HTTP security boundaries` |

## 3. 漏洞—修复—验证闭环

| 编号 | 关联提交 | 自动化测试 | 隔离复测 | 生产验证 | 状态 | 残余风险 |
|---|---|---|---|---|---|---|
| SEC-01 | `4f0b1c5` | 默认 `127.0.0.1`、显式 `HOST` 覆盖和文档 HTTPS 静态测试通过 | 未对生产端口重复探测 | 未执行：需部署并从外部确认域名/IP `:3000` 拒绝连接、80 只跳转 443 | 待生产验证 | Docker 必须显式 `HOST=0.0.0.0`；防火墙/安全组不在代码控制范围 |
| SEC-02 | `ac1c211`、`a1dbabd` | 窗口额度、恢复、并发释放、输入预算测试通过 | 随机本机端口：第 6 次注册和第 21 次分析均为 `429`；分析使用缺失字段，AI 执行数为 0 | 未执行：需受控低频/突发验证并确认供应商预算告警 | 本地验证通过 | 额度在单个 Node 进程内，重启重置；多实例前必须迁移共享存储 |
| SEC-03 | `2981b41`、`659949f`、`da9a70d` | scrypt、新旧哈希兼容、Token 摘要/12 小时过期、Cookie 属性、前端无 Token 存储测试通过 | 1 位密码注册 `400`；旧明文 Token 和 13 小时 Token 均为 `401`；事务回滚后用户行数不变 | 未执行：部署后旧会话应 `401`，原账号重新登录并检查 Cookie | 本地验证通过，残余风险已记录 | 数据库中的历史无盐 SHA-256 密码哈希按“不改现有数据”要求保留；只有主动改密或未来获批迁移后消除 |
| SEC-04 | `659949f` | 空库首注册为普通用户；空库 bootstrap 成功、非空库失败关闭 | HTTP 首注册响应 `isAdmin=false`；测试事务回滚 | 未执行：只读确认现有管理员未改变；生产不得运行 bootstrap | 本地验证通过 | 初始化脚本依赖运维在真正空库中一次性执行，不能替代权限审计 |
| SEC-05 | `edf9ace` | 不可信输入契约幂等、输出长度/Markdown 标题、危险 URL 和图片禁用测试通过 | 恶意文本仍位于 `<input_json>`；`javascript:`/`data:` 返回空，Markdown 图片组件不渲染 | 未执行：只用离线报告夹具观察浏览器网络，不调用真实 AI | 本地验证通过，残余风险已记录 | Prompt Injection 是概率性模型风险，只能通过系统契约、结构化输入、输出校验和渲染隔离分层缓解 |
| SEC-06 | `8b9237a` | 评分、评论、标签白名单/数量测试；历史异常值归一化且原值保持测试通过 | `rating=999`/字符串 issues 返回 `400 INVALID_FEEDBACK`；历史 `rating=999` 仅响应归一为 0，数据库仍为 999 | 未执行：合法反馈和管理员页需用获批合成报告验收 | 本地验证通过 | 历史异常反馈原值按要求保留，不自动修复 |
| SEC-07 | `b8fa4d9` | CSP、HSTS、frame、nosniff、Referrer Policy 测试；构建入口无 CDN/import map | `npm run build` 产物只引用本地 JS/CSS/字体 | 未执行：需检查真实 HTTPS 响应头、CSP 控制台和页面主流程 | 待生产验证 | Nginx 可能覆盖/重复响应头；必须以外部响应为准 |
| SEC-08 | `a1dbabd`、`ac1c211` | JSON 512 KB、字段字符预算及 Multer files/fields/parts/fieldSize/fileSize 测试通过 | 超 7 字段、超 200 KB 字段、超 10 MB 文件均返回 `413`，事务回滚 | 未执行：需配置 Nginx `client_max_body_size`，只做边界请求，不做生产压力测试 | 待生产验证 | Node 仍采用内存上传；反向代理上限和并发容量必须共同约束 |
| SEC-09 | `b8fa4d9` | Origin 白名单及无 `cors` 依赖/通配符测试通过 | `https://evil.example` 写请求为 `403 ORIGIN_NOT_ALLOWED`，无 ACAO；未知预检不获跨域许可 | 未执行：外部恶意 Origin 不得获得 ACAO，两个正式域名写请求需正常 | 待生产验证 | 无 Origin 的受控集成继续允许 Bearer Token，需保护集成凭据 |
| SEC-10 | `4f0b1c5`、`b8fa4d9` | HTTPS 文档、API JSON 回退、注册模糊错误静态测试通过 | 重复注册只返回 `Registration failed`；未知 `/api/*` 返回 JSON `404 API_NOT_FOUND` | 未执行：部署后从公网复核未知 API、注册错误和规范域名 | 本地验证通过 | 注册接口仍会表达“注册成功/失败”这一产品必需结果，不构成完全隐藏账号可用性的证明 |

## 4. 自动化与构建证据

2026-08-05 在隔离 worktree 执行：

```bash
npm test
npm run build
audit_exit=0
npm audit --json > /tmp/evalbar-security-audit.json || audit_exit=$?
test "$audit_exit" -eq 0 -o "$audit_exit" -eq 1
git diff --check
git status -sb
```

结果：

- `npm test`：退出码 0，86 项通过，0 失败。
- `npm run build`：退出码 0；`dist/index.html` 只引用本地构建资源。Vite 仍提示主 bundle 超过 500 kB，以及环境模板中的 `NODE_ENV=production` 提示；两者不是本次安全测试失败。
- `npm audit --json`：退出码 1；0 critical、2 high，均由同一 React Router RSC Action 公告派生，见观察项 OBS-01。
- `git diff --check`：退出码 0。
- 验证前 `git status -sb`：分支干净；写入本台账后将在最终提交后再次执行完整验证。

## 5. 隔离 HTTP 回归证据

执行方式：`node --input-type=module <<'NODE'` 启动 `app.listen(0, '127.0.0.1')`，只向随机本机端口发送合成请求；SQLite 写入包含在 `BEGIN`/`ROLLBACK` 中。命令退出码均为 0，且两轮检查均为 `userRowsBefore=0`、`userRowsAfter=0`。

第一轮摘要：

```text
evil Origin write=403; unknown API=404; weak registration=400
first registration admin=false; duplicate registration=generic error
registration limit=429; invalid feedback=400
legacy plaintext token=401; expired token=401
analysis limit=429; AI requests executed=0
```

第二轮摘要：

```text
multipart fields=413; multipart field size=413; multipart file size=413
isolated database rollback=true
```

未记录合成密码、Cookie 或 Token 原文。测试没有读取报告、反馈或附件正文。

## 6. 数据保护核对

- 本次没有数据库 schema 变更或迁移。
- 用户注册逻辑不更新历史密码哈希；旧 SHA-256 仅只读验证。
- 新会话只新增摘要格式 Token；旧明文 Token 行不清理、不改写，但不能再认证。
- 历史异常反馈只在读取响应中归一化，测试确认数据库原值不变。
- 管理员 bootstrap 仅在空库测试夹具执行；未在生产或现有项目数据上运行。

## 7. 依赖观察项

| 编号 | 当前证据 | 判断 | 后续触发条件 |
|---|---|---|---|
| OBS-01 | `npm audit` 报告 `react-router`/`react-router-dom` 的 `GHSA-qwww-vcr4-c8h2`；官方公告标题和说明限定 RSC Mode/unstable RSC code paths，受影响 `>=7.12.0 <8.3.0`，修复版本为 `8.3.0`；`npm view react-router-dom version` 当前为 `7.18.2`；源码只出现 `BrowserRouter`，未出现 Router Action/RSC API | 观察项，当前架构不可利用；不执行 `npm audit fix --force`，不为消除审计数字跨大版本升级 | 引入 RSC/Action、公告影响范围扩大、或 npm 发布可兼容修复版本时立即复核 |

官方公告：<https://github.com/advisories/GHSA-qwww-vcr4-c8h2>

## 8. 生产闭环清单（尚未授权执行）

1. 在本地/CI 保留已验证 `dist/`，记录 SHA-256；生产机禁止构建。
2. 先备份完整 `data/`，再通过 Bundle/暂存目录更新后端代码、运行时依赖和构建产物，校验后原子替换。
3. 重启 PM2；预期旧会话失效，用户需要重新登录。不得运行 `admin:bootstrap`。
4. Nginx 增加与应用一致的安全头和请求体上限，`nginx -t` 通过后 reload。
5. 云安全组和主机防火墙关闭公网 `3000/tcp`，仅保留 Nginx 到 `127.0.0.1:3000`。
6. 从外部验证 80→443、HTTPS 响应头、`evalbar.cn:3000`/IP`:3000` 拒绝、恶意 Origin 无 ACAO、未知 API JSON 404、正常登录/页面/小文件上传。
7. 真实 AI、生产注册、反馈、报告创建/删除和跨账号附件测试仍需单独的数据与费用授权。
