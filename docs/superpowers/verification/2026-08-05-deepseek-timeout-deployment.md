# DeepSeek V4 Flash 与分析超时修复验证记录

## 结论

2026-08-05 已将生产分析 Provider 切换为 DeepSeek V4 Flash 正式版，显式启用思考模式和 `high` 思考强度。应用 SDK 超时为 600 秒、自动重试为 0；Nginx 仅对 `/api/analyze` 设置 660 秒读写超时。报告生成结束后写入不含用户标识和候选人材料的结构化耗时日志。

## 本地验证

- 分支：`codex/deepseek-timeout`
- 部署代码提交：`c8950307fd22c704d3f76503dabef69bd5accdea`
- `npm test`：100 项通过，0 失败
- `npm run build`：通过
- 主资源：`/assets/index-CH85fL1J.js`
- 本地 `dist` 全文件内容清单 SHA-256：`1e21dca0c22b40540b12cbb79d002365b19584bf661e3c89037fcbc04f0d8a75`
- 密钥模式扫描：仓库内未发现真实 `sk-...` Key

## 生产配置与验证

- DeepSeek `/models` 返回 `200`，配置模型 `deepseek-v4-flash` 存在。
- `.env.local` 中 8 个 DeepSeek/超时配置项各存在 1 次，文件权限为 `600`；验证过程未打印配置值。
- `nginx -t` 通过，Nginx 为 `active`；`/api/analyze` 的 `proxy_connect_timeout` 为 5 秒，`proxy_send_timeout` 和 `proxy_read_timeout` 均为 660 秒。
- PM2 `bar-raiser-ai` 为 `online`，启动日志确认 Provider 为 `deepseek`。
- HTTPS 首页为 `200`，HTTP 为 `301`，未认证报告与分析接口均为 `401`，公网 `3000` 端口不可访问。
- 生产 `dist` 全文件内容清单 SHA-256 与本地一致。
- CSP、HSTS、MIME、Referrer、Permissions Policy 和 Frame 防护响应头仍存在。

## 备份与回滚点

- 数据：`/root/bar-raiser-ai-backups/data-before-20260805-185421`
- 静态资源副本：`/root/bar-raiser-ai-backups/dist-before-20260805-185421`
- 静态资源原目录：`/root/bar-raiser-ai-backups/dist-live-before-20260805-185421`
- 环境配置：`/root/bar-raiser-ai-backups/env-local-before-20260805-185421`
- Nginx：`/root/bar-raiser-ai-backups/evalbar-nginx-before-20260805-185421`

## 验证边界

本次没有发起真实生产分析，因此没有创建合成报告，也没有产生额外模型推理费用。Key、模型存在性、服务启动、代理超时和静态发布均已验证；第一次真实用户分析结束后才会出现首条 `analysis_completed` 日志。历史报告只有完成时间，无法反推历史平均生成耗时。

## 豆包流式修复补充验证

- DeepSeek V4 Flash 首次真实招聘端报告成功耗时 54.67 秒。
- 切回 `doubao-seed-2-1-pro-260628` 后，同一份 34,771 字符输入在 300.811 秒失败，状态为 `AI_PROVIDER_ERROR`，未保存报告。
- 根因边界是非流式豆包调用超过 Node/Undici 或 Ark 网关的 300 秒首响应等待，不是浏览器或 Nginx 660 秒超时。
- 修复提交：`b361946104035f4b6abc31f68560984d081a0f8d`。
- 豆包改为流式接收并在服务端拼接最终正文；DeepSeek 调用方式不变，自动重试仍为 0。
- 300 秒响应头/响应体超时与上游 504 现在统一映射为 `AI_UPSTREAM_TIMEOUT`。
- 本地 `npm test`：102 项通过，0 失败；`npm run build` 通过；密钥模式扫描未发现真实 Key。
- 生产通过 Bundle 快进到修复提交，PM2 为 `online`，Provider 为 `doubao`，HTTPS 首页为 `200`，未认证分析接口为 `401`。
- 发布前数据备份：`/root/bar-raiser-ai-backups/data-before-doubao-stream-20260805-201038`。
- 未额外发起真实模型请求；流式修复的端到端效果等待用户使用同一材料复测。
