export const safeMarkdownUrl = (value: string | undefined): string | null => {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
    return value;
  }

  try {
    const protocol = new URL(value).protocol;
    return ['http:', 'https:', 'mailto:'].includes(protocol) ? value : null;
  } catch {
    return null;
  }
};
