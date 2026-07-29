# 登录角色锁定与体验修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改数据库 schema 的前提下实现登录角色锁定、角色内路由与历史隔离，并修复外部图标、Candidate 表单对齐和报告结论格式。

**Execution status (2026-07-28):** Task 1–7 已完成、合并并部署；依赖安全升级随后单独完成。本文保留为实施记录，当前提交、测试和生产状态以 `docs/handoff.md` 为准。

**Architecture:** 使用 `AuthContext` 管理与认证同生命周期的客户端锁定角色，所有业务路由和页面从该上下文读取模式并失败关闭。Candidate Prompt 通过带版本标记的代码级输出契约兼容已有数据库 Prompt；外部图标替换为构建内 Lucide 图标。强化版 A 的服务端绕过风险记录在独立维护文档中。

**Tech Stack:** React 19、TypeScript、React Router 7、Node.js ESM、Express、SQLite、Node Test Runner、Vite、Tailwind CDN、lucide-react

---

## 任务清单

| 任务 | 名称 | 主要产出 | 依赖与解耦说明 |
|---|---|---|---|
| Task 1 | 建立严格的登录角色存储契约 | 角色存储、登录前意图和纯函数测试 | 基础任务；不依赖其他任务 |
| Task 2 | 认证上下文绑定角色并失败关闭 | `AuthContext` 角色生命周期、登录/注册角色选择 | 仅依赖 Task 1 |
| Task 3 | 锁定业务路由、导航、首页与报告详情 | 路由守卫、导航收敛、历史和报告模式校验 | 依赖 Task 1–2；不依赖图标、Prompt 或文档任务 |
| Task 4 | 修复外部图标并对齐 Candidate 输入区域 | Lucide 本地图标、等高输入区域、静态回归 | 独立任务；可与 Task 1–3 分开实现和验证 |
| Task 5 | 强制 Candidate 三段式结论输出 | 版本化输出契约、旧 Prompt 兼容、Prompt 测试 | 独立任务；不依赖前端角色锁定或视觉修改 |
| Task 6 | 建立未来风险登记并同步项目文档 | `未来需迭代内容.md`、架构与交接文档 | 文档任务；依据已确认设计，可独立编写 |
| Task 7 | 完整验证与浏览器验收 | 全量测试、构建、匿名浏览器检查和最终状态审计 | 集成任务；依赖 Task 1–6 完成 |

执行时按依赖关系推进：先完成 Task 1–2，再完成 Task 3；Task 4、Task 5、Task 6 与这条主链解耦，可以独立实施、独立测试和独立提交；Task 7 最后统一验收。每个任务只修改其文件清单中的职责范围，发现跨任务问题时回到对应任务补测试和修复，不把无关改动混入当前提交。

### Task 1: 建立严格的登录角色存储契约

**Files:**
- Modify: `services/analysisMode.ts`
- Modify: `tests/analysisMode.test.ts`

- [ ] **Step 1: 写严格角色存储的失败测试**

在 `tests/analysisMode.test.ts` 中导入 `AUTH_MODE_KEY`、`getAuthMode`、`setAuthMode`、`clearAuthMode`、`setPostLoginMode`、`consumePostLoginMode`、`clearPostLoginMode`，并加入：

```ts
test('auth mode is strict and uses the auth lifecycle storage', () => {
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
  };

  try {
    assert.equal(getAuthMode(), null);
    setAuthMode('candidate');
    assert.equal(localValues.get(AUTH_MODE_KEY), 'candidate');
    assert.equal(getAuthMode(), 'candidate');
    localValues.set(AUTH_MODE_KEY, 'broken');
    assert.equal(getAuthMode(), null);
    clearAuthMode();
    assert.equal(localValues.has(AUTH_MODE_KEY), false);
  } finally {
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});

test('post-login intent stores a mode rather than a trusted destination', () => {
  setPostLoginMode('candidate');
  assert.equal(consumePostLoginMode(), 'candidate');
  assert.equal(consumePostLoginMode(), null);
  setPostLoginMode('recruiter');
  clearPostLoginMode();
  assert.equal(consumePostLoginMode(), null);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test --test-name-pattern="auth mode|post-login intent" tests/*.test.*`

