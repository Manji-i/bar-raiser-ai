# 浏览器端文字 PDF 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用浏览器端文字排版、Web Worker 和预生成 Blob 替换截图切页导出，在保留 A 版视觉层级的同时消除文字截断，并让准备完成后的点击直接下载。

**Architecture:** 先把 `ReportView.tsx` 中的报告解析提取为无 React 依赖的统一模型，再由 Worker 内的 `pdfmake` 文档构建器生成 PDF Blob。页面侧控制器在报告首屏显示后预生成并缓存 Blob，按钮点击只复用当前任务或已完成结果；Candidate 与 Recruiter 共用管线但保持不同语义。

**Tech Stack:** React 19、TypeScript、Vite 6 Web Worker、`pdfmake 0.3.11`、`@types/pdfmake 0.3.3`、Noto Sans SC Subset OTF、Node Test Runner、`pdfjs-dist`、Poppler

**执行状态（2026-08-03）：** Task 1–8 已完成、合并并部署生产；下方未勾选项保留为历史执行顺序，不代表当前未完成。最终事实与验证数据以 [`../verification/2026-08-03-client-side-text-pdf-export.md`](../verification/2026-08-03-client-side-text-pdf-export.md) 和 [`../../handoff.md`](../../handoff.md) 为准。

---

## 任务清单

| 任务 | 主要工作 | 主要产出 | 依赖关系 |
|---|---|---|---|
| Task 1 | 验证 Worker、`pdfmake` 和中文字体组合 | 可返回中文 PDF Blob 的最小 Worker、锁定依赖与字体 | 首要阻断门；失败即停止 |
| Task 2 | 提取统一报告结构 | Recruiter/Candidate 纯解析模块与匿名长报告夹具 | 依赖 Task 1 |
| Task 3 | 实现 A 版 PDF 文档构建器 | A4 样式、两种模式映射、分页规则单测 | 依赖 Task 2 |
| Task 4 | 实现后台预生成与 Blob 生命周期 | Worker 完整协议、单任务复用、下载、重试和释放 | 依赖 Task 1、Task 3 |
| Task 5 | 接入报告页并移除截图路径 | 一键下载 UI、懒加载、移除 `html2pdf` | 依赖 Task 4 |
| Task 6 | 建立真实 PDF 内容与视觉验证 | 可重复生成的匿名 PDF、文字完整性和逐页渲染检查 | 依赖 Task 3–5 |
| Task 7 | 验证性能、资源隔离与边界行为 | 冷热缓存数据、首页 chunk 审计、最长报告压力结果 | 依赖 Task 5–6 |
| Task 8 | 完整回归与交付记录 | 全量测试、构建、文档同步和最终状态审计 | 依赖 Task 1–7 |

Task 1 是硬门槛：必须先证明 Vite 生产构建中的 Module Worker 能加载 `pdfmake`、两个同源 OTF 字体并返回包含中文的 Blob，再继续其余任务。Task 2–5 是实现主链；Task 6–7 分别验证正确性和性能；Task 8 只做集成收口。

## 文件结构

新增或重构后的职责如下：

- `services/reportDocumentModel.ts`：Markdown 与模式化报告的纯解析、统一模型和现有网页解析接口。
- `services/pdf/reportPdfDocument.ts`：`ReportDocumentModel -> TDocumentDefinitions`，只维护 PDF 内容、视觉 token 和分页。
- `services/pdf/reportPdfProtocol.ts`：主线程与 Worker 的消息类型和运行时守卫。
- `services/pdf/reportPdf.worker.ts`：字体注册、`pdfmake` 生成和错误归一化。
- `services/pdf/reportPdfClient.ts`：Worker 生命周期、单任务复用、Blob 缓存、直接下载和释放。
- `services/pdf/usePreparedReportPdf.ts`：React 生命周期适配；首屏后预生成并向按钮暴露状态。
- `tests/fixtures/pdfReportFixture.ts`：匿名 3,588 字 Recruiter 夹具、Candidate 夹具和长段落边界夹具。
- `scripts/verify-pdf-export.mjs`：生成验证 PDF、提取文字并输出待渲染路径。
- `docs/superpowers/verification/2026-08-03-client-side-text-pdf-export.md`：记录真实性、性能和逐页检查证据。

现有 `components/ReportView.tsx` 只负责页面显示和调用 Hook，不保留 PDF 排版细节。`index.html` 不再加载 `html2pdf.js`。旧的 `services/pdfExport.ts` 和 `tests/pdfExport.test.ts` 在 Task 5 删除；执行前必须把这两个精确删除目标再次展示给用户并取得删除授权。

### Task 1: 验证 Worker、pdfmake 和中文字体

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `public/fonts/NotoSansSC-Regular-v1.otf`
- Create: `public/fonts/NotoSansSC-Bold-v1.otf`
- Create: `public/fonts/OFL.txt`
- Create: `public/fonts/README.md`
- Create: `services/pdf/reportPdfProtocol.ts`
- Create: `services/pdf/reportPdf.worker.ts`
- Create: `services/pdf/reportPdfClient.ts`
- Create: `tests/pdfWorkerProtocol.test.ts`

- [ ] **Step 1: 记录当前截图方案基线**

在本地打开匿名 3,588 字样稿对应的报告页，清空浏览器缓存后执行 5 次导出，再以热缓存执行 5 次。记录“点击按钮到下载出现”的毫秒值、生成 PDF 大小和页面是否出现明显卡顿；把原始记录暂存为 `tmp/pdfs/html2pdf-baseline.json`。文件固定包含 `fixtureChars: 3588`、五个正数构成的 `coldMs`、五个正数构成的 `warmMs`、五个正整数构成的 `pdfBytes`，以及来自浏览器 user agent 的 `device`。该文件不提交，也不得包含报告正文。

