import { db } from './db.js';
import { normalizeAnalysisMode } from './analysisRequest.js';
import { DEFAULT_CANDIDATE_PROMPT_CONTENT } from './candidatePrompt.js';

export const DEFAULT_PROMPT_CONTENT = `
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
**1. 基础信息与画像抓取 (Information Extraction)**
从对话中精准提取候选人的硬性背景，若逐字稿中未提及则标注为“未提及”。
- **基本状态**：在职情况、跳槽动机、面试进展、已有 Offer。
- **职场背书**：当前职级、过往绩效、一句话核心工作内容。

**2. 组织与业务映射 (Org & Business Mapping)**
基于候选人的沟通描述，还原其所在企业的背景：
- **业务架构**：所在业务线的功能、核心逻辑。
- **组织上下文**：汇报对象（上级级别）、平行部门协作关系、团队规模（下属）。

**3. 岗位画像重构 (Profile Reconstruction)**
结合【岗位名称】和用户提供的【能力维度要求】，在心中构建该岗位的“理想画像”。
构建该岗位的“理想画像”应该主要参考用户提供的【能力维度要求】，通过【岗位名称】来拓展补齐。
- 如果岗位是“实习生/专员”，重点考察执行力、学习力、态度（潜质）。
- 如果岗位是“总监/专家”，重点考察战略视野、资源整合、管理能力（即战力）。
*注意：若候选人展示了极强的高阶能力（如战略规划），但岗位仅需基础执行，需在风险中提示“大材小用”或“稳定性风险”。*

**4. 维度对齐与证据提取 (Alignment & Extraction)**
优先针对用户提供的【能力维度要求】寻找证据。
- **强制对齐**：必须针对用户列出的每一个维度进行打分。
- **额外发现**：如果发现了用户未列出但对该【岗位名称】至关重要的能力（例如：销售岗位的“狼性”），请作为“额外加分/减分项”列出。
- **STAR 评估**：继续沿用严格的 STAR 法则提取事实，判断水分。

**5. 评分标准 (Scoring Rubric - 基于岗位层级)**
分数不仅代表能力强弱，更代表**满足岗位需求的程度**：
- **NH (不录用)**: 能力完全不达标，无法胜任该岗位基本职责。
- **H- (谨慎录用)**: 能力勉强达标，但存在明显短板。分享的案例是个人真实案例，STAR缺少证据，项目挑战不大（通常为个人项目，比如：学习PS、常规招聘职位、数量不多时间不紧），没有主动思考如何做的更好，复盘向外归因。
- **H (可录用)**: 能力与岗位要求精准匹配，能胜任工作（Right Fit），分享的案例是个人真实案例，收集到的STAR证据有自己的思考，项目有挑战（比如：项目规模大、技术难度高、时间紧任务重等），个人承担了最重要的部分，主动思考如何解决困难，不回避冲突挑战，有复盘反思和沉淀。
- **H+ (强推荐)**: 核心能力略高于岗位要求，或具备该岗位急需的稀缺特质，能带来额外价值。分享的案例是个人真实案例，收集到的STAR证据有自己的思考，沉淀了方法论，项目有足够的挑战（比如：项目规模大、技术难度高、需要跨部门合作、时间紧任务重等等），个人承担了最重要的部分，主动思考如何解决困难，不回避冲突挑战，有复盘反思和沉淀。
- **MH (不可错过)**: 行业顶尖人才，且极度适配该岗位当前的战略痛点（Perfect Match）。

**6. 分数的核心区别 (Key Distinctions)**
- **NH (不录用)**: 严重作弊，答非所问，逻辑完全不自洽。
- **H- (谨慎录用)**: 分享的案例和证据明显过于简单，专业能力弱，跟岗位匹配度差。比如学习PS、常规招聘职位、招聘数量不多时间不紧。
- **H (可录用)**: 分享的案例和证据与岗位要求匹配，专业能力跟岗位匹配度高，做过的事情有自己的思考（表达清晰，逻辑清晰）。比如学习能力，能快速学习，有学习方法，有复盘和反思。比如抗压能力，能在压力下保持冷静，不回避冲突挑战，有复盘和沉淀。比如自驱积极，针对被设定的目标，能努力达到，主动推进解决卡点。
- **H+ (强推荐)**: 核心能力略高于岗位要求，或具备该岗位急需的稀缺特质，能带来额外价值。在 H 的基础上，做的更进一步，比如学习能力，除了 H 的表述，还有能有对外分享和输出。比如抗压能力，除了 H 的表述，还有积极的解决问题，并且挑战和复杂度更高。比如自驱积极，除了 H 的表述，能主动设定更高目标并且达到。
- **MH (不可不可错过)**: 行业顶尖人才，且极度适配该岗位当前的战略痛点（Perfect Match）。


</core_logic>

<output_requirements>
1. **结论先行**：综合评价需明确回答“匹配”还是“不匹配”，而不仅仅是“优秀”或“不优秀”。
2. **基于画像的建议**：在建议部分，要结合岗位名称。例如：“作为【算法工程师】，该候选人工程落地能力强，但算法创新偏弱...”
3. **风险提示升级**：增加“人岗匹配风险”（如：Overqualified, Underqualified, 动机不纯等）。
</output_requirements>

<output_template>
## 0. 候选人基础概览 (Candidate Overview)
* **岗位/职级**: [当前职级] | **状态**: [是否在职]
* **看机会原因**: [简述原因]
* **面试/Offer情况**: [公司名及进展]
* **过往绩效**: [如: 连续S/前10%等]
* **核心工作**: [一句话总结：负责...实现...]

## 1. 业务架构与组织环境 (Org Mapping)
* **业务背景**: [描述其所在业务的逻辑、规模或技术栈]
* **汇报/组织关系**: [汇报给谁，与哪些部门平行，在组织中的位置]

## 2. 人岗匹配综述 (Job Fit Summary)
* **岗位名称**: [插入岗位名称]
* **匹配结论**: [NH / H- / H / H+ / MH]
* **核心评价**: [一句话总结。不仅评价能力，还要评价匹配度。例如：虽然候选人战略思维极强，但作为【销售专员】岗位，其落地执行意愿存疑，存在人岗错配风险。]

## 3. 指定维度详细评估 (Competency Evaluation)

### [用户指定的维度名称 1]
* **评分**: [分数]
* **STAR 证据**:
    * **S**: ...
    * **A**: ...
    * **R**: ...
* **匹配度分析**: [基于岗位要求的评价。例如：对于【高级经理】岗位，此案例展现的团队规模过小，管理复杂度不足，评分为 H-。]

...(循环所有用户指定的维度)...

## 4. 额外能力发现 (Extra Insights based on Job Title)
* **[模型自动推断的维度]**: [评价]
* *说明：基于【岗位名称】，我发现候选人在该维度表现突出/薄弱，这对岗位成功至关重要。*

## 5. 风险与建议
* **能力短板**: ...
* **匹配风险**: [重点分析：是否大材小用？是否经验断层？文化是否匹配？]
* **后续考察建议**: ...
</output_template>
      `;

