import { pathToFileURL } from 'node:url';

const ALLOWED_PROVIDERS = new Set(['glm', 'kimi']);
const DEFAULT_PROVIDERS = ['glm', 'kimi'];
const PROVIDER_LABELS = Object.freeze({
  glm: 'GLM 5.2',
  kimi: 'Kimi K3',
});

const stableErrorCode = (error) => (
  typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
    ? error.code
    : 'PROVIDER_COMPARISON_FAILED'
);

export const parseComparisonArgs = (args) => {
  const execute = args.includes('--execute');
  const providerArgument = args.find((argument) => argument.startsWith('--providers='));
  const providers = providerArgument
    ? providerArgument.slice('--providers='.length).split(',').filter(Boolean)
    : [...DEFAULT_PROVIDERS];

  if (providers.length === 0) throw new Error('At least one comparison provider is required');
  for (const provider of providers) {
    if (!ALLOWED_PROVIDERS.has(provider)) {
      throw new Error(`Unsupported comparison provider: ${provider}`);
    }
  }
  if (new Set(providers).size !== providers.length) {
    throw new Error('Comparison providers must be unique');
  }

  return { execute, providers };
};

export const buildComparisonFileName = (fileName, provider) => {
  const label = PROVIDER_LABELS[provider];
  if (!label) throw new Error(`Unsupported comparison provider: ${provider}`);
  const suffix = ` · ${label}`;
  const baseName = typeof fileName === 'string' && fileName.trim()
    ? fileName.trim()
    : '粘贴的面试记录';
  return `${baseName.slice(0, 255 - suffix.length)}${suffix}`;
};

const loadProductionRuntime = async () => {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: '.env', quiet: true });
  dotenv.config({ path: '.env.local', override: true, quiet: true });

  const [
    { reportService },
    { promptService },
    { buildRecruiterInput },
    { applyPromptSecurityContract, validateAnalysisOutput },
    { createAiService },
  ] = await Promise.all([
    import('../services/reportService.js'),
    import('../services/promptService.js'),
    import('../services/analysisRequest.js'),
    import('../services/promptSecurity.js'),
    import('../services/aiService.js'),
  ]);

  return {
    getLatestRecruiterReport: () => reportService.getAll('recruiter')[0] ?? null,
    getSystemPrompt: () => promptService.getCurrentPrompt('recruiter').content,
    buildInput: (source) => buildRecruiterInput(source),
    applySecurityContract: applyPromptSecurityContract,
    createService: (provider) => createAiService({
      env: {
        ...process.env,
        AI_PROVIDER: provider,
        AI_MAX_RETRIES: '0',
      },
    }),
    validateOutput: validateAnalysisOutput,
    saveReport: ({ source, provider, model, result }) => reportService.create({
      analysisMode: 'recruiter',
      jobTitle: source.jobTitle,
      competencies: source.competencies,
      fileName: buildComparisonFileName(source.fileName, provider, model),
      transcript: source.transcript,
      result,
    }, source.userId),
  };
};

export const runProviderComparison = async ({
  args = process.argv.slice(2),
  loadRuntime = loadProductionRuntime,
  write = (entry) => console.info(JSON.stringify(entry)),
  now = Date.now,
} = {}) => {
  const { execute, providers } = parseComparisonArgs(args);
  if (!execute) throw new Error('--execute is required for paid provider comparison');

  const runtime = await loadRuntime();
  const source = await runtime.getLatestRecruiterReport();
  if (!source || source.analysisMode === 'candidate') {
    throw new Error('No recruiter report is available for comparison');
  }
  if (!source.userId) throw new Error('Source report has no owner');

  const inputContent = runtime.buildInput(source);
  const systemPrompt = runtime.applySecurityContract(runtime.getSystemPrompt());
  const reportIds = [];
  let failures = 0;

  for (const provider of providers) {
    const startedAt = now();
    let model = provider === 'glm' ? 'glm-5.2' : 'kimi-k3';
    try {
      const service = runtime.createService(provider);
      model = service.model;
      const rawResult = await service.runAnalysis({
        systemPrompt,
        inputContent,
        signal: new AbortController().signal,
      });
      const result = runtime.validateOutput(rawResult);
      const report = await runtime.saveReport({ source, provider, model, result });
      const durationMs = Math.max(0, now() - startedAt);
      reportIds.push(report.id);
      write({
        event: 'provider_comparison_completed',
        sourceReportId: source.id,
        provider,
        model,
        reportId: report.id,
        status: 'success',
        durationMs,
        inputChars: inputContent.length,
        outputChars: result.length,
        errorCode: null,
      });
    } catch (error) {
      failures += 1;
      write({
        event: 'provider_comparison_completed',
        sourceReportId: source.id,
        provider,
        model,
        reportId: null,
        status: 'failure',
        durationMs: Math.max(0, now() - startedAt),
        inputChars: inputContent.length,
        outputChars: 0,
        errorCode: stableErrorCode(error),
      });
    }
  }

  return {
    sourceReportId: source.id,
    reportIds,
    failures,
  };
};

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runProviderComparison()
    .then(({ failures }) => {
      if (failures > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({
        event: 'provider_comparison_failed',
        errorCode: stableErrorCode(error),
      }));
      process.exitCode = 1;
    });
}
