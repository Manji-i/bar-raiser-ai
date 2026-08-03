import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const recruiterUpload = readFileSync(
  new URL('../components/FileUpload.tsx', import.meta.url),
  'utf8',
);
const authContext = readFileSync(
  new URL('../src/context/AuthContext.tsx', import.meta.url),
  'utf8',
);
const loginPage = readFileSync(
  new URL('../src/components/LoginPage.tsx', import.meta.url),
  'utf8',
);
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const landingPage = readFileSync(
  new URL('../components/LandingPage.tsx', import.meta.url),
  'utf8',
);
const candidateUpload = readFileSync(
  new URL('../components/CandidateFileUpload.tsx', import.meta.url),
  'utf8',
);
const reportView = readFileSync(
  new URL('../components/ReportView.tsx', import.meta.url),
  'utf8',
);

test('页面入口不引用不存在的 index.css', () => {
  assert.doesNotMatch(indexHtml, /href=["']\/index\.css["']/);
});

test('招聘方上传页不使用未安装的 Tailwind 动画或未定义工具类', () => {
  assert.doesNotMatch(
    recruiterUpload,
    /\b(?:animate-in|fade-in|slide-in-from-[^\s"'`]+|hide-scrollbar)\b/,
  );
});

test('登录与注册显式绑定角色，认证上下文缺少角色时拒绝恢复会话', () => {
  assert.match(authContext, /analysisMode:\s*AnalysisMode\s*\|\s*null/);
  assert.match(authContext, /savedToken\s*&&\s*savedUser\s*&&\s*savedMode/);
  assert.match(authContext, /login:\s*\([^)]*analysisMode:\s*AnalysisMode/);
  assert.match(authContext, /register:\s*\([^)]*analysisMode:\s*AnalysisMode/);
});

test('登录页提供两个角色选项且主按钮只显示登录或注册', () => {
  assert.match(loginPage, /提升自己/);
  assert.match(loginPage, /判断他人/);
  assert.match(loginPage, /await login\(username, password, selectedMode\)/);
  assert.match(loginPage, /await register\(username, password, selectedMode,/);
  assert.doesNotMatch(loginPage, /以.+身份(?:登录|注册)/);
});

test('顶部导航不提供角色切换入口', () => {
  assert.doesNotMatch(app, /const switchMode/);
  assert.doesNotMatch(app, /aria-label="分析模式"/);
});

test('已登录首页入口使用锁定角色，不硬编码招聘方角色', () => {
  assert.match(landingPage, /const \{ user, analysisMode \} = useAuth\(\)/);
  assert.match(landingPage, /setPostLoginMode\(mode\)/);
  assert.doesNotMatch(landingPage, /modePath\('recruiter', 'app'\)/);
});

test('产品图标不依赖外部 TOS SVG', () => {
  assert.doesNotMatch(landingPage, /cdn-tos-cn\.bytedance\.net/);
  assert.doesNotMatch(candidateUpload, /cdn-tos-cn\.bytedance\.net/);
  assert.doesNotMatch(candidateUpload, /UPLOAD_ICON_URL/);
});

test('Candidate 岗位与 JD 输入区域保持等高', () => {
  const fieldSource = (testId) => candidateUpload.match(
    new RegExp(`<textarea\\s+[\\s\\S]*?data-testid="${testId}"[\\s\\S]*?\\/>`),
  )?.[0] ?? '';

  assert.match(fieldSource('candidate-job-title'), /className="[^"]*h-28[^"]*resize-none/);
  assert.match(fieldSource('candidate-job-description'), /className="[^"]*h-28[^"]*resize-none/);
});

test('PDF 导出不再依赖截图或系统打印', () => {
  assert.doesNotMatch(indexHtml, /html2pdf(?:\.bundle)?(?:\.min)?\.js/);
  assert.doesNotMatch(reportView, /html2pdf|html2canvas|data-html2canvas-ignore|window\.print/);
  assert.match(reportView, /usePreparedReportPdf/);
});