Expected: FAIL，提示新增导出尚不存在。

- [ ] **Step 3: 实现严格角色存储与登录前意图**

在 `services/analysisMode.ts` 中增加并使用以下接口；保留 `modePath`、`modeFromPath` 和公开页需要的最近模式兼容逻辑，但认证页面不得再用 `getRecentMode()` 决定角色：

```ts
export const AUTH_MODE_KEY = 'evalbar_auth_mode';
export const POST_LOGIN_MODE_KEY = 'evalbar_post_login_mode';

export const getAuthMode = (): AnalysisMode | null => {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(AUTH_MODE_KEY);
  return isAnalysisMode(value) ? value : null;
};

export const setAuthMode = (mode: AnalysisMode): void => {
  if (typeof window !== 'undefined') window.localStorage.setItem(AUTH_MODE_KEY, mode);
};

export const clearAuthMode = (): void => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(AUTH_MODE_KEY);
};

export const setPostLoginMode = (mode: AnalysisMode): void => {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(POST_LOGIN_MODE_KEY, mode);
};

export const consumePostLoginMode = (): AnalysisMode | null => {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(POST_LOGIN_MODE_KEY);
  window.sessionStorage.removeItem(POST_LOGIN_MODE_KEY);
  return isAnalysisMode(value) ? value : null;
};

export const clearPostLoginMode = (): void => {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(POST_LOGIN_MODE_KEY);
};
```

- [ ] **Step 4: 运行角色单测确认 GREEN**

Run: `node --experimental-strip-types --test --test-name-pattern="analysis modes|stored modes|mode routes|browser helpers|auth mode|post-login intent" tests/*.test.*`

Expected: PASS。

- [ ] **Step 5: 提交 Task 1**

```bash
git add services/analysisMode.ts tests/analysisMode.test.ts
git commit -m "feat: add strict auth mode storage"
```

### Task 2: 让认证上下文绑定角色并失败关闭

**Files:**
- Modify: `src/context/AuthContext.tsx`
- Modify: `src/components/LoginPage.tsx`
- Modify: `tests/staticAssets.test.mjs`

- [ ] **Step 1: 写认证与登录页静态契约的失败测试**

在 `tests/staticAssets.test.mjs` 读取 `AuthContext.tsx` 与 `LoginPage.tsx`，增加：

```js
test('登录与注册显式绑定所选角色', () => {
  assert.match(authContext, /analysisMode:\s*AnalysisMode\s*\|\s*null/);
  assert.match(authContext, /login:\s*\(username: string, password: string, analysisMode: AnalysisMode\)/);
  assert.match(loginPage, /提升自己/);
  assert.match(loginPage, /判断他人/);
  assert.match(loginPage, /await login\(username, password, selectedMode\)/);
  assert.doesNotMatch(loginPage, /以[“"]?.+身份登录/);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test --test-name-pattern="登录与注册显式绑定" tests/*.test.*`

Expected: FAIL，因为认证签名和角色选择尚未实现。

- [ ] **Step 3: 扩展 AuthContext**

在 `AuthContextType` 中加入 `analysisMode`，并把登录和注册签名改为：

```ts
analysisMode: AnalysisMode | null;
login: (username: string, password: string, analysisMode: AnalysisMode) => Promise<void>;
register: (username: string, password: string, analysisMode: AnalysisMode, email?: string) => Promise<void>;
```

恢复状态时同时读取 `auth_token`、`auth_user`、`getAuthMode()`；只有三者齐全才恢复，否则清除本地认证键。`setAuthData` 接收角色并调用 `setAuthMode`。`logout` 同时调用 `clearAuthMode()` 与 `clearPostLoginMode()`。监听 `storage` 事件；认证键或 `AUTH_MODE_KEY` 在其他标签页变化时清除当前 React 状态，要求重新登录。

