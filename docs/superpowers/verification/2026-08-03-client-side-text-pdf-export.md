# 客户端文字型 PDF 导出验证记录

## 验证结论

2026-08-03 在 Codex 内置浏览器完成验证。匿名 Recruiter 夹具为 3,588 个报告字符、6 个章节和 7 个维度；PDF 生成、文字提取、分页、直接下载和缓存复用均通过。

- 真正冷缓存 Blob ready 中位数：890.6 ms。
- HTTP/字体缓存已热后的 Blob ready 中位数：284.5 ms。
- Blob ready 后点击到触发下载中位数：0.3 ms。
- 两个中文字体只传输一次，总计 16,874,504 bytes（16.09 MiB）。
- 生成期间未观察到主线程超过 50 ms 的长任务。
- PDF 引擎只存在于独立 Worker chunk，首页入口不包含 `pdfmake` 或字体 URL。
- 三份验证 PDF 均为可提取文字，不包含整页截图。

## 环境

- 浏览器：Codex 内置 Chromium，User-Agent 为 Chrome 150.0.0.0。
- 系统：macOS，8 个逻辑处理器，浏览器上报 16 GB device memory。
- 服务：Vite 6.4.3 本地开发服务。
- 输入：匿名构造夹具，不含数据库 ID、姓名、公司或真实面试原文。

## 性能数据

### 冷缓存

为避免复用浏览器字体缓存，在 5 个独立本地端口分别首次打开验证页。每个端口的 Worker、字体 URL 和 HTTP 缓存均独立。

| 次数 | Blob ready | PDF 大小 |
|---|---:|---:|
| 1 | 1,074.5 ms | 206,845 bytes |
| 2 | 1,226.3 ms | 206,845 bytes |
| 3 | 712.8 ms | 206,845 bytes |
| 4 | 890.6 ms | 206,845 bytes |
| 5 | 698.5 ms | 206,845 bytes |
| 中位数 | 890.6 ms | 206,845 bytes |

### 热缓存

同一浏览器、同一页面连续新建 Worker；取 10 次测量的后 5 次作为热缓存样本。

| 次数 | Blob ready | PDF 大小 |
|---|---:|---:|
| 1 | 283.6 ms | 206,845 bytes |
| 2 | 290.1 ms | 206,845 bytes |
| 3 | 279.4 ms | 206,845 bytes |
| 4 | 284.5 ms | 206,845 bytes |
| 5 | 297.7 ms | 206,845 bytes |
| 中位数 | 284.5 ms | 206,845 bytes |

### 点击下载

Blob ready 后连续 5 次测得 0.3、0.3、0.2、0.3、0.3 ms，中位数 0.3 ms。页面刚打开就点击时等待同一个生成任务，412.8 ms 后只触发 1 次下载。Blob ready 后双击，下载计数仍为 1。

### 内存与主线程

- 浏览器不提供 `measureUserAgentSpecificMemory`，因此无法得到包含 Worker 的可靠进程峰值。
- `performance.memory` 只能观察主页面堆；10 次样本最大正向变化为 244,984 bytes，不能替代 Worker 峰值结论。
- `PerformanceObserver` 未记录到主线程长任务，说明字体解析和 PDF 排版没有阻塞报告页面主线程。

## 构建与资源

生产构建结果：

| 文件 | 大小 | PDF 内容 |
|---|---:|---|
| `dist/assets/index-BYxbUDod.js` | 1,482,670 bytes | 无 |
| `dist/assets/reportPdf.worker-BvCZpIHk.js` | 1,016,064 bytes | 有 |
| `dist/fonts/NotoSansSC-Regular-v1.otf` | 8,331,336 bytes | Worker 首次生成时加载 |
| `dist/fonts/NotoSansSC-Bold-v1.otf` | 8,543,168 bytes | Worker 首次生成时加载 |

Worker 将两份首次下载的字体二进制直接写入 PDF 引擎内存文件系统，排版时不再二次请求字体。

## PDF 内容与逐页视觉检查

| 夹具 | 页数 | 文件大小 | 提取字符 | 缺失/重复标记 | 整页图片 |
|---|---:|---:|---:|---:|---:|
| Recruiter 3,588 字 | 4 | 206,845 bytes | 3,594 | 0 / 0 | 0 |
| Candidate | 2 | 155,022 bytes | 770 | 0 / 0 | 0 |
| 超长连续段落 | 6 | 221,806 bytes | 6,229 | 0 / 0 | 0 |

共渲染并逐页检查 12 页。首次检查发现 Candidate 孤立问题标题、Recruiter 章节底色断裂和超长卡片续页边框；修复后重新生成并检查全部页面，未发现截字、重叠、缺字方框、孤立标题或页脚覆盖。

## 边界交互

- Blob ready 后单击：直接通过隐藏的 `<a download>` 下载，不打开打印或系统存储窗口。
- 页面刚打开立即点击：复用正在执行的 Worker，最终只下载一次。
- 连续双击：250 ms 下载锁保证只触发一次。
- Worker 失败：控制器进入 `error`，下一次 `prepare` 创建新 Worker；自动化测试覆盖重试。
- 报告切换/离开页面：Hook 清理会终止 Worker、撤销对象 URL 并清空旧 Blob。
- Candidate：不输出招聘匹配等级；Recruiter：保留整体和维度评分。
- 旧 `html2pdf/html2canvas` CDN、截图导出和系统打印路径已移除。

## 未覆盖项

- 未使用真实候选人数据库正文做验证；使用同长度匿名夹具守住敏感数据边界。
- Chromium 当前未开放包含 Worker 的精确峰值内存 API，因此没有把“低于 80 MB”写成已确认结论。已确认字体传输 16.09 MiB、主线程无长任务，且 Worker 在 Blob 完成后立即终止。
- 本地验证不能覆盖每位用户浏览器的企业下载策略；产品代码本身不会主动打开打印或系统存储窗口。
