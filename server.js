import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { reportService } from './services/reportService.js';
import { promptService } from './services/promptService.js';
import { userService } from './services/userService.js';
import { applyCandidateConclusionContract } from './services/candidatePrompt.js';
import {
  buildCandidateInput,
  buildRecruiterInput,
  normalizeAnalysisMode,
  validateAnalysisRequest
} from './services/analysisRequest.js';
import {
  reportAttachmentService,
  validateResumeFile
} from './services/reportAttachmentService.js';
import { getListenHost } from './services/serverConfig.js';
import {
  SESSION_COOKIE_NAME,
  clearCookieOptions,
  cookieOptions,
  extractSessionToken,
} from './services/authSession.js';
import { SESSION_TTL_MS } from './services/sessionToken.js';
import {
  createConcurrencyGuard,
  createWindowGuard,
} from './services/requestGuards.js';
import { validateFeedback } from './services/feedbackValidation.js';
import {
  applyPromptSecurityContract,
  validateAnalysisOutput,
} from './services/promptSecurity.js';
import {
  applySecurityHeaders,
  isAllowedOrigin,
} from './services/httpSecurity.js';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = getListenHost();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use((req, res, next) => {
  applySecurityHeaders(res);
  next();
});
app.use((req, res, next) => {
  const origin = req.get('Origin');
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (origin && isWrite && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      error: 'Origin not allowed',
      code: 'ORIGIN_NOT_ALLOWED',
    });
  }
  return next();
});
app.use(express.json({ limit: '512kb' }));
app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body exceeds 512 KB',
      code: 'REQUEST_TOO_LARGE',
    });
  }
  return next(error);
});
app.use(cookieParser());

const requestLimits = {
  registerIp: createWindowGuard({ windowMs: 60 * 60 * 1000, max: 5 }),
  loginIp: createWindowGuard({ windowMs: 15 * 60 * 1000, max: 20 }),
  loginUser: createWindowGuard({ windowMs: 15 * 60 * 1000, max: 5 }),
  feedbackUser: createWindowGuard({ windowMs: 60 * 60 * 1000, max: 30 }),
  analyzeIp: createWindowGuard({ windowMs: 60 * 60 * 1000, max: 60 }),
  analyzeUser: createWindowGuard({ windowMs: 60 * 60 * 1000, max: 20 }),
  analyzeDailyUser: createWindowGuard({ windowMs: 24 * 60 * 60 * 1000, max: 50 }),
};
const analysisConcurrency = createConcurrencyGuard({ max: 1 });

const requestIp = (req) => String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 256);
const loginUsername = (req) => {
  const normalized = String(req.body?.username ?? '').trim().toLowerCase();
  return (normalized || '<missing>').slice(0, 256);
};
const rejectRateLimited = (res, result) => {
  res.set('Retry-After', String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
  return res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
};
const consumeLimit = (guard, key, res) => {
  const result = guard.consume(key);
  if (result.allowed) return true;
  rejectRateLimited(res, result);
  return false;
};
const limitRegistration = (req, res, next) => {
  if (!consumeLimit(requestLimits.registerIp, requestIp(req), res)) return;
  next();
};
const limitLogin = (req, res, next) => {
  if (!consumeLimit(requestLimits.loginIp, requestIp(req), res)) return;
  if (!consumeLimit(requestLimits.loginUser, loginUsername(req), res)) return;
  next();
};
const limitFeedback = (req, res, next) => {
  if (!consumeLimit(requestLimits.feedbackUser, req.user.id, res)) return;
  next();
};
const limitAnalysis = (req, res, next) => {
  if (!consumeLimit(requestLimits.analyzeIp, requestIp(req), res)) return;
  if (!consumeLimit(requestLimits.analyzeUser, req.user.id, res)) return;
  if (!consumeLimit(requestLimits.analyzeDailyUser, req.user.id, res)) return;
  next();
};

// 认证中间件
const authenticate = (req, res, next) => {
  const token = extractSessionToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = userService.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = user;
  req.sessionToken = token;
  next();
};

// 管理员认证中间件
const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Model Configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // 'gemini' or 'doubao'
// Doubao model: prefer DOUBAO_MODEL (Ark model ID), fall back to legacy DOUBAO_ENDPOINT_ID
const DOUBAO_MODEL = process.env.DOUBAO_MODEL || process.env.DOUBAO_ENDPOINT_ID || 'doubao-seed-2-1-pro-260628';

// Initialize AI Clients
let googleAi = null;
let openai = null;

if (AI_PROVIDER === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        googleAi = new GoogleGenAI({ apiKey });
    } else {
        console.warn("Warning: GEMINI_API_KEY is not set.");
    }
} else if (AI_PROVIDER === 'doubao') {
    const apiKey = process.env.DOUBAO_API_KEY;
    const baseURL = process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
    if (apiKey) {
        openai = new OpenAI({ apiKey, baseURL });
    } else {
        console.warn("Warning: DOUBAO_API_KEY is not set.");
    }
}

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fields: 7,
    parts: 8,
    fieldSize: 200 * 1024,
    fileSize: 10 * 1024 * 1024,
  },
});

