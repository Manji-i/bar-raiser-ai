import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { reportService } from './services/reportService.js';
import { promptService } from './services/promptService.js';
import { userService } from './services/userService.js';
import feishuService from './services/feishuService.js';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// 认证中间件
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.slice(7);
  const user = userService.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = user;
  next();
};

// 管理员认证中间件
const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Get system prompt from promptService
const getSystemPrompt = () => {
  const promptData = promptService.getCurrentPrompt();
  return promptData.content;
};

// Model Configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // 'gemini' or 'doubao'

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

// API Routes

// User Endpoints
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = userService.register(username, password, email);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = userService.login(username, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.slice(7);
    userService.logout(token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// 飞书OAuth配置端点
app.get('/api/auth/feishu/config', (req, res) => {
  try {
    res.json({
      configured: feishuService.isFeishuConfigured(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 飞书登录URL
app.get('/api/auth/feishu/url', (req, res) => {
  try {
    if (!feishuService.isFeishuConfigured()) {
      return res.status(400).json({ error: '飞书OAuth未配置' });
    }
    
    const state = feishuService.generateState();
    const authUrl = feishuService.getFeishuAuthUrl(state);
    
    // 保存state到cookie用于验证
    res.cookie('feishu_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000, // 5分钟
    });
    
    res.json({ authUrl });
  } catch (error) {
    console.error('获取飞书登录URL错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 飞书回调处理
app.get('/api/auth/feishu/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const savedState = req.cookies.feishu_oauth_state;
    
    if (!code || !state) {
      return res.status(400).json({ error: '缺少必需参数' });
    }
    
    // 验证state
    if (state !== savedState) {
      return res.status(400).json({ error: '无效的state值' });
    }
    
    // 获取飞书token
    const { accessToken } = await feishuService.getFeishuToken(code);
    
    // 获取飞书用户信息
    const feishuUser = await feishuService.getFeishuUserInfo(accessToken);
    
    // 登录或注册用户
    const authResult = userService.loginOrRegisterFeishuUser(
      feishuUser.userId,
      feishuUser.name,
      feishuUser.email,
      feishuUser.avatar
    );
    
    // 清除state cookie
    res.clearCookie('feishu_oauth_state');
    
    // 重定向到前端，并传递token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = new URL('/auth/feishu/callback', frontendUrl);
    redirectUrl.searchParams.set('token', authResult.token);
    redirectUrl.searchParams.set('user', encodeURIComponent(JSON.stringify(authResult.user)));
    
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('飞书登录错误:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const errorUrl = new URL('/auth/feishu/error', frontendUrl);
    errorUrl.searchParams.set('error', error.message || '登录失败');
    res.redirect(errorUrl.toString());
  }
});

// Analyze Interview (需要认证)
app.post('/api/analyze', authenticate, async (req, res) => {
  console.log(`[API /api/analyze] Request received. AI_PROVIDER is: ${AI_PROVIDER}`);
  try {
    const { transcript, jobTitle, competencies, fileName } = req.body;

    if (!transcript || !jobTitle || !competencies) {
      return res.status(400).json({ error: 'Missing required fields: transcript, jobTitle, competencies' });
    }

    const inputContent = `
=== INPUT DATA START ===
**Job Title**: ${jobTitle}

**Competency Model Requirements**:
${competencies}

**Interview Transcript**:
${transcript}
=== INPUT DATA END ===

Please analyze the transcript based on the Job Title and Competency Model provided above.
`;

    let resultText = "";

    const systemPrompt = getSystemPrompt();
    
    if (AI_PROVIDER === 'gemini') {
        if (!googleAi) throw new Error("Gemini is not configured.");
        const response = await googleAi.models.generateContent({
            model: "gemini-3-pro-preview", 
            contents: inputContent,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.4, 
            },
        });
        resultText = response.text ? response.text() : null;
    } else if (AI_PROVIDER === 'doubao') {
        if (!openai) throw new Error("Doubao (OpenAI) is not configured.");
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: inputContent },
            ],
            model: process.env.DOUBAO_ENDPOINT_ID,
            temperature: 0.4,
        });
        resultText = completion.choices[0]?.message?.content;
    } else {
        throw new Error(`Unsupported AI Provider: ${AI_PROVIDER}`);
    }

    if (resultText) {
      // 保存报告，关联用户ID
      const report = reportService.create({
        jobTitle,
        competencies,
        fileName: fileName || 'Unknown File',
        transcript,
        result: resultText
      }, req.user.id);

      res.json({ result: resultText, reportId: report.id });
    } else {
      throw new Error("No text response received from AI service.");
    }

  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "An error occurred during analysis." });
  }
});

// Reports Endpoints (需要认证)
app.get('/api/reports', authenticate, (req, res) => {
  // 普通用户看自己的，管理员可以用 /api/admin/reports 看所有
  const reports = reportService.getByUser(req.user.id);
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

app.delete('/api/reports/:id', authenticate, (req, res) => {
  const success = reportService.delete(req.params.id, req.user.id, req.user.isAdmin);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Report not found" });
  }
});

// Admin Reports Endpoints (仅管理员)
app.get('/api/admin/reports', authenticate, requireAdmin, (req, res) => {
  const reports = reportService.getAll();
  res.json(reports);
});

// Feedback Endpoints (需要认证)
app.post('/api/feedback', authenticate, (req, res) => {
  try {
    const { reportId, rating, comments, specificIssues } = req.body;
    
    if (!reportId || !rating) {
      return res.status(400).json({ error: 'Missing required fields: reportId, rating' });
    }
    
    const feedback = {
      reportId,
      rating,
      comments,
      specificIssues
    };
    
    const report = reportService.getById(reportId, req.user.id, req.user.isAdmin);
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
    const { feedbackSummary } = req.body;
    
    if (!feedbackSummary) {
      return res.status(400).json({ error: 'Missing required field: feedbackSummary' });
    }
    
    const newPrompt = promptService.iteratePrompt(feedbackSummary);
    res.json({ success: true, prompt: newPrompt });
  } catch (error) {
    console.error("Error iterating prompt:", error);
    res.status(500).json({ error: error.message || "An error occurred while iterating prompt." });
  }
});

// Get Current Prompt Endpoint
app.get('/api/prompt/current', authenticate, requireAdmin, (req, res) => {
  try {
    const prompt = promptService.getCurrentPrompt();
    res.json(prompt);
  } catch (error) {
    console.error("Error getting current prompt:", error);
    res.status(500).json({ error: error.message || "An error occurred while getting current prompt." });
  }
});

// Update Current Prompt Endpoint
app.put('/api/prompt/current', authenticate, requireAdmin, (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }
    
    const currentPrompt = promptService.getCurrentPrompt();
    const newPrompt = {
      version: currentPrompt.version + 1,
      content: content
    };
    
    // Directly write the new prompt to file using already imported fs
    const PROMPT_FILE = path.join(__dirname, 'data/systemPrompt.json');
    fs.writeFileSync(PROMPT_FILE, JSON.stringify(newPrompt, null, 2));
    
    res.json({ success: true, prompt: newPrompt });
  } catch (error) {
    console.error("Error updating prompt:", error);
    res.status(500).json({ error: error.message || "An error occurred while updating prompt." });
  }
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
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`AI Provider: ${AI_PROVIDER}`);
  });
}