- [ ] **Step 2: 写 Worker 协议失败测试**

在 `tests/pdfWorkerProtocol.test.ts` 中写入：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPdfWorkerResponse,
  type PdfWorkerRequest,
} from '../services/pdf/reportPdfProtocol.ts';

test('PDF Worker 协议区分 probe、成功和安全错误', () => {
  const request: PdfWorkerRequest = { type: 'probe', requestId: 'probe-1' };
  assert.equal(request.type, 'probe');
  assert.equal(isPdfWorkerResponse({
    type: 'success', requestId: 'probe-1', blob: new Blob(['pdf'], { type: 'application/pdf' }),
  }), true);
  assert.equal(isPdfWorkerResponse({
    type: 'error', requestId: 'probe-1', code: 'FONT_LOAD_FAILED', message: '字体加载失败',
  }), true);
  assert.equal(isPdfWorkerResponse({ requestId: 'probe-1', reportText: '敏感正文' }), false);
});
```

- [ ] **Step 3: 运行测试确认 RED**

Run: `node --experimental-strip-types --test tests/pdfWorkerProtocol.test.ts`

Expected: FAIL，提示 `services/pdf/reportPdfProtocol.ts` 不存在。

- [ ] **Step 4: 安装锁定依赖**

Run:

```bash
npm install --save-exact pdfmake@0.3.11
npm install --save-dev --save-exact @types/pdfmake@0.3.3
```

Expected: `package.json` 和 `package-lock.json` 只新增上述两个包及其传递依赖；不修改全局 Node/npm。

- [ ] **Step 5: 下载固定提交的官方字体与许可证**

Run:

```bash
mkdir -p public/fonts
curl -L --fail --output public/fonts/NotoSansSC-Regular-v1.otf https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf
curl -L --fail --output public/fonts/NotoSansSC-Bold-v1.otf https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf
curl -L --fail --output public/fonts/OFL.txt https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/LICENSE
shasum -a 256 public/fonts/NotoSansSC-*-v1.otf public/fonts/OFL.txt
du -k public/fonts/NotoSansSC-*-v1.otf
```

用 `apply_patch` 创建 `public/fonts/README.md`，写明来源仓库、提交 `f8d157532fbfaeda587e826d4cd5b21a49186f7c`、三条实际 SHA-256 和两个字体文件实际字节数。两个字体合计不得超过 18 MB。

- [ ] **Step 6: 实现最小协议和 Worker 客户端**

`services/pdf/reportPdfProtocol.ts` 的完整首版接口：

```ts
export type PdfWorkerErrorCode =
  | 'FONT_LOAD_FAILED'
  | 'PDF_BUILD_FAILED'
  | 'WORKER_TIMEOUT';

export type PdfWorkerRequest =
  | { type: 'probe'; requestId: string }
  | { type: 'render'; requestId: string; model: unknown };

export type PdfWorkerResponse =
  | { type: 'success'; requestId: string; blob: Blob }
  | { type: 'error'; requestId: string; code: PdfWorkerErrorCode; message: string };

export const isPdfWorkerResponse = (value: unknown): value is PdfWorkerResponse => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.requestId !== 'string') return false;
  if (candidate.type === 'success') {
    return candidate.blob instanceof Blob && candidate.blob.type === 'application/pdf';
  }
  return candidate.type === 'error'
    && ['FONT_LOAD_FAILED', 'PDF_BUILD_FAILED', 'WORKER_TIMEOUT'].includes(String(candidate.code))
    && typeof candidate.message === 'string';
};
```

`services/pdf/reportPdfClient.ts` 先只导出 Worker 工厂与探针：

```ts
import { isPdfWorkerResponse } from './reportPdfProtocol';

export const createReportPdfWorker = () => new Worker(
  new URL('./reportPdf.worker.ts', import.meta.url),
  { type: 'module', name: 'evalbar-pdf' },
);

