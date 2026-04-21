// 辅助函数：获取带认证的请求头
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const analyzeInterview = async (
  transcript: string, 
  jobTitle: string, 
  competencies: string,
  fileName: string
): Promise<{ result: string; reportId: string }> => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        transcript,
        jobTitle,
        competencies,
        fileName
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};
