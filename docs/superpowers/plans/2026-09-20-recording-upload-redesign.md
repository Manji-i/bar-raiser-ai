# Recording Upload Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将录音入口改成“先选择、再确认、主动上传”的轻量卡片，同时保持现有转写与确认稿流程。

**Architecture:** `RecordingImport.tsx` 继续拥有任务生命周期和 API 调用，新建纯函数模块管理待上传文件的展示与按钮可用状态，便于无 DOM 环境测试。视觉使用现有 Tailwind token、`components/ui.tsx` 基元和 `lucide-react`，不修改后端契约。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、lucide-react、Node.js test runner、Vite

---

| Task | 主要工作 | 依赖 |
|---|---|---|
| 1 | 固化待上传状态规则 | 现有文件校验与测试框架 |
| 2 | 重构初始和已选文件界面 | Task 1、现有视觉基元 |
| 3 | 优化转写与确认文案 | 现有任务状态 |
| 4 | 完成构建、浏览器与设计 QA | Tasks 1–3 |
| 5 | 提交、推送并按手册部署 | 全部验收通过 |

### Task 1: 待上传状态规则

**Files:**
- Create: `components/recordingUploadPresentation.ts`
- Create: `tests/recordingUploadPresentation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { getRecordingUploadPresentation } from '../components/recordingUploadPresentation.ts';

test('选择文件后仍需授权才允许主动上传', () => {
  assert.deepEqual(getRecordingUploadPresentation({ hasFile: true, consent: false, busy: false }), {
    canSubmit: false,
    step: 'selected',
  });
  assert.equal(getRecordingUploadPresentation({ hasFile: true, consent: true, busy: false }).canSubmit, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/recordingUploadPresentation.test.ts`

Expected: FAIL because `components/recordingUploadPresentation.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function getRecordingUploadPresentation(input: { hasFile: boolean; consent: boolean; busy: boolean }) {
  return {
    canSubmit: input.hasFile && input.consent && !input.busy,
    step: input.hasFile ? 'selected' as const : 'empty' as const,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/recordingUploadPresentation.test.ts`

Expected: PASS.

### Task 2: 上传卡片重构

**Files:**
- Modify: `components/RecordingImport.tsx`
- Test: `tests/recordingUploadPresentation.test.ts`

- [ ] **Step 1: Extend the failing test**

增加无文件、忙碌状态和文件大小格式化断言，覆盖按钮禁用与文件摘要规则。

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --experimental-strip-types --test tests/recordingUploadPresentation.test.ts`

Expected: FAIL because the formatting helper is not implemented.

- [ ] **Step 3: Implement the selected design**

在 `RecordingImport.tsx` 中增加待上传文件状态、拖拽事件、隐藏文件输入、文件摘要、处理说明、授权勾选框和显式提交按钮。提交时调用现有 `upload(file)`；已提交后的 `job` 分支继续使用现有任务逻辑。

- [ ] **Step 4: Run focused tests**

Run: `node --experimental-strip-types --test tests/recordingUploadPresentation.test.ts tests/materialClient.test.ts`

Expected: PASS.

### Task 3: 转写与确认阶段表达优化

**Files:**
- Modify: `components/RecordingImport.tsx`

- [ ] **Step 1: Update state presentation**

增加三步阶段指示；上传中展示真实百分比，排队与转写阶段说明可以稍后返回，逐字稿就绪时高亮“确认文字”。

- [ ] **Step 2: Update confirmation copy**

将“保存确认稿并用于分析”改为“确认并填入面试记录”，并同步恢复任务提示和成功提示。

- [ ] **Step 3: Run focused and full tests**

Run: `npm test`

Expected: 0 failures.

### Task 4: Build and visual QA

**Files:**
- Create: `design-qa.md`

- [ ] **Step 1: Build production assets**

Run: `npm run build`

Expected: exit 0 and a new hashed application asset in `dist/assets/`.

- [ ] **Step 2: Run local app and capture the component**

打开候选人或招聘方录音入口，分别检查初始、已选文件、上传/转写和确认文字状态；检查桌面与移动宽度、键盘操作和控制台错误。

- [ ] **Step 3: Compare with the selected mockup**

将参考图和实现截图放在同一对照证据中，修复所有 P0/P1/P2 差异，并将结果记录到 `design-qa.md`；最终必须为 `final result: passed`。

### Task 5: GitHub and production release

**Files:**
- Modify: no source files

- [ ] **Step 1: Verify clean release candidate**

Run: `npm test && npm run build && git status -sb`

Expected: tests and build pass; only intended source and documentation changes are tracked.

- [ ] **Step 2: Commit and push feature branch**

提交设计、实现、测试与 QA 证据，推送 `codex/recording-upload-redesign`。

- [ ] **Step 3: Fast-forward main and push**

将本地 `main` 快进到同一已验证提交，推送 `origin/main`，确保生产来源可追溯。

- [ ] **Step 4: Deploy verified local build**

按 `DEPLOYMENT.md` 打包并校验本地 `dist`，备份生产 `data/`，同步代码，原子替换 `dist/`，重启 `bar-raiser-ai`。

- [ ] **Step 5: Verify production**

核对生产 HEAD、PM2 online、首页与受保护接口状态、主 asset hash、静态缓存头、SQLite quick check 和浏览器实际页面。