- [ ] **Step 4: 实现登录页紧凑分段选择**

在 `LoginPage.tsx` 初始化：

```tsx
const [selectedMode, setSelectedMode] = useState<AnalysisMode>(
  () => consumePostLoginMode() ?? 'recruiter',
);
```

在表单字段前使用两列分段按钮，选项文字固定为“提升自己 / 判断他人”；登录调用 `await login(username, password, selectedMode)`，注册调用 `await register(username, password, selectedMode, email || undefined)`。成功后直接导航到 `modePath(selectedMode, 'app')`。主按钮继续使用现有表达式，登录状态只显示“登录”，不得拼接角色。

- [ ] **Step 5: 运行测试和构建**

Run: `node --experimental-strip-types --test --test-name-pattern="登录与注册显式绑定|auth mode" tests/*.test.* && npm run build`

Expected: 测试 PASS，Vite build 成功。

- [ ] **Step 6: 提交 Task 2**

```bash
git add src/context/AuthContext.tsx src/components/LoginPage.tsx tests/staticAssets.test.mjs
git commit -m "feat: lock role at login"
```

### Task 3: 锁定业务路由、导航、首页与报告详情

**Files:**
- Modify: `App.tsx`
- Modify: `components/LandingPage.tsx`
- Modify: `components/HistoryView.tsx`
- Modify: `components/ReportView.tsx`
- Modify: `services/analysisMode.ts`
- Modify: `tests/analysisMode.test.ts`
- Modify: `tests/staticAssets.test.mjs`

- [ ] **Step 1: 写路由决策的失败测试**

在 `services/analysisMode.ts` 规划纯函数并先写测试：

```ts
test('locked mode owns all business route decisions', () => {
  assert.equal(resolveModeAccess('candidate', 'candidate', 'app'), '/app/candidate');
  assert.equal(resolveModeAccess('recruiter', 'candidate', 'app'), '/app/candidate');
  assert.equal(resolveModeAccess(null, 'recruiter', 'history'), '/history/recruiter');
  assert.equal(reportMatchesAuthMode('candidate', 'candidate'), true);
  assert.equal(reportMatchesAuthMode('recruiter', 'candidate'), false);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test --test-name-pattern="locked mode owns" tests/*.test.*`

Expected: FAIL，提示 `resolveModeAccess` 或 `reportMatchesAuthMode` 未定义。

- [ ] **Step 3: 实现纯路由判断**

```ts
export const resolveModeAccess = (
  routeMode: AnalysisMode | null,
  authMode: AnalysisMode,
  area: ModeArea,
): string => modePath(routeMode === authMode ? routeMode : authMode, area);

export const reportMatchesAuthMode = (
  reportMode: AnalysisMode | undefined,
  authMode: AnalysisMode,
): boolean => (reportMode ?? 'recruiter') === authMode;
```

- [ ] **Step 4: 改造 App 路由与顶部导航**

`ProtectedRoute` 要求 `user` 与 `analysisMode` 同时存在。`LegacyModeRedirect` 和 `ModeParamRoute` 从 `useAuth()` 获取锁定角色，不再调用 `rememberMode()` 或 `getRecentMode()`。`TopNav` 删除桌面和移动角色切换器，业务链接、Logo 和 `handleReset` 始终使用锁定角色。`AppShell` 与业务页面只在锁定角色存在时渲染。

管理员 `/admin` 保持 `isAdmin` 校验；TopNav 在管理员页仍用锁定角色生成业务链接。

- [ ] **Step 5: 限制首页入口**

`LandingPage` 使用 `{ user, analysisMode } = useAuth()`：未登录时调用 `setPostLoginMode(mode)` 并进入 `/login`；已登录且点击当前角色时进入工作台；点击另一角色时设置页面内提示“当前登录角色为「提升自己/判断他人」，退出登录后可重新选择角色。”顶部“进入应用”使用 `analysisMode`，不再硬编码 recruiter。

- [ ] **Step 6: 限制历史与报告**