export const probeReportPdfWorker = (): Promise<Blob> => new Promise((resolve, reject) => {
  const worker = createReportPdfWorker();
  const requestId = crypto.randomUUID();
  const timeout = window.setTimeout(() => {
    worker.terminate();
    reject(new Error('WORKER_TIMEOUT'));
  }, 15_000);
  worker.onmessage = ({ data }) => {
    if (!isPdfWorkerResponse(data) || data.requestId !== requestId) return;
    window.clearTimeout(timeout);
    worker.terminate();
    if (data.type === 'success') resolve(data.blob);
    else reject(new Error(data.code));
  };
  worker.postMessage({ type: 'probe', requestId });
});
```

`services/pdf/reportPdf.worker.ts` 对 `probe` 生成包含“中文分页验证”的一页 A4 PDF；注册字体 URL 时使用 `new URL('/fonts/NotoSansSC-Regular-v1.otf', self.location.origin).href` 和 Bold 对应 URL。捕获字体加载与 PDF 构建错误，只返回固定中文消息，不返回原异常堆栈或输入内容。

- [ ] **Step 7: 运行协议测试、构建和真实浏览器探针**

Run:

```bash
node --experimental-strip-types --test tests/pdfWorkerProtocol.test.ts
npm run build
npm run dev
```

在同源报告页浏览器控制台执行：

```js
const { probeReportPdfWorker } = await import('/services/pdf/reportPdfClient.ts');
const blob = await probeReportPdfWorker();
console.log(blob.type, blob.size > 0);
```

Expected: 控制台只显示 `application/pdf true`；下载该 Blob 后用 `pdfjs-dist` 能提取“中文分页验证”。如果 Worker、字体或生产构建任一项失败，停止后续任务并报告，不退回主线程。

- [ ] **Step 8: 提交 Task 1**

```bash
git add package.json package-lock.json public/fonts services/pdf/reportPdfProtocol.ts services/pdf/reportPdf.worker.ts services/pdf/reportPdfClient.ts tests/pdfWorkerProtocol.test.ts
git commit -m "feat: establish browser PDF worker"
```

### Task 2: 提取统一报告结构

**Files:**
- Create: `services/reportDocumentModel.ts`
- Create: `tests/reportDocumentModel.test.ts`
- Create: `tests/fixtures/pdfReportFixture.ts`
- Modify: `components/ReportView.tsx`

- [ ] **Step 1: 写统一模型的失败测试**

在 `tests/reportDocumentModel.test.ts` 覆盖两种模式：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportDocumentModel } from '../services/reportDocumentModel.ts';
import { candidateFixture, recruiterFixture } from './fixtures/pdfReportFixture.ts';

test('Recruiter 模型保留章节、维度和评分', () => {
  const model = buildReportDocumentModel(recruiterFixture);
  assert.equal(model.mode, 'recruiter');
  assert.equal(model.title, '人岗匹配评估');
  assert.equal(model.sections.length, 6);
  assert.equal(model.dimensions.length, 7);
  assert.equal(model.overallScore, 'H');
});

test('Candidate 模型不产生招聘评分并保留复盘结构', () => {
  const model = buildReportDocumentModel(candidateFixture);
  assert.equal(model.mode, 'candidate');
  assert.equal(model.title, '面试复盘与提升建议');
  assert.equal(model.overallScore, null);
  assert.equal(model.candidate?.problems.items.length, 3);
  assert.ok(model.candidate?.checklist?.items.length);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test tests/reportDocumentModel.test.ts`

Expected: FAIL，提示模型模块和夹具不存在。

- [ ] **Step 3: 建立匿名长报告夹具**

`tests/fixtures/pdfReportFixture.ts` 导出 `ReportDocumentInput` 类型的 `recruiterFixture`、`candidateFixture` 和 `longParagraphFixture`。Recruiter 夹具固定为 3,588 个报告字符、6 个 `##` 章节和 7 个 `###` 维度；使用虚构岗位和通用行为证据，不含数据库 ID、姓名、公司或真实原文。加入断言函数：

```ts
export const assertFixtureShape = () => {
  assert.equal(recruiterFixture.result.length, 3588);
  assert.equal((recruiterFixture.result.match(/^## /gm) ?? []).length, 6);
  assert.equal((recruiterFixture.result.match(/^### /gm) ?? []).length, 7);
};
```

- [ ] **Step 4: 实现纯解析模块**

`services/reportDocumentModel.ts` 定义：

```ts
export interface ReportDocumentInput {
  mode: AnalysisMode;
  result: string;
  fileName: string | null;
  createdAt: string | null;
  resumeFileName?: string | null;
  resumeParseStatus?: ResumeParseStatus | null;
}

export interface ReportDocumentModel {
  mode: AnalysisMode;
  title: string;
  fileName: string | null;
  createdAt: string | null;
  sections: ReportSection[];
  dimensions: DimensionScore[];
  overallScore: string | null;
  candidate: CandidateReportData | null;
}

export const buildReportDocumentModel = (input: ReportDocumentInput): ReportDocumentModel => {
  const sections = splitSections(input.result);
  const isCandidate = input.mode === 'candidate';
  return {
    mode: input.mode,
    title: isCandidate ? '面试复盘与提升建议' : '人岗匹配评估',
    fileName: input.fileName,
    createdAt: input.createdAt,
    sections,
    dimensions: isCandidate ? [] : parseDimensions(input.result),
    overallScore: isCandidate ? null : getOverallScore(input.result),
    candidate: isCandidate ? parseCandidateReport(sections) : null,
  };
};
```

把 `getOverallScore`、`splitSections`、`parseDimensions`、Candidate 接口与解析函数从 `ReportView.tsx` 原样迁入并导出。模型文件不得导入 React、DOM 或 `pdfmake`。

- [ ] **Step 5: 让网页继续消费同一解析结果**

`ReportView.tsx` 从新模块导入 `buildReportDocumentModel`，以一个 `useMemo` 替换分散解析：

```tsx
const reportDocument = useMemo(() => buildReportDocumentModel({
  mode: reportMode,
  result: analysis?.result || '',
  fileName: analysis?.fileName ?? null,
  createdAt,
  resumeFileName: analysis?.resumeFileName,
  resumeParseStatus: analysis?.resumeParseStatus,
}), [analysis, createdAt, reportMode]);

const { sections, dimensions, candidate: candidateData } = reportDocument;
```

网页 DOM、文字和交互不得改变。

- [ ] **Step 6: 运行模型测试和现有回归**

Run: `node --experimental-strip-types --test tests/reportDocumentModel.test.ts tests/analysisMode.test.ts tests/staticAssets.test.mjs && npm run build`

Expected: 全部 PASS，Vite build 成功。

- [ ] **Step 7: 提交 Task 2**

```bash
git add services/reportDocumentModel.ts components/ReportView.tsx tests/reportDocumentModel.test.ts tests/fixtures/pdfReportFixture.ts
git commit -m "refactor: share report document parsing"
```

