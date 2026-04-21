import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { reportService } from './reportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_FILE = path.join(__dirname, '../data/systemPrompt.json');
const FEEDBACK_FILE = path.join(__dirname, '../data/feedback.json');

// 确保数据目录存在
const ensureDirectoryExistence = (filePath) => {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
};

// 初始化系统提示
const initializePrompt = () => {
  ensureDirectoryExistence(PROMPT_FILE);
  if (!fs.existsSync(PROMPT_FILE)) {
    const initialPrompt = {
      version: 1,
      content: `
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
      `
    };
    fs.writeFileSync(PROMPT_FILE, JSON.stringify(initialPrompt, null, 2));
  }
};

// 确保反馈文件存在
const initializeFeedback = () => {
  ensureDirectoryExistence(FEEDBACK_FILE);
  if (!fs.existsSync(FEEDBACK_FILE)) {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([], null, 2));
  }
};

// 初始化服务
initializePrompt();
initializeFeedback();

// 导出服务
export const promptService = {
  // 获取当前系统提示
  getCurrentPrompt: () => {
    const promptData = JSON.parse(fs.readFileSync(PROMPT_FILE, 'utf8'));
    return promptData;
  },

  // 保存反馈
  saveFeedback: (feedback) => {
    const feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    
    // 获取完整的报告信息，添加到反馈中
    let reportContext = {};
    if (feedback.reportId) {
      const report = reportService.getById(feedback.reportId);
      if (report) {
        reportContext = {
          jobTitle: report.jobTitle,
          competencies: report.competencies,
          fileName: report.fileName,
          transcript: report.transcript,  // 保存面试原文
          assessmentResult: report.result
        };
      }
    }
    
    feedbacks.push({
      ...feedback,
      ...reportContext,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    });
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbacks, null, 2));
    return true;
  },

  // 获取所有反馈，按时间倒序排列
  getAllFeedback: () => {
    const feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    return feedbacks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  // 基于反馈迭代系统提示
  iteratePrompt: (feedbackSummary) => {
    const currentPrompt = JSON.parse(fs.readFileSync(PROMPT_FILE, 'utf8'));
    const feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    
    // 如果没有提供手动总结，自动生成一个
    let finalSummary = feedbackSummary;
    if (!finalSummary && feedbacks.length > 0) {
      finalSummary = generateFeedbackSummary(feedbacks);
    }
    
    // 生成新的提示内容
    const newPrompt = {
      version: currentPrompt.version + 1,
      content: currentPrompt.content + `

<feedback_insights>
${finalSummary}
</feedback_insights>
`
    };
    
    fs.writeFileSync(PROMPT_FILE, JSON.stringify(newPrompt, null, 2));
    return newPrompt;
  }
};

// 自动生成反馈总结 - 作为独立函数
const generateFeedbackSummary = (feedbacks) => {
    const lowRatingFeedbacks = feedbacks.filter(f => f.rating <= 3);
    const issuesCount = {};
    
    // 统计问题出现次数
    feedbacks.forEach(f => {
      if (f.specificIssues) {
        f.specificIssues.forEach(issue => {
          issuesCount[issue] = (issuesCount[issue] || 0) + 1;
        });
      }
    });
    
    let summary = `\n基于 ${feedbacks.length} 条用户反馈的总结：\n\n`;
    
    if (lowRatingFeedbacks.length > 0) {
      summary += `低分反馈（≤3星）：${lowRatingFeedbacks.length} 条\n`;
    }
    
    if (Object.keys(issuesCount).length > 0) {
      summary += '\n常见问题：\n';
      Object.entries(issuesCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([issue, count]) => {
          summary += `- ${issue}：${count} 次\n`;
        });
    }
    
    // 添加用户评论的关键内容
    const comments = feedbacks.filter(f => f.comments && f.comments.trim()).map(f => f.comments);
    if (comments.length > 0) {
      summary += '\n用户评论摘要：\n';
      comments.slice(0, 5).forEach(comment => {
        summary += `- ${comment.substring(0, 200)}${comment.length > 200 ? '...' : ''}\n`;
      });
    }
    
    return summary;
  };