`HistoryView` 只接收锁定模式，并读取 `location.state?.notice` 显示一次说明。`ReportView` 新增必填属性 `authMode: AnalysisMode`；加载报告后先调用 `reportMatchesAuthMode`，不匹配时执行：

```tsx
navigate(modePath(authMode, 'history'), {
  replace: true,
  state: { notice: '该报告不属于当前登录角色，请退出后重新选择角色。' },
});
return;
```

初始 `analysis` 同样在 effect 中校验，校验完成前不渲染不匹配内容。

- [ ] **Step 7: 增加静态回归并运行验证**

在 `tests/staticAssets.test.mjs` 断言 `App.tsx` 不再包含顶部模式切换按钮映射或 `switchMode`，且 `LandingPage.tsx` 不再硬编码 `modePath('recruiter', 'app')`。

Run: `node --experimental-strip-types --test --test-name-pattern="locked mode owns|顶部导航|首页入口" tests/*.test.* && npm run build`

Expected: PASS，TypeScript 构建无缺失 props 或签名错误。

- [ ] **Step 8: 提交 Task 3**

```bash
git add App.tsx components/LandingPage.tsx components/HistoryView.tsx components/ReportView.tsx services/analysisMode.ts tests/analysisMode.test.ts tests/staticAssets.test.mjs
git commit -m "feat: enforce locked role navigation"
```

### Task 4: 修复外部图标并对齐 Candidate 输入区域

**Files:**
- Modify: `components/LandingPage.tsx`
- Modify: `components/CandidateFileUpload.tsx`
- Modify: `tests/staticAssets.test.mjs`

- [ ] **Step 1: 写外部图标和布局失败测试**

在 `tests/staticAssets.test.mjs` 读取两个组件并加入：

```js
test('产品图标不依赖外部 TOS SVG', () => {
  assert.doesNotMatch(landingPage, /cdn-tos-cn\.bytedance\.net/);
  assert.doesNotMatch(candidateUpload, /cdn-tos-cn\.bytedance\.net/);
  assert.doesNotMatch(candidateUpload, /UPLOAD_ICON_URL/);
});

test('Candidate 岗位与 JD 输入区域保持等高', () => {
  assert.match(candidateUpload, /data-testid="candidate-job-title"[^>]*className="[^"]*h-28[^"]*resize-none/);
  assert.match(candidateUpload, /data-testid="candidate-job-description"[^>]*className="[^"]*h-28[^"]*resize-none/);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test --test-name-pattern="产品图标|输入区域保持等高" tests/*.test.*`

Expected: FAIL，定位现有远程 SVG 与不一致高度。

- [ ] **Step 3: 替换首页和上传图标**

删除 `MODE_ICON_URLS` 与 `UPLOAD_ICON_URL`。首页“提升自己”入口使用 `UserRound`，“判断他人”入口使用 `ClipboardCheck`，Candidate 两个上传空状态使用 `UploadCloud`。图标尺寸保持 `w-5 h-5`、`w-7 h-7`、`w-8 h-8`，颜色使用现有 brand/violet/slate 类。

- [ ] **Step 4: 对齐输入区域**

把职位名称控件改为不可 resize 的 textarea，并给两个控件分别添加稳定测试属性：

```tsx
<textarea
  data-testid="candidate-job-title"
  rows={4}
  value={jobTitle}
  onChange={(event) => setJobTitle(event.target.value)}
  placeholder="例如：高级产品经理"
  className="w-full h-28 resize-none px-4 py-3 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
/>
```

JD 使用相同的 `h-28 resize-none px-4 py-3 ...` 样式与 `data-testid="candidate-job-description"`。字段校验和提交数据不变。

- [ ] **Step 5: 运行静态测试与构建**

Run: `node --experimental-strip-types --test --test-name-pattern="产品图标|输入区域保持等高" tests/*.test.* && npm run build`

Expected: PASS，构建产物不再请求上述外部 SVG。

- [ ] **Step 6: 提交 Task 4**

