import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import {
  SINOSURE_UPLOAD_EXTENSIONS,
  SINOSURE_UPLOAD_MAX_BYTES,
  absolutePathForKey,
  basenameOnly,
  mimeForExt,
  sinosureFileExtension,
  uploadRoot,
  SinosureFileError,
  type StoredFileMeta,
} from './sinosure-file';

export function assertTradeDocUpload(file: { originalname: string; size: number }): void {
  const ext = sinosureFileExtension(file.originalname);
  if (!SINOSURE_UPLOAD_EXTENSIONS.includes(ext as (typeof SINOSURE_UPLOAD_EXTENSIONS)[number])) {
    throw new SinosureFileError('单证仅支持 PDF、Word、Excel 或常见图片');
  }
  if (!file.size || file.size <= 0) throw new SinosureFileError('上传文件为空');
  if (file.size > SINOSURE_UPLOAD_MAX_BYTES) throw new SinosureFileError('单证文件不能超过 15MB');
}

export function tradeDocStorageKey(caseId: string, slot: string, fileId: string, originalName: string): string {
  const ext = sinosureFileExtension(originalName);
  const safeCase = String(caseId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeSlot = String(slot || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeId = String(fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeCase || !safeSlot || !safeId || !ext) throw new SinosureFileError('无法保存单证文件');
  return `trade-docs/${safeCase}/${safeSlot}/${safeId}${ext}`;
}

export async function writeTradeDocFile(input: {
  caseId: string;
  slot: string;
  id?: string;
  originalName: string;
  buffer: Buffer;
  root?: string;
}): Promise<StoredFileMeta> {
  const fileName = basenameOnly(input.originalName);
  assertTradeDocUpload({ originalname: fileName, size: input.buffer?.length || 0 });
  const id = input.id || randomUUID();
  const storageKey = tradeDocStorageKey(input.caseId, input.slot, id, fileName);
  const abs = absolutePathForKey(storageKey, input.root || uploadRoot());
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