### Task 3: 实现 A 版 PDF 文档构建器

**Files:**
- Create: `services/pdf/reportPdfDocument.ts`
- Create: `tests/reportPdfDocument.test.ts`

- [ ] **Step 1: 写文档定义失败测试**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportPdfDocument } from '../services/pdf/reportPdfDocument.ts';
import { buildReportDocumentModel } from '../services/reportDocumentModel.ts';
import { candidateFixture, recruiterFixture } from './fixtures/pdfReportFixture.ts';

test('A 版 Recruiter PDF 使用 A4、页脚、章节条和孤立标题规则', () => {
  const doc = buildReportPdfDocument(buildReportDocumentModel(recruiterFixture));
  assert.equal(doc.pageSize, 'A4');
  assert.deepEqual(doc.pageMargins, [30, 34, 30, 38]);
  assert.equal(typeof doc.footer, 'function');
  assert.equal(typeof doc.pageBreakBefore, 'function');
  assert.match(JSON.stringify(doc.content), /指定维度详细评估/);
  assert.match(JSON.stringify(doc.content), /H/);
});

test('Candidate PDF 不包含招聘评分', () => {
  const doc = buildReportPdfDocument(buildReportDocumentModel(candidateFixture));
  const serialized = JSON.stringify(doc.content);
  assert.doesNotMatch(serialized, /匹配等级/);
  assert.match(serialized, /下一次面试准备清单/);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test tests/reportPdfDocument.test.ts`

Expected: FAIL，提示构建器不存在。

- [ ] **Step 3: 建立 PDF token 与基础文档**

`services/pdf/reportPdfDocument.ts` 只导出纯函数：

```ts
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { CandidateReportData, ReportDocumentModel } from '../reportDocumentModel';

const PDF = {
  brand: '#6366F1', brandDark: '#4F46E5', slate900: '#0F172A',
  slate800: '#1E293B', slate600: '#475569', slate200: '#E2E8F0',
  brand50: '#EEF2FF', brand100: '#E0E7FF',
};

export const buildReportPdfDocument = (
  model: ReportDocumentModel,
): TDocumentDefinitions => ({
  pageSize: 'A4',
  pageMargins: [30, 34, 30, 38],
  defaultStyle: { font: 'NotoSansSC', fontSize: 9.5, lineHeight: 1.55, color: PDF.slate600 },
  styles: {
    heroTitle: { fontSize: 22, bold: true, color: '#FFFFFF' },
    sectionTitle: { fontSize: 13, bold: true, color: '#FFFFFF' },
    dimensionTitle: { fontSize: 11, bold: true, color: PDF.brandDark },
    body: { fontSize: 9.5, lineHeight: 1.55, color: PDF.slate600 },
  },
  footer: (page, pages) => ({
    margin: [30, 10, 30, 0],
    columns: [
      { text: 'Eval Bar AI · 仅供内部参考', color: '#94A3B8', fontSize: 7.5 },
      { text: `第 ${page} / ${pages} 页`, alignment: 'right', color: '#94A3B8', fontSize: 7.5 },
    ],
  }),
  content: buildContent(model),
  pageBreakBefore: (node, container) => (
    (node.headlineLevel === 1 || node.headlineLevel === 2)
    && container.getFollowingNodesOnPage().length === 0
  ),
});
```

- [ ] **Step 4: 实现 Recruiter 与 Candidate 内容映射**

实现下列私有函数，所有返回值均为 `Content[]`：

```ts
const toPdfRuns = (markdown: string): Array<{ text: string; bold?: boolean }> => {
  const runs: Array<{ text: string; bold?: boolean }> = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  for (const match of markdown.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) runs.push({ text: markdown.slice(cursor, index) });
    runs.push({ text: match[1], bold: true });
    cursor = index + match[0].length;
  }
  if (cursor < markdown.length) runs.push({ text: markdown.slice(cursor) });
  return runs.length > 0 ? runs : [{ text: markdown }];
};

const buildHero = (model: ReportDocumentModel): Content => ({
  table: {
    widths: ['*'],
    body: [[{
      stack: [
        { text: model.mode === 'candidate' ? '个人复盘报告' : '评估报告', fontSize: 8, color: '#E0E7FF' },
        { text: model.title, style: 'heroTitle', margin: [0, 4, 0, 5] },
        { text: [model.fileName, model.createdAt].filter(Boolean).join(' · '), fontSize: 8, color: '#E2E8F0' },
      ],
      margin: [14, 12, 14, 12],
    }]],
  },
  layout: { fillColor: () => PDF.slate800, hLineWidth: () => 0, vLineWidth: () => 0 },
  margin: [0, 0, 0, 10],
});

const buildContent = (model: ReportDocumentModel): Content[] => [
  buildHero(model),
  ...(model.mode === 'candidate' && model.candidate
    ? buildCandidateContent(model.candidate)
    : buildRecruiterContent(model)),
];

const sectionBand = (title: string): Content => ({
  table: { widths: ['*'], body: [[{ text: title, style: 'sectionTitle', margin: [10, 7, 10, 7] }]] },
  layout: { fillColor: () => PDF.slate800, hLineWidth: () => 0, vLineWidth: () => 0 },
  margin: [0, 8, 0, 8],
  headlineLevel: 1,
});

const paragraphCard = (text: string, fillColor = '#FFFFFF'): Content => ({
  table: { widths: ['*'], body: [[{ text: toPdfRuns(text), style: 'body', margin: [9, 7, 9, 7] }]] },
  layout: {
    fillColor: () => fillColor,
    hLineColor: () => PDF.slate200,
    vLineColor: () => PDF.slate200,
    hLineWidth: () => 0.6,
    vLineWidth: () => 0.6,
  },
  margin: [0, 0, 0, 6],
});

const markdownBody = (body: string): Content[] => body
  .split(/\n\s*\n/)
  .map((block) => block.trim())
  .filter(Boolean)
  .flatMap((block): Content[] => {
    if (block.startsWith('### ')) {
      return [{ text: block.slice(4).trim(), style: 'dimensionTitle', headlineLevel: 2, margin: [0, 6, 0, 5] }];
    }
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return [{ ul: lines.map((line) => ({ text: toPdfRuns(line.replace(/^[-*]\s+/, '')) })), margin: [12, 0, 0, 6] }];
    }
    return [paragraphCard(lines.join(' '))];
  });

