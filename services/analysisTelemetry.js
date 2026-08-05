import { randomUUID } from 'node:crypto';

const safeCount = (value) => (
  Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
);

const defaultWriter = (entry) => {
  console.info(JSON.stringify(entry));
};

export const createAnalysisTelemetry = ({
  analysisMode,
  provider,
  model,
  inputChars,
  now = Date.now,
  createId = randomUUID,
  write = defaultWriter,
}) => {
  const analysisId = createId();
  const startedAt = now();
  let completed = false;

  const complete = ({ status, outputChars = 0, errorCode = null }) => {
    if (completed) return false;
    completed = true;
    write({
      event: 'analysis_completed',
      analysisId,
      analysisMode,
      provider,
      model,
      status,
      durationMs: Math.max(0, now() - startedAt),
      inputChars: safeCount(inputChars),
      outputChars: safeCount(outputChars),
      errorCode,
    });
    return true;
  };

  return {
    analysisId,
    succeed: (outputChars) => complete({ status: 'success', outputChars }),
    fail: (errorCode = 'INTERNAL_ERROR') => complete({ status: 'failure', errorCode }),
    cancel: () => complete({
      status: 'cancelled',
      errorCode: 'AI_REQUEST_CANCELLED',
    }),
  };
};
