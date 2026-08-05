const ALLOWED_ORIGINS = new Set([
  'https://evalbar.cn',
  'https://www.evalbar.cn',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export const isAllowedOrigin = (origin) => ALLOWED_ORIGINS.has(String(origin ?? ''));

const HASHED_BUILD_ASSET_PATTERN = /\/assets\/[^/]+-[A-Za-z0-9_-]+\.[^/]+$/;
const VERSIONED_PDF_FONT_PATTERN = /\/fonts\/NotoSansSC-(?:Regular|Bold)-v1\.otf$/;

export const applyStaticAssetCacheHeaders = (res, filePath) => {
  const normalizedPath = String(filePath ?? '').replaceAll('\\', '/');
  if (
    HASHED_BUILD_ASSET_PATTERN.test(normalizedPath)
    || VERSIONED_PDF_FONT_PATTERN.test(normalizedPath)
  ) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
};

export const applySecurityHeaders = (res) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
  ].join('; '));
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
};