const dimensionOverview = (model: ReportDocumentModel): Content[] => model.dimensions.length === 0 ? [] : [{
  table: {
    widths: ['*', 44],
    body: [
      [{ text: '胜任力维度评分', bold: true }, { text: '等级', bold: true, alignment: 'center' }],
      ...model.dimensions.map((item) => [item.name, { text: item.score, bold: true, color: PDF.brandDark, alignment: 'center' }]),
    ],
  },
  layout: 'lightHorizontalLines',
  margin: [0, 0, 0, 8],
}];

const buildRecruiterContent = (model: ReportDocumentModel): Content[] => [
  ...dimensionOverview(model),
  ...model.sections.flatMap((section) => [sectionBand(section.title), ...markdownBody(section.body)]),
];

const buildCandidateContent = (candidate: CandidateReportData): Content[] => [
  sectionBand(candidate.conclusion.title),
  ...candidate.conclusion.items.map((item) => paragraphCard(
    item.label ? `**${item.label}：**${item.text}` : item.text,
  )),
  ...(candidate.strengths ? [
    sectionBand(candidate.strengths.title),
    ...candidate.strengths.items.map((item) => paragraphCard(
      item.title ? `**${item.title}：**${item.evidence}` : item.evidence,
    )),
  ] : []),
  sectionBand(candidate.problems.title),
  ...candidate.problems.items.flatMap((problem, index) => [
    { text: `${String(index + 1).padStart(2, '0')}  ${problem.rootCause}`, style: 'dimensionTitle', headlineLevel: 2 },
    ...problem.fields.map((field) => paragraphCard(
      `**${field.label}：**${field.text}`,
      field.label.includes('示范') ? PDF.brand50 : '#FFFFFF',
    )),
  ]),
  ...(candidate.checklist ? [
    sectionBand(candidate.checklist.title),
    { ol: candidate.checklist.items.map((text) => ({ text: toPdfRuns(text) })), margin: [12, 0, 0, 6] },
  ] : []),
];
```

`toPdfRuns` 只解析项目当前使用的粗体 Markdown 标记和普通文字，不执行 HTML。Candidate 的“示范回答”使用 `brand50` 背景；Recruiter 在章节前插入 `dimensions` 评分概览。长卡片不设置 `unbreakable`。

- [ ] **Step 5: 运行构建器测试**

Run: `node --experimental-strip-types --test tests/reportPdfDocument.test.ts tests/reportDocumentModel.test.ts`

Expected: 全部 PASS。

- [ ] **Step 6: 提交 Task 3**

```bash
git add services/pdf/reportPdfDocument.ts tests/reportPdfDocument.test.ts
git commit -m "feat: build branded text PDF documents"
```

### Task 4: 实现后台预生成与 Blob 生命周期

**Files:**
- Modify: `services/pdf/reportPdfProtocol.ts`
- Modify: `services/pdf/reportPdf.worker.ts`
- Modify: `services/pdf/reportPdfClient.ts`
- Create: `services/pdf/usePreparedReportPdf.ts`
- Create: `tests/reportPdfClient.test.ts`

- [ ] **Step 1: 写控制器失败测试**

使用可注入的 Worker 和下载运行时，覆盖单任务复用和释放：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { ReportPdfClient, type PdfClientRuntime, type PdfWorkerPort } from '../services/pdf/reportPdfClient.ts';
import { buildReportDocumentModel } from '../services/reportDocumentModel.ts';
import { recruiterFixture } from './fixtures/pdfReportFixture.ts';

const createPdfClientHarness = () => {
  let onmessage: ((event: MessageEvent) => void) | null = null;
  const downloads: string[] = [];
  const revokedUrls: string[] = [];
  const worker: PdfWorkerPort = {
    postMessage: () => undefined,
    terminate: () => undefined,
    get onmessage() { return onmessage; },
    set onmessage(value) { onmessage = value; },
    onerror: null,
  };
  const runtime: PdfClientRuntime = {
    createWorker: () => worker,
    createObjectURL: () => 'blob:test',
    revokeObjectURL: (url) => revokedUrls.push(url),
    triggerDownload: (_url, fileName) => downloads.push(fileName),
    setTimeout: (callback) => globalThis.setTimeout(callback, 15_000),
    clearTimeout: (id) => globalThis.clearTimeout(id),
    randomUUID: () => 'request-1',
  };
  return {
    runtime,
    model: buildReportDocumentModel(recruiterFixture),
    downloads,
    revokedUrls,
    succeed: (blob: Blob) => onmessage?.({ data: { type: 'success', requestId: 'request-1', blob } } as MessageEvent),
    fail: (code: string) => onmessage?.({ data: { type: 'error', requestId: 'request-1', code, message: '生成失败' } } as MessageEvent),
  };
};

test('prepare 复用任务，download 复用 Blob，dispose 释放 URL', async () => {
  const harness = createPdfClientHarness();
  const client = new ReportPdfClient(harness.runtime);
  const first = client.prepare(harness.model);
  const second = client.prepare(harness.model);
  assert.equal(first, second);
  harness.succeed(new Blob(['pdf'], { type: 'application/pdf' }));
  await client.download('EvalBar_Report_2026-08-03.pdf');
  assert.deepEqual(harness.downloads, ['EvalBar_Report_2026-08-03.pdf']);
  client.dispose();
  assert.deepEqual(harness.revokedUrls, ['blob:test']);
});

test('失败后允许重试且不暴露报告正文', async () => {
  const harness = createPdfClientHarness();
  const client = new ReportPdfClient(harness.runtime);
  const failed = client.prepare(harness.model);
  harness.fail('PDF_BUILD_FAILED');
  await assert.rejects(failed, /PDF_BUILD_FAILED/);
  assert.notEqual(client.prepare(harness.model), failed);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test tests/reportPdfClient.test.ts`

