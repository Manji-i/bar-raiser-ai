import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const RESUME_UPLOAD_ROOT = path.join(moduleDirectory, '..', 'data', 'uploads', 'resumes');

const FILE_RULES = new Map([
  ['application/pdf', { extension: '.pdf', signature: Buffer.from('%PDF-') }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { extension: '.docx', signature: Buffer.from('PK') }],
  ['text/plain', { extension: '.txt', signature: null }]
]);

const safeOriginalName = (originalName) => {
  const normalized = String(originalName ?? '').replace(/\\/g, '/');
  return path.basename(normalized).replace(/[\r\n"]/g, '_');
};

const requireSafeSegment = (value, label) => {
  const segment = String(value ?? '');
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error(`Invalid ${label}`);
  }
  return segment;
};

export const validateResumeFile = (file) => {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error('Resume file is required');
  }

  const declaredSize = Number(file.size ?? file.buffer.length);
  if (declaredSize > MAX_RESUME_BYTES || file.buffer.length > MAX_RESUME_BYTES) {
    throw new Error('Resume file exceeds 10 MB');
  }

  const rule = FILE_RULES.get(file.mimetype);
  if (!rule) throw new Error('Unsupported resume file type');

  const originalName = safeOriginalName(file.originalname);
  if (path.extname(originalName).toLowerCase() !== rule.extension) {
    throw new Error('Resume file extension does not match its MIME type');
  }

  if (rule.signature && !file.buffer.subarray(0, rule.signature.length).equals(rule.signature)) {
    throw new Error(file.mimetype === 'application/pdf' ? 'Invalid PDF signature' : 'Invalid DOCX signature');
  }
  if (!rule.signature && file.buffer.includes(0)) throw new Error('Invalid text file');

  return { ...rule, originalName };
};

export const resolveStoredPath = (rootDir, relativePath) => {
  const root = path.resolve(rootDir);
  const absolutePath = path.resolve(root, String(relativePath ?? ''));
  if (absolutePath === root || !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error('Unsafe attachment path');
  }
  return absolutePath;
};

export const saveResumeFile = async ({
  rootDir = RESUME_UPLOAD_ROOT,
  userId,
  reportId,
  file,
  parseStatus
}) => {
  const rule = validateResumeFile(file);
  const safeUserId = requireSafeSegment(userId, 'user id');
  const safeReportId = requireSafeSegment(reportId, 'report id');
  if (!['usable', 'low_quality', 'empty', 'manual'].includes(parseStatus)) {
    throw new Error('Invalid resume parse status');
  }

  const storedName = `${randomUUID()}${rule.extension}`;
  const relativePath = path.join(safeUserId, storedName);
  const absolutePath = resolveStoredPath(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, file.buffer, { flag: 'wx' });

  return {
    id: randomUUID(),
    reportId: safeReportId,
    userId: safeUserId,
    kind: 'resume',
    originalName: rule.originalName,
    storedName,
    relativePath,
    mimeType: file.mimetype,
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    parseStatus,
    createdAt: new Date().toISOString()
  };
};

export const deleteAttachmentFile = async (rootDir, relativePath) => {
  const absolutePath = resolveStoredPath(rootDir, relativePath);
  try {
    await unlink(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

export const reportAttachmentService = {
  saveResumeFile: (options) => saveResumeFile({ rootDir: RESUME_UPLOAD_ROOT, ...options }),
  resolveStoredPath: (relativePath) => resolveStoredPath(RESUME_UPLOAD_ROOT, relativePath),
  deleteAttachmentFile: (relativePath) => deleteAttachmentFile(RESUME_UPLOAD_ROOT, relativePath)
};
