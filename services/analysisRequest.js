export const normalizeAnalysisMode = (value) => {
  const mode = value ?? 'recruiter';
  if (mode !== 'candidate' && mode !== 'recruiter') {
    throw new Error('Invalid analysisMode');
  }
  return mode;
};

const requireText = (data, fields) => {
  const missing = fields.filter((field) => typeof data[field] !== 'string' || !data[field].trim());
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
};

export const validateAnalysisRequest = (data) => {
  const analysisMode = normalizeAnalysisMode(data.analysisMode);
  requireText(data, analysisMode === 'candidate'
    ? ['transcript', 'jobTitle']
    : ['transcript', 'jobTitle', 'competencies']);
  return analysisMode;
};

const wrapInputJson = (payload) => {
  const json = JSON.stringify(payload, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  return `<input_json>\n${json}\n</input_json>`;
};

export const buildCandidateInput = ({
  jobTitle,
  jobDescription,
  resumeText,
  resumeParseStatus,
  transcript
}) => {
  const usableResume = resumeParseStatus === 'usable' || resumeParseStatus === 'manual';
  return wrapInputJson({
    jobTitle,
    jobDescription: jobDescription || null,
    resume: {
      parseStatus: resumeParseStatus || 'not_provided',
      content: usableResume ? resumeText || null : null
    },
    transcript
  });
};

export const buildRecruiterInput = ({ jobTitle, competencies, transcript }) => wrapInputJson({
  jobTitle,
  competencies,
  transcript
});