const uploadResume = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  return resumeUpload.single('resumeFile')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Resume file exceeds 10 MB',
        code: 'RESUME_TOO_LARGE',
      });
    }
    if (new Set([
      'LIMIT_FIELD_VALUE',
      'LIMIT_FIELD_COUNT',
      'LIMIT_PART_COUNT',
      'LIMIT_FILE_COUNT',
    ]).has(error.code)) {
      return res.status(413).json({
        error: 'Multipart request exceeds resource limits',
        code: 'MULTIPART_LIMIT_EXCEEDED',
      });
    }
    return res.status(400).json({
      error: 'Invalid resume upload',
      code: 'INVALID_RESUME_UPLOAD',
    });
  });
};

const runAiAnalysis = async (systemPrompt, inputContent) => {
  if (AI_PROVIDER === 'gemini') {
    if (!googleAi) throw new Error('Gemini is not configured.');
    const response = await googleAi.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: inputContent,
      config: { systemInstruction: systemPrompt, temperature: 0.4 }
    });
    return typeof response.text === 'function' ? response.text() : response.text;
  }

  if (AI_PROVIDER === 'doubao') {
    if (!openai) throw new Error('Doubao (OpenAI) is not configured.');
    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: inputContent }
      ],
      model: DOUBAO_MODEL,
      temperature: 0.4
    });
    return completion.choices[0]?.message?.content;
  }

  throw new Error(`Unsupported AI Provider: ${AI_PROVIDER}`);
};

const isRequestValidationError = (error) => (
  /^(Invalid|Missing|Resume|Unsupported)/.test(error?.message ?? '')
  || / exceeds \d+ characters$/.test(error?.message ?? '')
);

// API Routes

// User Endpoints
const setSessionCookie = (req, res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(req.secure));
};