Expected: FAIL，提示 `ReportPdfClient` 不存在。

- [ ] **Step 3: 完成 Worker render 协议**

把 `render` 请求的 `model` 类型收紧为 `ReportDocumentModel`。Worker 收到请求后执行：

```ts
const pdfMakeModule = await import('pdfmake/build/pdfmake');
const pdfMake = pdfMakeModule.default;
pdfMake.addFonts({
  NotoSansSC: {
    normal: new URL('/fonts/NotoSansSC-Regular-v1.otf', self.location.origin).href,
    bold: new URL('/fonts/NotoSansSC-Bold-v1.otf', self.location.origin).href,
    italics: new URL('/fonts/NotoSansSC-Regular-v1.otf', self.location.origin).href,
    bolditalics: new URL('/fonts/NotoSansSC-Bold-v1.otf', self.location.origin).href,
  },
});
const blob = await pdfMake.createPdf(buildReportPdfDocument(request.model)).getBlob();
self.postMessage({ type: 'success', requestId: request.requestId, blob });
```

错误映射只返回 `FONT_LOAD_FAILED` 或 `PDF_BUILD_FAILED` 和固定提示；不序列化 `Error.stack`。

- [ ] **Step 4: 实现可测试的 `ReportPdfClient`**

控制器接口固定为：

```ts
export type PdfClientStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface PdfWorkerPort {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface PdfClientRuntime {
  createWorker(): PdfWorkerPort;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  triggerDownload(url: string, fileName: string): void;
  setTimeout(callback: () => void): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
  randomUUID(): string;
}

export class ReportPdfClient {
  constructor(runtime: PdfClientRuntime = browserPdfRuntime);
  getStatus(): PdfClientStatus;
  subscribe(listener: (status: PdfClientStatus) => void): () => void;
  prepare(model: ReportDocumentModel): Promise<Blob>;
  download(fileName: string): Promise<void>;
  dispose(): void;
}
```

`prepare` 在 `preparing` 时返回同一 Promise，在 `ready` 时返回已缓存 Blob，在 `error` 时创建新 Worker 重试。`download` 只等待当前 Promise，不发起第二个 Worker；创建对象 URL 后触发隐藏 `<a download>`。`dispose` 终止 Worker、清除超时、撤销对象 URL 并清空 Blob 引用。

- [ ] **Step 5: 实现 React Hook**

`usePreparedReportPdf(model)` 返回：

```ts
interface PreparedReportPdf {
  status: PdfClientStatus;
  isDownloading: boolean;
  error: string | null;
  download: (fileName: string) => Promise<void>;
}
```

Effect 在报告模型稳定后创建控制器；使用 `requestIdleCallback(callback, { timeout: 1500 })` 启动 `prepare`，无该 API 时使用 `window.setTimeout(callback, 50)`。清理函数取消 idle callback、调用 `dispose()`。错误只更新状态，不主动弹窗。

- [ ] **Step 6: 运行控制器和 Hook 相关测试**

Run: `node --experimental-strip-types --test tests/reportPdfClient.test.ts tests/pdfWorkerProtocol.test.ts && npm run build`

Expected: 全部 PASS；Vite 输出独立 Worker chunk。

- [ ] **Step 7: 提交 Task 4**

```bash
git add services/pdf/reportPdfProtocol.ts services/pdf/reportPdf.worker.ts services/pdf/reportPdfClient.ts services/pdf/usePreparedReportPdf.ts tests/reportPdfClient.test.ts
git commit -m "feat: prebuild and cache report PDF blobs"
```

### Task 5: 接入报告页并移除截图路径

**Files:**
- Modify: `components/ReportView.tsx`
- Modify: `index.html`
- Modify: `tests/staticAssets.test.mjs`
- Delete: `services/pdfExport.ts`
- Delete: `tests/pdfExport.test.ts`

- [ ] **Step 1: 展示并取得删除授权**

在执行删除前向用户明确列出：

```text
将删除两个已被新导出管线替代的文件：
- services/pdfExport.ts
- tests/pdfExport.test.ts
不会删除报告、数据库、样稿 PDF 或其他用户文件。
```

只有用户明确授权后继续 Task 5；未授权时保留文件但停止最终清理，不得擅自删除。

- [ ] **Step 2: 写静态失败测试**

