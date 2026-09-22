import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  absolutePathForKey,
  assertSafeStorageKey,
  assertSinosureUpload,
  parseStoredFile,
  resolveSinosureAttachment,
  SinosureFileError,
  writeSinosureFile,
} from './sinosure-file';

describe('中信保保单文件', () => {
  it('接受 PDF 与常见文档，拒绝空文件、超限与非文档扩展名', () => {
    expect(() => assertSinosureUpload({ originalname: '限额批注.pdf', size: 12 })).not.toThrow();
    expect(() => assertSinosureUpload({ originalname: 'scan.PNG', size: 4 })).not.toThrow();
    expect(() => assertSinosureUpload({ originalname: '条款.docx', size: 8 })).not.toThrow();
    expect(() => assertSinosureUpload({ originalname: '空.pdf', size: 0 })).toThrow(/上传文件为空/);
    expect(() => assertSinosureUpload({ originalname: 'big.pdf', size: 15 * 1024 * 1024 + 1 })).toThrow(/15MB/);
    expect(() => assertSinosureUpload({ originalname: 'malware.exe', size: 8 })).toThrow(/PDF/);
    expect(() => assertSinosureUpload({ originalname: 'noext', size: 8 })).toThrow(/PDF/);
  });

  it('存储键不能逃出上传目录', () => {
    expect(() => assertSafeStorageKey('sinosure/../etc/passwd')).toThrow(SinosureFileError);
    expect(() => assertSafeStorageKey('/etc/passwd')).toThrow(SinosureFileError);
    expect(assertSafeStorageKey('sinosure/case/file.pdf')).toBe('sinosure/case/file.pdf');
    const root = path.join(tmpdir(), 'sinosure-root');
    expect(() => absolutePathForKey('sinosure/../../etc/passwd', root)).toThrow(SinosureFileError);
  });

  it('写入后可按证据载荷找回同一文件', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sinosure-up-'));
    try {
      const body = Buffer.from('%PDF-1.4 demo policy');
      const meta = await writeSinosureFile({
        caseId: 'case_1',
        id: 'file1',
        originalName: '中信保限额批注.pdf',
        buffer: body,
        root,
      });
      expect(meta.storageKey).toBe('sinosure/case_1/file1.pdf');
      expect(meta.fileName).toBe('中信保限额批注.pdf');
      expect(meta.mime).toBe('application/pdf');
      const disk = await readFile(absolutePathForKey(meta.storageKey, root));
      expect(disk.equals(body)).toBe(true);
      expect(parseStoredFile(JSON.stringify(meta))?.sha256).toBe(meta.sha256);
      expect(parseStoredFile({ storageKey: 'sinosure/../../x.pdf' })).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('没有文件也没有编号时拒绝，且不再生成模拟保单', () => {
    expect(() => resolveSinosureAttachment({})).toThrow(/请上传中信保保单/);
    try {
      resolveSinosureAttachment({ fileName: '', evidenceRef: '' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(String((e as Error).message)).not.toMatch(/模拟/);
    }
  });

  it('真实文件名覆盖客户端填写的模拟文件名', () => {
    const stored = {
      storageKey: 'sinosure/c1/a.pdf',
      fileName: '限额批注.pdf',
      mime: 'application/pdf',
      size: 4,
      sha256: 'abc',
    };
    const out = resolveSinosureAttachment({
      evidenceId: 'ev1',
      evidenceRef: 'POL-2026-1',
      fileName: '中信保限额批注-模拟.pdf',
      stored,
    });
    expect(out.fileName).toBe('限额批注.pdf');
    expect(out.evidenceRef).toBe('POL-2026-1');
    expect(out.stored?.storageKey).toBe(stored.storageKey);
  });

  it('沿用已有保单不要求新文件', () => {
    const out = resolveSinosureAttachment({
      confirmedExisting: true,
      evidenceRef: 'SIN-NL-2026',
      fileName: '中信保限额批注-Nordlicht.pdf',
    });
    expect(out.evidenceRef).toBe('SIN-NL-2026');
    expect(out.fileName).toBe('中信保限额批注-Nordlicht.pdf');
  });
});
