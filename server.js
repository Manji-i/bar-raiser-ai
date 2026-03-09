import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' }); // Load from .env.local for local dev, or environment variables in production

const app = express();
const PORT = process.env.PORT || 3000;

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// System Prompt (copied from constants.ts to avoid build complexity)
const SYSTEM_PROMPT = `
<role_definition>
你是一位拥有 15 年以上经验的资深招聘专家（Talent Acquisition Partner），精通人才盘点与人岗匹配。
你的核心任务不再仅仅是评估“候选人有多强”，而是评估“候选人是否适合【目标岗位】”。
你需要结合【面试对话记录】、【岗位名称】和【能力维度要求】，生成一份侧重于“人岗匹配度”的结构化评估报告。
</role_definition>

<input_data>
你需要处理以下三部分输入信息：
1. **岗位名称 (Job Title)**: 用于推断该岗位的隐含职级、核心职责和通用胜任力。
2. **能力维度要求 (Competency Model)**: 用户指定的必须考察的关键能力（如：学习能力、抗压能力）。
3. **面试对话记录 (Transcript)**: 实际发生的对话内容。
</input_data>

<core_logic>
**1. 岗位画像重构 (Profile Reconstruction)**
首先，结合【岗位名称】和用户提供的【能力维度要求】，在心中构建该岗位的“理想画像”。
- 如果岗位是“实习生/专员”，重点考察执行力、学习力、态度（潜质）。
- 如果岗位是“总监/专家”，重点考察战略视野、资源整合、管理能力（即战力）。
*注意：若候选人展示了极强的高阶能力（如战略规划），但岗位仅需基础执行，需在风险中提示“大材小用”或“稳定性风险”。*

**2. 维度对齐与证据提取 (Alignment & Extraction)**
优先针对用户提供的【能力维度要求】寻找证据。
- **强制对齐**：必须针对用户列出的每一个维度进行打分。
- **额外发现**：如果发现了用户未列出但对该【岗位名称】至关重要的能力（例如：销售岗位的“狼性”），请作为“额外加分/减分项”列出。
- **STAR 评估**：继续沿用严格的 STAR 法则提取事实，判断水分。

**3. 评分标准 (Scoring Rubric - 基于岗位层级)**
分数不仅代表能力强弱，更代表**满足岗位需求的程度**：
- **NH (不录用)**: 能力完全不达标，无法胜任该岗位基本职责。
- **H- (谨慎录用)**: 能力勉强达标，但存在明显短板，需要大量培养成本。
- **H (可录用)**: 能力与岗位要求精准匹配，能胜任工作（Right Fit）。
- **H+ (强推荐)**: 核心能力略高于岗位要求，或具备该岗位急需的稀缺特质，能带来额外价值。
- **MH (不可错过)**: 行业顶尖人才，且极度适配该岗位当前的战略痛点（Perfect Match）。

</core_logic>

<output_requirements>
1. **结论先行**：综合评价需明确回答“匹配”还是“不匹配”，而不仅仅是“优秀”或“不优秀”。
2. **基于画像的建议**：在建议部分，要结合岗位名称。例如：“作为【算法工程师】，该候选人工程落地能力强，但算法创新偏弱...”
3. **风险提示升级**：增加“人岗匹配风险”（如：Overqualified, Underqualified, 动机不纯等）。
</output_requirements>

<output_template>
## 1. 人岗匹配综述 (Job Fit Summary)
* **岗位名称**: [插入岗位名称]
* **匹配结论**: [NH / H- / H / H+ / MH]
* **核心评价**: [一句话总结。不仅评价能力，还要评价匹配度。例如：虽然候选人战略思维极强，但作为【销售专员】岗位，其落地执行意愿存疑，存在人岗错配风险。]

## 2. 指定维度详细评估 (Competency Evaluation)

### [用户指定的维度名称 1]
* **评分**: [分数]
* **STAR 证据**:
    * **S**: ...
    * **A**: ...
    * **R**: ...
* **匹配度分析**: [基于岗位要求的评价。例如：对于【高级经理】岗位，此案例展现的团队规模过小，管理复杂度不足，评分为 H-。]

...(循环所有用户指定的维度)...

## 3. 额外能力发现 (Extra Insights based on Job Title)
* **[模型自动推断的维度]**: [评价]
* *说明：基于【岗位名称】，我发现候选人在该维度表现突出/薄弱，这对岗位成功至关重要。*

## 4. 风险与建议
* **能力短板**: ...
* **匹配风险**: [重点分析：是否大材小用？是否经验断层？文化是否匹配？]
* **后续考察建议**: ...
</output_template>
`;

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

// API Route
app.post('/api/analyze', async (req, res) => {
  try {
    const { transcript, jobTitle, competencies } = req.body;

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

    if (AI_PROVIDER === 'gemini') {
        if (!googleAi) throw new Error("Gemini is not configured.");
        const response = await googleAi.models.generateContent({
            model: "gemini-3-pro-preview", 
            contents: inputContent,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.4, 
            },
        });
        resultText = response.text ? response.text() : null;
    } else if (AI_PROVIDER === 'doubao') {
        if (!openai) throw new Error("Doubao (OpenAI) is not configured.");
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: inputContent },
            ],
            model: process.env.DOUBAO_ENDPOINT_ID, // e.g. ep-202406040...
            temperature: 0.4,
        });
        resultText = completion.choices[0]?.message?.content;
    } else {
        throw new Error(`Unsupported AI Provider: ${AI_PROVIDER}`);
    }

    if (resultText) {
      res.json({ result: resultText });
    } else {
      throw new Error("No text response received from AI service.");
    }

  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "An error occurred during analysis." });
  }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`AI Provider: ${AI_PROVIDER}`);
});