扩展 `tests/staticAssets.test.mjs`：

```js
const reportView = readFileSync(new URL('../components/ReportView.tsx', import.meta.url), 'utf8');

test('PDF 导出不再依赖截图或系统打印', () => {
  assert.doesNotMatch(indexHtml, /html2pdf(?:\.bundle)?(?:\.min)?\.js/);
  assert.doesNotMatch(reportView, /html2pdf|html2canvas|data-html2canvas-ignore|window\.print/);
  assert.match(reportView, /usePreparedReportPdf/);
});
```

- [ ] **Step 3: 运行测试确认 RED**

Run: `node --experimental-strip-types --test --test-name-pattern="PDF 导出不再" tests/staticAssets.test.mjs`

Expected: FAIL，命中 `index.html` CDN 和 `ReportView.tsx` 旧调用。

- [ ] **Step 4: 接入预生成 Hook**

在 `ReportView.tsx` 中：

```tsx
const preparedPdf = usePreparedReportPdf(reportDocument);

const handleDownloadPdf = async () => {
  try {
    await preparedPdf.download(`EvalBar_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch {
    window.alert('PDF 生成失败，请重试。');
  }
};
```

按钮禁用条件改为 `preparedPdf.isDownloading`，文字仍为“生成中…”或“导出 PDF”。删除 `contentRef`、折叠状态保存/展开等待、`html2pdf` 配置、全局声明和旧导出 import。删除所有 `data-html2canvas-ignore` 属性及“captured for PDF”注释，但不改变工具栏和折叠交互。

- [ ] **Step 5: 移除 CDN 与旧文件**

从 `index.html` 删除：

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
```

获得 Step 1 授权后删除 `services/pdfExport.ts` 和 `tests/pdfExport.test.ts`。

- [ ] **Step 6: 运行静态测试、全量测试和构建**

Run: `npm test && npm run build`

Expected: 全部测试 PASS；构建不再引用 `html2pdf` CDN，报告页仍可编译。

- [ ] **Step 7: 提交 Task 5**

```bash
git add components/ReportView.tsx index.html tests/staticAssets.test.mjs services/pdfExport.ts tests/pdfExport.test.ts
git commit -m "feat: switch report export to prepared text PDFs"
```

### Task 6: 建立真实 PDF 内容与视觉验证

**Files:**
- Create: `scripts/verify-pdf-export.mjs`
- Create: `tests/pdfExportContent.test.mjs`
- Modify: `tests/fixtures/pdfReportFixture.ts`

- [ ] **Step 1: 写文字完整性失败测试**

`tests/pdfExportContent.test.mjs` 调用验证脚本导出的纯函数：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAndInspectFixture } from '../scripts/verify-pdf-export.mjs';

