import type { AnalysisInput } from '../types';

export const buildAnalysisRequest = (
  input: AnalysisInput,
): { headers: Headers; body: BodyInit } => {
  const headers = new Headers();

  if (input.analysisMode === 'candidate' && input.resumeFile) {
    const body = new FormData();
    body.set('analysisMode', input.analysisMode);
    body.set('jobTitle', input.jobTitle);
    body.set('jobDescription', input.jobDescription);
    body.set('transcript', input.transcript);
    body.set('fileName', input.fileName);
    body.set('resumeText', input.resumeText);
    body.set('resumeParseStatus', input.resumeParseStatus);
    body.set('resumeFile', input.resumeFile);
    return { headers, body };
  }

  headers.set('Content-Type', 'application/json');
  const body = input.analysisMode === 'candidate'
    ? JSON.stringify({
      analysisMode: input.analysisMode,
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
      transcript: input.transcript,
      fileName: input.fileName,
      resumeText: input.resumeText,
      resumeParseStatus: input.resumeParseStatus,
    })
    : JSON.stringify(input);
  return { headers, body };
};

export const analyzeInterview = async (
  input: AnalysisInput
): Promise<{ result: string; reportId: string }> => {
  const request = buildAnalysisRequest(input);
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      credentials: 'same-origin',
      headers: request.headers,
      body: request.body,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Analysis request failed:', error instanceof Error ? error.name : 'Error');
    throw error;
  }
};