```bash
git add components/LandingPage.tsx components/CandidateFileUpload.tsx tests/staticAssets.test.mjs
git commit -m "fix: bundle icons and align candidate fields"
```

### Task 5: 强制 Candidate 三段式结论输出

**Files:**
- Modify: `services/candidatePrompt.js`
- Modify: `server.js`
- Modify: `tests/promptService.test.mjs`

- [ ] **Step 1: 写输出契约失败测试**

在 `tests/promptService.test.mjs` 导入 `CANDIDATE_CONCLUSION_CONTRACT_ID` 和 `applyCandidateConclusionContract`，增加：

```js
test('Candidate 结论契约兼容旧 Prompt 且只追加一次', () => {
  const legacy = '<role_definition>旧 Candidate Prompt</role_definition>';
  const composed = applyCandidateConclusionContract(legacy);
  assert.match(composed, /一句话总结/);
  assert.match(composed, /值得保留的做法 X 项、核心改进问题 Y 项/);
  assert.match(composed, /下次准备/);
  assert.equal(composed.split(CANDIDATE_CONCLUSION_CONTRACT_ID).length - 1, 1);
  assert.equal(
    applyCandidateConclusionContract(composed).split(CANDIDATE_CONCLUSION_CONTRACT_ID).length - 1,
    1,
  );
  assert.match(DEFAULT_CANDIDATE_PROMPT_CONTENT, new RegExp(CANDIDATE_CONCLUSION_CONTRACT_ID));
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --experimental-strip-types --test --test-name-pattern="Candidate 结论契约" tests/*.test.*`

Expected: FAIL，新增契约导出尚不存在。

- [ ] **Step 3: 定义带版本标记的契约**

在 `services/candidatePrompt.js` 定义：

```js
export const CANDIDATE_CONCLUSION_CONTRACT_ID = 'candidate-conclusion-v2';
export const CANDIDATE_CONCLUSION_CONTRACT = `
<mandatory_output_contract id="${CANDIDATE_CONCLUSION_CONTRACT_ID}">
“## 本场表现结论”必须且只能包含三个独立段落：
1. **一句话总结：** 用一句话概括整体表现，不给分，不预测录用。
2. **本场重点：** 明确写出“值得保留的做法 X 项、核心改进问题 Y 项”，数量必须与后文章节实际条目一致，并点出最优先改进问题。
3. **下次准备：** 用一句话概括下一次面试最需要准备的内容。
本契约覆盖旧 Prompt 中与本场表现结论句数或格式冲突的描述。
</mandatory_output_contract>`;

export const applyCandidateConclusionContract = (content) =>
  content.includes(CANDIDATE_CONCLUSION_CONTRACT_ID)
    ? content
    : `${content.trim()}\n\n${CANDIDATE_CONCLUSION_CONTRACT}`;
```

更新默认 Prompt 的结论模板并包含同一契约标记，移除原“3 至 5 句话”描述。

- [ ] **Step 4: 在模型调用前组合现有数据库 Prompt**

`server.js` 获取当前 Prompt 后按模式处理：

```js
const storedPrompt = promptService.getCurrentPrompt(analysisMode).content;
const systemPrompt = analysisMode === 'candidate'
  ? applyCandidateConclusionContract(storedPrompt)
  : storedPrompt;
```

这样已有数据库 Candidate Prompt 无需迁移即可生效，新默认 Prompt 不会重复追加。

- [ ] **Step 5: 运行 Prompt 测试与完整测试**

Run: `node --experimental-strip-types --test --test-name-pattern="Prompt|Candidate 结论契约" tests/*.test.* && npm test`

Expected: 目标测试及全量测试 PASS。

- [ ] **Step 6: 提交 Task 5**

```bash
git add services/candidatePrompt.js server.js tests/promptService.test.mjs
git commit -m "feat: structure candidate conclusions"
```

### Task 6: 建立未来风险登记并同步项目文档

**Files:**
- Create: `docs/未来需迭代内容.md`
- Modify: `docs/architecture.md`
- Modify: `docs/handoff.md`

