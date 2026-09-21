interface RecordingUploadPresentationInput {
  hasFile: boolean;
  consent: boolean;
  busy: boolean;
}

export function getRecordingUploadPresentation({
  hasFile,
  consent,
  busy,
}: RecordingUploadPresentationInput) {
  return {
    canSubmit: hasFile && consent && !busy,
    step: hasFile ? 'selected' as const : 'empty' as const,
  };
}

export function formatRecordingFileSize(bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / 1024 ** 2;
  return `${Number(megabytes.toFixed(1))} MB`;
}