test('PDF 提取文字覆盖每个章节且不是整页图片', async () => {
  const result = await generateAndInspectFixture('recruiter');
  assert.equal(result.missingMarkers.length, 0);
  assert.equal(result.duplicateMarkers.length, 0);
  assert.ok(result.pageCount >= 3 && result.pageCount <= 7);
  assert.ok(result.extractedChars >= 3500);
  assert.equal(result.fullPageImageCount, 0);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test tests/pdfExportContent.test.mjs`

Expected: FAIL，提示验证脚本不存在。

- [ ] **Step 3: 实现可重复验证脚本**

`scripts/verify-pdf-export.mjs` 使用同一 `buildReportPdfDocument` 和本地字体，在 `tmp/pdfs/verification/` 生成：

```text
recruiter-long.pdf
candidate.pdf
long-paragraph.pdf
```

随后用 `pdfjs-dist` 遍历每页 `getTextContent()`，归一化空白并检查每个章节/维度唯一标记；同时遍历 operator list，统计覆盖接近整页的图片绘制。导出：

```js
export const generateAndInspectFixture = async (fixtureName) => ({
  path,
  pageCount,
  extractedChars,
  missingMarkers,
  duplicateMarkers,
  fullPageImageCount,
});
```

脚本不得打印完整提取文本，只打印统计和缺失标记名称。

- [ ] **Step 4: 运行内容验证**

Run:

```bash
node --experimental-strip-types --test tests/pdfExportContent.test.mjs
node --experimental-strip-types scripts/verify-pdf-export.mjs
```

Expected: 三份 PDF 均无缺失或重复标记，文字可提取，整页图片计数为 0。

- [ ] **Step 5: 渲染全部页面并逐页检查**

Run:

```bash
mkdir -p tmp/pdfs/verification/rendered
pdftoppm -png -r 144 tmp/pdfs/verification/recruiter-long.pdf tmp/pdfs/verification/rendered/recruiter
pdftoppm -png -r 144 tmp/pdfs/verification/candidate.pdf tmp/pdfs/verification/rendered/candidate
pdftoppm -png -r 144 tmp/pdfs/verification/long-paragraph.pdf tmp/pdfs/verification/rendered/long-paragraph
```

用图像查看工具逐页检查无截字、重叠、方框、孤立标题和页脚覆盖；发现任何缺陷先回到 Task 3 增加失败夹具与修复，再重新生成全部页面。

- [ ] **Step 6: 提交 Task 6**

```bash
git add scripts/verify-pdf-export.mjs tests/pdfExportContent.test.mjs tests/fixtures/pdfReportFixture.ts
git commit -m "test: verify text PDF content and pagination"
```

### Task 7: 验证性能、资源隔离与边界行为

**Files:**
- Create: `docs/superpowers/verification/2026-08-03-client-side-text-pdf-export.md`
- Modify: `vite.config.ts`（仅在 chunk 隔离需要显式配置时修改）
- Modify: `tests/staticAssets.test.mjs`

- [ ] **Step 1: 写资源隔离失败测试**

在 `tests/staticAssets.test.mjs` 增加构建入口静态约束：

```js
test('PDF 引擎只通过 Worker 懒加载', () => {
  assert.doesNotMatch(indexHtml, /pdfmake|NotoSansSC/);
  assert.match(reportView, /usePreparedReportPdf/);
  assert.doesNotMatch(reportView, /from ['"]pdfmake/);
});
```

- [ ] **Step 2: 运行测试确认约束**

Run: `node --experimental-strip-types --test --test-name-pattern="PDF 引擎只通过" tests/staticAssets.test.mjs`

Expected: PASS；若 FAIL，修正同步 import 后再继续。

- [ ] **Step 3: 审计生产构建 chunk**

Run:

```bash
npm run build
rg -l "pdfmake|NotoSansSC" dist/assets dist --glob '*.js' --glob '*.css'
du -k dist/assets/* | sort -n | tail -20
```

Expected: `pdfmake` 只出现在 Worker 相关 chunk；首页入口 JS/CSS 不包含字体 URL 或 PDF 引擎。若 Vite 合并错误，在 `vite.config.ts` 只为 Worker 配置独立 chunk，不把 PDF 包放入公共 vendor chunk。

- [ ] **Step 4: 测量冷热缓存和点击时间**

用与 Task 1 相同设备、浏览器和匿名 3,588 字夹具执行 5 次冷缓存和 5 次热缓存：记录报告首屏时间、Worker Blob ready 时间、ready 后点击到下载时间、PDF 大小、两个字体传输总量和浏览器峰值内存。要求：

```text
热缓存 Blob ready 中位数 <= Task 1 当前方案 warmMs 中位数
Blob ready 后点击到下载 < 100 ms
两个字体总传输 <= 18 MB
PDF 额外峰值内存 <= 80 MB
PDF 生成期间无主线程 > 50 ms 长任务
```

- [ ] **Step 5: 验证边界交互**

浏览器依次验证：

1. Blob ready 后点击一次立即下载。
2. 页面刚打开即点击时等待同一任务，最终只下载一次。
3. 连续双击不会启动两个 Worker 或下载两份。
4. Worker 失败后按钮恢复，第二次点击可重试。
5. 从报告 A 导航到报告 B 后只下载 B，A 的 URL 已撤销。
6. Candidate PDF 不出现招聘评分；Recruiter PDF 保留评分。
7. 不出现系统打印或存储窗口。

- [ ] **Step 6: 写验证记录并提交**

创建验证文档，写入实际设备、浏览器、10 次测量值、中位数、chunk 文件与大小、字体字节数、三份 PDF 页数、逐页检查结论和未覆盖边界。不得写入报告正文或候选人信息。

```bash
git add docs/superpowers/verification/2026-08-03-client-side-text-pdf-export.md vite.config.ts tests/staticAssets.test.mjs
git commit -m "docs: record PDF export verification"
```

### Task 8: 完整回归与交付记录

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/handoff.md`
- Modify: `docs/superpowers/specs/2026-08-03-client-side-text-pdf-export-design.md`

- [ ] **Step 1: 检查并保护现有用户改动**

Run:

```bash
git status -sb
git diff -- AGENTS.md docs/handoff.md
```

`AGENTS.md` 不属于本任务，始终不修改、不暂存。`docs/handoff.md` 已有用户改动；先阅读 diff，只在无重叠区域追加本次 PDF 交付，禁止覆盖或格式化用户内容。若目标段落重叠，停止并请用户决定合并方式。

- [ ] **Step 2: 同步架构与状态文档**

在 `docs/architecture.md` 的报告展示/导出数据流中写明：浏览器报告模型、Web Worker、`pdfmake`、自托管字体、Blob 生命周期和无服务端持久化。在 `docs/handoff.md` 追加实际提交、测试、构建、PDF 页数与性能结果；不要写“已部署”。把设计文档状态改为“已实现、本地验证通过，待部署”。

- [ ] **Step 3: 运行完整验证**

Run:

```bash
npm test
npm run build
node --experimental-strip-types scripts/verify-pdf-export.mjs
git diff --check
```

Expected: 全量测试 PASS，Vite build 成功，三份 PDF 内容验证通过，diff 无空白错误。

- [ ] **Step 4: 最终检查生产边界和 Git 范围**

Run:

```bash
git status -sb
git diff --name-only
git log --oneline --decorate -10
```

确认未修改 `.env*`、数据库、`data/`、部署脚本或 CI；未提交 `tmp/pdfs/`、验证 PNG、Blob 或真实报告。生产部署和 Git push 均不在本计划自动执行范围。

- [ ] **Step 5: 提交文档收口**

只暂存属于本任务的文档；如果 `docs/handoff.md` 的用户改动无法与本任务拆分，不暂存该文件，改在交付说明中记录。

```bash
git add docs/architecture.md docs/superpowers/specs/2026-08-03-client-side-text-pdf-export-design.md
git add -p docs/handoff.md
git commit -m "docs: document text PDF export flow"
```

- [ ] **Step 6: 向用户交付本地结果**

报告：实现提交列表、测试与构建结果、三份匿名 PDF 的页数、性能对比、字体和 Worker 资源大小、仍需用户完成的浏览器验收。不要声称已 push 或部署；这两项需要用户单独授权。