- [ ] **Step 1: 创建风险登记表**

`docs/未来需迭代内容.md` 使用以下固定结构，不写入 token、候选人材料或生产数据：

```markdown
# 未来需迭代内容

## 维护规则

- 状态只使用：待评估、计划中、已完成、暂不处理。
- 每项记录优先级、触发条件、当前缓解、目标方案和验收标准。
- 完成后保留记录并补充完成日期与提交号，不直接删除历史。

## P1：角色升级为服务端 token 绑定

- 状态：待评估
- 当前风险：强化版 A 可防误操作，但客户端角色值和 API 参数可被同一账号主动修改。
- 当前缓解：登录角色锁定、路由重定向、报告模式校验、缺失角色失败关闭。
- 触发条件：用户量明显增长、引入企业客户、角色拥有不同权限、出现审计或合规要求。
- 目标方案：为 `tokens` 增加 `analysis_mode`，登录与注册写入角色，认证中间件返回角色，分析、列表、详情、附件、删除与反馈接口统一校验。
- 验收标准：修改浏览器存储、URL 或 API 参数均不能访问 token 绑定角色之外的数据；退出后重新登录才能换角色。
```

同一文件继续写入以下完整条目：

```markdown
## P1：密码哈希升级

- 状态：待评估
- 当前风险：密码使用无盐 SHA-256，数据库泄露后容易被离线破解。
- 当前缓解：数据库不提交仓库，生产数据目录按私有权限维护。
- 触发条件：下一次认证系统迭代，或开放注册前。
- 目标方案：使用带独立盐和成本参数的 `scrypt` 或 `argon2id`，登录成功时渐进升级旧哈希。
- 验收标准：新密码不再保存裸 SHA-256；旧账号可正常登录并完成渐进迁移；日志不输出密码或哈希。

## P1：token 过期与撤销

- 状态：待评估
- 当前风险：token 没有过期校验，泄露后可长期使用。
- 当前缓解：主动退出会删除当前 token。
- 触发条件：用户量增长、出现企业客户或安全审计要求。
- 目标方案：增加过期时间、最后使用时间、全设备退出和管理员撤销能力。
- 验收标准：过期 token 返回 401；退出和撤销立即失效；可查看并终止活跃会话。

## P1：登录限流

- 状态：待评估
- 当前风险：登录接口没有明确的失败频率限制，存在暴力尝试风险。
- 当前缓解：登录失败不区分用户名不存在或密码错误。
- 触发条件：开放公网注册或登录失败量明显增长。
- 目标方案：按账号与 IP 组合限流，增加渐进延迟和安全告警。
- 验收标准：连续失败请求被限制；正常用户可恢复；日志不记录密码。

## P1：首用户管理员初始化

- 状态：待评估
- 当前风险：全新数据库的第一个注册用户自动成为管理员，错误初始化可能导致接管。
- 当前缓解：生产数据库已初始化，数据目录不随代码覆盖。
- 触发条件：新环境部署、灾备恢复或开放自助注册前。
- 目标方案：通过一次性初始化命令或受保护配置创建管理员，普通注册永不自动提权。
- 验收标准：空数据库公开注册只能创建普通用户；管理员创建过程有明确审计记录。

## P2：token 离开 localStorage

- 状态：待评估
- 当前风险：页面出现 XSS 时，脚本可能读取 `localStorage` 中的 token。
- 当前缓解：React 默认转义页面内容，报告 Markdown 不启用原始 HTML。
- 触发条件：认证安全重构、引入更多第三方脚本或安全评审要求。
- 目标方案：迁移到 `HttpOnly`、`Secure`、合理 `SameSite` 的 Cookie，并补齐 CSRF 防护。
- 验收标准：页面 JavaScript 无法读取 token；跨站请求不能执行受保护写操作；登录与退出流程回归通过。
```

- [ ] **Step 2: 更新架构文档**

在 `docs/architecture.md` 更新 `/login`、`/app`、`/history` 和 `/report/:id` 行为，说明 `AuthContext` 是客户端锁定角色单一来源；明确强化版 A 不构成服务端授权边界，并链接 `未来需迭代内容.md`。

