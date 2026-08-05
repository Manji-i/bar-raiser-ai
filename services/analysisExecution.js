const cancellationError = () => Object.assign(new Error('Analysis request was cancelled'), {
  name: 'AiServiceError',
  code: 'AI_REQUEST_CANCELLED',
  status: 499,
});

const stableErrorCode = (error) => (
  typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
    ? error.code
    : 'INTERNAL_ERROR'
);

export const bindClientDisconnect = (response) => {
  const controller = new AbortController();
  const abortOnClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once('close', abortOnClose);
  controller.dispose = () => response.off('close', abortOnClose);
  return controller;
};

export const executeAnalysis = async ({
  run,
  validate,
  persist,
  signal,
  telemetry,
  release,
}) => {
  try {
    const rawResult = await run(signal);
    if (signal?.aborted) throw cancellationError();
    const resultText = validate(rawResult);
    const result = await persist(resultText);
    telemetry.succeed(typeof resultText === 'string' ? resultText.length : 0);
    return result;
  } catch (error) {
    if (signal?.aborted || error?.code === 'AI_REQUEST_CANCELLED') {
      telemetry.cancel();
    } else {
      telemetry.fail(stableErrorCode(error));
    }
    throw error;
  } finally {
    release();
  }
};
