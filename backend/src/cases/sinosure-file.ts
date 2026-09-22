import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

/** 中信保保单：PDF 以及常见办公文档 / 图片。 */
export const SINOSURE_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
] as const;

export const SINOSURE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export class SinosureFileError extends Error {}

export type StoredFileMeta = {
  storageKey: string;
  fileName: string;
  mime: string;
  size: number;
  sha256: string;
};

export function uploadRoot(): string {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  const db = process.env.DATABASE_URL || '';
  if (db.includes('/data/')) return '/data/uploads';
  return path.resolve(process.cwd(), 'uploads');
}

export function sinosureFileExtension(name: string): string {
  const base = basenameOnly(name);
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

export function basenameOnly(name: string): string {
  const base = String(name || '')
    .split(/[/\\]/)
    .pop()
    ?.replace(/[\u0000-\u001f]/g, '')
    .trim();
  return (base || 'sinosure-policy').slice(0, 180);
}

export function assertSinosureUpload(file: { originalname: string; size: number }): void {
  const ext = sinosureFileExtension(file.originalname);
  if (!SINOSURE_UPLOAD_EXTENSIONS.includes(ext as (typeof SINOSURE_UPLOAD_EXTENSIONS)[number])) {
    throw new SinosureFileError('中信保保单仅支持 PDF、Word、Excel 或常见图片');
  }
  if (!file.size || file.size <= 0) throw new SinosureFileError('上传文件为空');
  if (file.size > SINOSURE_UPLOAD_MAX_BYTES) throw new SinosureFileError('保单文件不能超过 15MB');
}

export function safeStorageKey(caseId: string, fileId: string, originalName: string): string {
  const ext = sinosureFileExtension(originalName);
  const safeCase = String(caseId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeId = String(fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeCase || !safeId || !ext) throw new SinosureFileError('无法保存保单文件');
  return `sinosure/${safeCase}/${safeId}${ext}`;
}

const STORAGE_KEY_PREFIXES = ['sinosure/', 'trade-docs/'] as const;

export function assertSafeStorageKey(key: string): string {
  const norm = String(key || '').replace(/\\/g, '/').trim();
  const allowed = STORAGE_KEY_PREFIXES.some((prefix) => norm.startsWith(prefix));
  if (!allowed || norm.includes('..') || norm.includes('\0')) {
    throw new SinosureFileError('非法文件引用');
  }
  return norm;
}

export function absolutePathForKey(key: string, root = uploadRoot()): string {
  const safe = assertSafeStorageKey(key);
  const abs = path.resolve(root, safe);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new SinosureFileError('非法文件引用');
  }
  return abs;
}

export function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export function parseStoredFile(payload: unknown): StoredFileMeta | null {
  let value = payload;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const storageKey = String(row.storageKey || '').trim();
  if (!storageKey) return null;
  try {
    assertSafeStorageKey(storageKey);
  } catch {
    return null;
  }
  return {
    storageKey,
    fileName: basenameOnly(String(row.fileName || 'sinosure-policy')),
    mime: String(row.mime || mimeForExt(sinosureFileExtension(String(row.fileName || storageKey)))),
    size: Number(row.size) || 0,
    sha256: String(row.sha256 || ''),
  };
}

export async function writeSinosureFile(input: {
  caseId: string;
  id?: string;
  originalName: string;
  buffer: Buffer;
  root?: string;
}): Promise<StoredFileMeta> {
  const fileName = basenameOnly(input.originalName);
  assertSinosureUpload({ originalname: fileName, size: input.buffer?.length || 0 });
  const id = input.id || randomUUID();
  const storageKey = safeStorageKey(input.caseId, id, fileName);
  const abs = absolutePathForKey(storageKey, input.root);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.buffer);
  return {
    storageKey,
    fileName,
    mime: mimeForExt(sinosureFileExtension(fileName)),
    size: input.buffer.length,
    sha256: createHash('sha256').update(input.buffer).digest('hex'),
  };
}

export function contentDisposition(mime: string, fileName: string): string {
  const inline = mime === 'application/pdf' || mime.startsWith('image/');
  return `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export type SinosureAttachmentInput = {
  confirmedExisting?: boolean;
  evidenceRef?: string | null;
  fileName?: string | null;
  evidenceId?: string | null;
  stored?: StoredFileMeta | null;
};

/**
 * 不再生成「模拟.pdf」。有真实文件时文件名以落盘为准。
 * 沿用已有保单、或仅有历史编号时仍可保存；两者都空则拒绝。
 */
export function resolveSinosureAttachment(input: SinosureAttachmentInput): {
  evidenceRef: string;
  fileName: string;
  stored: StoredFileMeta | null;
} {
  const stored = input.stored || null;
  const evidenceRef = String(input.evidenceRef || '').trim();
  let fileName = String(input.fileName || '').trim();
  if (stored) fileName = stored.fileName;
  if (input.confirmedExisting) {
    return { evidenceRef, fileName, stored };
  }
  if (!evidenceRef && !fileName && !input.evidenceId) {
    throw new SinosureFileError('请上传中信保保单');
  }
  return { evidenceRef, fileName, stored };
}