- [ ] **Step 3: 更新交接文档**

在 `docs/handoff.md` 增加本次迭代内容、无 schema 变更、Candidate Prompt 兼容方式、验证命令和风险文档入口。不要写部署完成或生产已生效。

- [ ] **Step 4: 检查文档格式和关键内容**

Run:

```bash
test -f docs/未来需迭代内容.md
rg -n "服务端 token|analysis_mode|强化版 A|Candidate" docs/未来需迭代内容.md docs/architecture.md docs/handoff.md
git diff --check
```

Expected: 三个文档均命中对应内容，`git diff --check` 无输出。

- [ ] **Step 5: 提交 Task 6**

```bash
git add docs/未来需迭代内容.md docs/architecture.md docs/handoff.md
git commit -m "docs: track role isolation risks"
```

### Task 7: 完整验证与浏览器验收

**Files:**
- Verify: `App.tsx`
- Verify: `components/LandingPage.tsx`
- Verify: `components/CandidateFileUpload.tsx`
- Verify: `components/HistoryView.tsx`
- Verify: `components/ReportView.tsx`
- Verify: `src/components/LoginPage.tsx`
- Verify: `src/context/AuthContext.tsx`
- Verify: `services/analysisMode.ts`
- Verify: `services/candidatePrompt.js`
- Verify: `server.js`
- Verify: `tests/analysisMode.test.ts`
- Verify: `tests/promptService.test.mjs`
- Verify: `tests/staticAssets.test.mjs`

- [ ] **Step 1: 确认工作区和提交边界**

Run:

```bash
git status -sb
git log --oneline --decorate -10
git diff HEAD~6..HEAD --stat
```

Expected: 仅包含本计划范围内文件；没有 `.env*`、`data/`、`dist/`、`node_modules/` 或 `.superpowers/`。

- [ ] **Step 2: 运行全量自动化验证**

Run: `npm test && npm run build`

Expected: 所有测试 PASS，Vite 生产构建成功；允许保留既有大 chunk 警告，但不得新增编译错误或缺失资源。

- [ ] **Step 3: 启动本地应用进行桌面端验收**

Run: `npm run dev`

Expected: 前端与后端本地服务启动，无启动错误。匿名浏览器验收首页两种角色入口、登录页预选与改选、登录按钮文案和图标加载；使用不存在的合成用户名验证登录失败为 401 且不写入用户数据。已认证的角色锁定、历史过滤与报告模式判断由前述纯函数、静态契约和构建测试覆盖；不创建测试账号，不读取或修改 `data/app.db` 中的现有用户与报告。

- [ ] **Step 4: 进行移动端验收**

在浏览器中使用移动视口检查公开首页和登录分段控件。Candidate 输入区域、移动导航和报告返回路径由静态契约与构建验证覆盖；恢复普通视口后结束验收。

- [ ] **Step 5: 检查浏览器错误**

确认控制台没有外部 SVG 404、React key/受控输入警告、路由循环或未处理 Promise 错误；网络面板不再请求 `cdn-tos-cn.bytedance.net/...svg`。

- [ ] **Step 6: 提交验证中产生的必要修复**

若验证暴露范围内缺陷，先为缺陷增加失败测试，再修改对应文件并运行 `npm test && npm run build`。仅在有实际修复时执行：

```bash
git add App.tsx components/LandingPage.tsx components/CandidateFileUpload.tsx components/HistoryView.tsx components/ReportView.tsx src/components/LoginPage.tsx src/context/AuthContext.tsx services/analysisMode.ts services/candidatePrompt.js server.js tests/analysisMode.test.ts tests/promptService.test.mjs tests/staticAssets.test.mjs
git commit -m "fix: close role lock verification gaps"
```

- [ ] **Step 7: 最终状态检查**

Run: `git status -sb`

Expected: 工作区干净；本地分支仅领先远端，未执行 push 或生产部署。