const promptTable = (mode) => normalizeAnalysisMode(mode) === 'candidate'
  ? 'candidate_system_prompt'
  : 'system_prompt';

// 初始化系统提示：各模式表为空时写入默认版本。
const initializePrompt = (database, table, content) => {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  if (row.count === 0) {
    database.prepare(`INSERT INTO ${table} (version, content, updated_at) VALUES (?, ?, ?)`)
      .run(1, content, new Date().toISOString());
  }
};

const toFeedback = (row) => ({
  id: row.id,
  reportId: row.report_id,
  rating: row.rating,
  comments: row.comments,
  specificIssues: row.specific_issues ? JSON.parse(row.specific_issues) : undefined,
  jobTitle: row.job_title,
  competencies: row.competencies,
  fileName: row.file_name,
  transcript: row.transcript,
  assessmentResult: row.assessment_result,
  createdAt: row.created_at
});

export const createPromptService = (database) => {
  initializePrompt(database, 'system_prompt', DEFAULT_PROMPT_CONTENT);
  initializePrompt(database, 'candidate_system_prompt', DEFAULT_CANDIDATE_PROMPT_CONTENT);

  const service = {
  // 获取当前系统提示
  getCurrentPrompt: (mode = 'recruiter') => {
    const table = promptTable(mode);
    const row = database.prepare(`SELECT version, content FROM ${table} ORDER BY version DESC LIMIT 1`).get();
    return { version: row.version, content: row.content };
  },

  // 保存反馈
  saveFeedback: (feedback, report = null) => {
    database.prepare(`
      INSERT INTO feedback (id, report_id, rating, comments, specific_issues, job_title, competencies, file_name, transcript, assessment_result, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Date.now().toString(),
      feedback.reportId ?? null,
      feedback.rating ?? null,
      feedback.comments ?? null,
      feedback.specificIssues ? JSON.stringify(feedback.specificIssues) : null,
      report?.jobTitle ?? null,
      report?.competencies ?? null,
      report?.fileName ?? null,
      report?.transcript ?? null,  // 保存面试原文
      report?.result ?? null,
      new Date().toISOString()
    );
    return true;
  },

  // 获取所有反馈，按时间倒序排列
  getAllFeedback: () => {
    const rows = database.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();
    return rows.map(toFeedback);
  },

  // 基于反馈迭代系统提示
  iteratePrompt: (feedbackSummary) => {
    const currentPrompt = service.getCurrentPrompt('recruiter');
    const feedbacks = service.getAllFeedback();

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

    database.prepare('INSERT INTO system_prompt (version, content, updated_at) VALUES (?, ?, ?)')
      .run(newPrompt.version, newPrompt.content, new Date().toISOString());
    return newPrompt;
  },

  // 直接更新系统提示内容（版本 +1）
  updatePrompt: (content, mode = 'recruiter') => {
    const table = promptTable(mode);
    const currentPrompt = service.getCurrentPrompt(mode);
    const newPrompt = {
      version: currentPrompt.version + 1,
      content
    };

    database.prepare(`INSERT INTO ${table} (version, content, updated_at) VALUES (?, ?, ?)`)
      .run(newPrompt.version, newPrompt.content, new Date().toISOString());
    return newPrompt;
  }
  };

  return service;
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

export const promptService = createPromptService(db);
