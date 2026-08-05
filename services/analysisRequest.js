export const normalizeAnalysisMode = (value) => {
  const mode = value ?? 'recruiter';
  if (mode !== 'candidate' && mode !== 'recruiter') {
    throw new Error('Invalid analysisMode');
  }
  return mode;
};

export const ANALYSIS_LIMITS = Object.freeze({
  jobTitle: 200,
  jobDescription: 50000,
  competencies: 5000,
  transcript: 100000,
  resumeText: 100000,
  fileName: 255,
});

const ANALYSIS_FIELD_LABELS = Object.freeze({
  jobTitle: 'Job title',
  jobDescription: 'Job description',
  competencies: 'Competencies',
  transcript: 'Transcript',
  resumeText: 'Resume text',
  fileName: 'File name',
});

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

  for (const [field, maxLength] of Object.entries(ANALYSIS_LIMITS)) {
    const value = data[field];
    if (value === undefined || value === null) continue;
    const label = ANALYSIS_FIELD_LABELS[field];
    if (typeof value !== 'string') throw new Error(`Invalid ${label.toLowerCase()}`);
    if (value.length > maxLength) {
      throw new Error(`${label} exceeds ${maxLength} characters`);
    }
  }
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