app.post('/api/auth/register', limitRegistration, async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = await userService.register(username, password, email);
    setSessionCookie(req, res, result.token);
    res.json({ user: result.user });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', limitLogin, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = await userService.login(username, password);
    setSessionCookie(req, res, result.token);
    res.json({ user: result.user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/token', limitLogin, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const result = await userService.login(username, password);
    return res.json({
      user: result.user,
      token: result.token,
      expiresIn: Math.floor(SESSION_TTL_MS / 1000),
    });
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  try {
    userService.logout(req.sessionToken);
    res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions(req.secure));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Analyze Interview (需要认证)
app.post('/api/analyze', authenticate, limitAnalysis, uploadResume, async (req, res) => {
  console.log(`[API /api/analyze] Request received. AI_PROVIDER is: ${AI_PROVIDER}`);
  try {
    const analysisMode = validateAnalysisRequest(req.body);
    const resumeParseStatus = req.body.resumeParseStatus || (req.file ? null : 'not_provided');

    if (req.file && analysisMode !== 'candidate') {
      return res.status(400).json({ error: 'Resume upload is only available in candidate mode' });
    }
    if (analysisMode === 'candidate') {
      const validStatuses = new Set(['usable', 'low_quality', 'empty', 'manual', 'not_provided']);
      if (!validStatuses.has(resumeParseStatus)) {
        return res.status(400).json({ error: 'Invalid resume parse status' });
      }
      if (req.file && resumeParseStatus === 'not_provided') {
        return res.status(400).json({ error: 'Resume parse status is required for uploaded files' });
      }
      if (req.file) validateResumeFile(req.file);
    }

    const inputData = { ...req.body, resumeParseStatus };
    const inputContent = analysisMode === 'candidate'
      ? buildCandidateInput(inputData)
      : buildRecruiterInput(inputData);
    const storedPrompt = promptService.getCurrentPrompt(analysisMode).content;
    const productPrompt = analysisMode === 'candidate'
      ? applyCandidateConclusionContract(storedPrompt)
      : storedPrompt;
    const systemPrompt = applyPromptSecurityContract(productPrompt);
    const releaseAnalysis = analysisConcurrency.acquire(req.user.id);
    if (!releaseAnalysis) {
      return res.status(429).json({
        error: 'Analysis already in progress',
        code: 'ANALYSIS_IN_PROGRESS',
      });
    }
    res.once('finish', releaseAnalysis);
    res.once('close', releaseAnalysis);
    const resultText = validateAnalysisOutput(
      await runAiAnalysis(systemPrompt, inputContent),
    );

    const reportId = uuidv4();
    let attachment = null;
    try {
      if (req.file) {
        attachment = await reportAttachmentService.saveResumeFile({
          userId: req.user.id,
          reportId,
          file: req.file,
          parseStatus: resumeParseStatus
        });
      }

      const report = reportService.create({
        id: reportId,
        analysisMode,
        jobTitle: req.body.jobTitle,
        jobDescription: analysisMode === 'candidate' ? req.body.jobDescription : null,
        competencies: analysisMode === 'recruiter' ? req.body.competencies : null,
        fileName: req.body.fileName || '粘贴的面试记录',
        resumeText: analysisMode === 'candidate' ? req.body.resumeText : null,
        transcript: req.body.transcript,
        result: resultText
      }, req.user.id, attachment);

      return res.json({ result: resultText, reportId: report.id });
    } catch (persistError) {
      if (attachment) {
        try {
          await reportAttachmentService.deleteAttachmentFile(attachment.relativePath);
        } catch (cleanupError) {
          console.error('Attachment cleanup failed:', attachment.id, cleanupError?.code || cleanupError?.name || 'Error');
        }
      }
      throw persistError;
    }
  } catch (error) {
    const status = error?.code === 'INVALID_ANALYSIS_OUTPUT'
      ? 502
      : (isRequestValidationError(error) ? 400 : 500);
    console.error('AI Analysis Error:', error?.name || 'Error');
    res.status(status).json({ error: error.message || 'An error occurred during analysis.' });
  }
});

// Reports Endpoints (需要认证)
app.get('/api/reports', authenticate, (req, res) => {
  const rawMode = req.query.analysisMode;
  if (rawMode !== undefined && rawMode !== 'candidate' && rawMode !== 'recruiter') {
    return res.status(400).json({ error: 'Invalid analysisMode' });
  }
  // 普通用户看自己的，管理员可以用 /api/admin/reports 看所有。
  const reports = reportService.getByUser(req.user.id, rawMode);
  res.json(reports);
});

app.get('/api/reports/:id', authenticate, (req, res) => {
  const report = reportService.getById(req.params.id, req.user.id, req.user.isAdmin);
  if (report) {
    res.json(report);
  } else {
    res.status(404).json({ error: "Report not found" });
  }
});

app.get('/api/reports/:id/resume', authenticate, (req, res) => {
  const report = reportService.getById(req.params.id, req.user.id, req.user.isAdmin);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const attachment = reportService.getResumeAttachment(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Resume not found' });

  let absolutePath;
  try {
    absolutePath = reportAttachmentService.resolveStoredPath(attachment.relativePath);
  } catch {
    return res.status(404).json({ error: 'Resume not found' });
  }

  return res.download(absolutePath, attachment.originalName, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: 'Resume not found' });
    }
  });
});

