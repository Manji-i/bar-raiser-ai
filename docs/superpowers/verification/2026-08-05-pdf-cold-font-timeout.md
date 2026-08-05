# PDF 冷字体超时修复验证记录

## 问题与根因

生产站点使用 HTTPS 后，点击“导出 PDF”仍可能提示生成失败。线上主资源、PDF Worker、两份同源字体和 CSP 均可正常加载；使用相同 CSP 的受控 Worker 探针也能生成 PDF Blob。

真实生产网络首次下载 `NotoSansSC-Regular-v1.otf` 和 `NotoSansSC-Bold-v1.otf` 分别约需 22.23 秒和 15.02 秒。客户端原先把字体下载、pdfmake 初始化和 PDF 排版共用一个 15 秒 Worker 超时，因此冷缓存时会在字体完成前终止 Worker，重试也无法完成缓存预热。

## 修复范围

- 将 PDF Worker 准备和探针超时统一从 15 秒调整为 60 秒。
- 对带内容哈希的构建资源与版本化 PDF 字体返回 `Cache-Control: public, max-age=31536000, immutable`。
- 保持 `index.html` 非强缓存，保持报告页后台预生成 Blob 和 `<a download>` 直接下载交互不变。
- 不修改报告内容、A 版布局、字体文件、数据库或环境配置。

## 验证结果

- 修复前新增用例准确失败：实际超时为 `15000`，静态资源缓存 helper 不存在。
- 修复后针对性测试 8/8 通过。
- 本地完整测试 88/88 通过，`npm run build` 成功；主资源为 `/assets/index-HWNnjYkV.js`。
- 生产服务器完整测试 88/88 通过；服务器未执行 Vite 构建。
- 生产代码为 `55921f7020d1c9a4cc07e2c3a0d526ed1bab4574`，PM2 进程 `bar-raiser-ai` 在线。
- `https://www.evalbar.cn/` 返回 `200`，未认证报告接口返回 `401`；主资源和两份字体均返回一年 `immutable` 缓存头。
- 已登录报告页实际点击后生成有效 PDF：6 页、A4、294,658 字节、PDF 1.3；未出现失败弹窗。

## 发布与回滚点

- GitHub 提交：`55921f7 fix: allow cold PDF font preparation`
- 完整数据备份：`/root/bar-raiser-ai-backups/data-before-20260805-161503`
- 静态资源备份：`/root/bar-raiser-ai-backups/dist-before-20260805-161541`
- 本地 `dist` 归档 SHA-256：`cb589be51f6056e12eb0f241f722065678e5c8fd649991e19908c8c56fb952b8`