app.delete('/api/reports/:id', authenticate, async (req, res) => {
  const report = reportService.getById(req.params.id, req.user.id, req.user.isAdmin);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const attachments = reportService.getAttachments(req.params.id);
  const success = reportService.delete(req.params.id, req.user.id, req.user.isAdmin);
  if (success) {
    await Promise.all(attachments.map(async (attachment) => {
      try {
        await reportAttachmentService.deleteAttachmentFile(attachment.relativePath);
      } catch (error) {
        console.error('Attachment deletion failed:', attachment.id, error?.code || error?.name || 'Error');
      }
    }));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Report not found' });
  }
});

// Admin Reports Endpoints (仅管理员)
app.get('/api/admin/reports', authenticate, requireAdmin, (req, res) => {
  const rawMode = req.query.analysisMode;
  if (rawMode !== undefined && rawMode !== 'candidate' && rawMode !== 'recruiter') {
    return res.status(400).json({ error: 'Invalid analysisMode' });
  }
  const reports = reportService.getAll(rawMode);
  res.json(reports);
});

// Feedback Endpoints (需要认证)
app.post('/api/feedback', authenticate, limitFeedback, (req, res) => {
  let feedback;
  try {
    feedback = validateFeedback(req.body);
  } catch {
    return res.status(400).json({
      error: 'Invalid feedback',
      code: 'INVALID_FEEDBACK',
    });
  }

  try {
    const report = reportService.getById(feedback.reportId, req.user.id, req.user.isAdmin);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    promptService.saveFeedback(feedback, report);
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving feedback:", error);
    res.status(500).json({ error: error.message || "An error occurred while saving feedback." });
  }
});

app.get('/api/feedback', authenticate, requireAdmin, (req, res) => {
  try {
    const feedbacks = promptService.getAllFeedback();
    res.json(feedbacks);
  } catch (error) {
    console.error("Error getting feedback:", error);
    res.status(500).json({ error: error.message || "An error occurred while getting feedback." });
  }
});

// Prompt Iteration Endpoint
app.post('/api/prompt/iterate', authenticate, requireAdmin, (req, res) => {
  try {
    const { feedbackSummary, analysisMode = 'recruiter' } = req.body;
    const mode = normalizeAnalysisMode(analysisMode);
    if (mode === 'candidate') {
      return res.status(400).json({ error: 'Candidate prompt iteration is not supported' });
    }
    
    if (!feedbackSummary) {
      return res.status(400).json({ error: 'Missing required field: feedbackSummary' });
    }
    
    const newPrompt = promptService.iteratePrompt(feedbackSummary);
    res.json({ success: true, prompt: newPrompt });
  } catch (error) {
    console.error("Error iterating prompt:", error);
    const status = isRequestValidationError(error) ? 400 : 500;
    res.status(status).json({ error: error.message || "An error occurred while iterating prompt." });
  }
});

// Get Current Prompt Endpoint
app.get('/api/prompt/current', authenticate, requireAdmin, (req, res) => {
  try {
    const mode = normalizeAnalysisMode(req.query.analysisMode);
    const prompt = promptService.getCurrentPrompt(mode);
    res.json(prompt);
  } catch (error) {
    console.error("Error getting current prompt:", error);
    const status = isRequestValidationError(error) ? 400 : 500;
    res.status(status).json({ error: error.message || "An error occurred while getting current prompt." });
  }
});

// Update Current Prompt Endpoint
app.put('/api/prompt/current', authenticate, requireAdmin, (req, res) => {
  try {
    const { content, analysisMode = 'recruiter' } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const mode = normalizeAnalysisMode(analysisMode);
    const newPrompt = promptService.updatePrompt(content, mode);

    res.json({ success: true, prompt: newPrompt });
  } catch (error) {
    console.error("Error updating prompt:", error);
    const status = isRequestValidationError(error) ? 400 : 500;
    res.status(status).json({ error: error.message || "An error occurred while updating prompt." });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found', code: 'API_NOT_FOUND' });
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

export { app };

if (process.argv[1] === __filename) {
  app.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
    console.log(`AI Provider: ${AI_PROVIDER}`);
  });
}
