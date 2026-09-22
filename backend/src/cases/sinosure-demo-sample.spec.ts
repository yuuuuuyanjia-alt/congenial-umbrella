import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  absolutePathForKey,
  assertSinosureUpload,
  writeSinosureFile,
} from './sinosure-file';

const samplePdf = path.resolve(
  __dirname,
  '../../../miniapp/src/static/samples/sinosure-demo-policy.pdf',
);
const sampleModule = path.resolve(__dirname, '../../../miniapp/src/demo-sinosure-sample.ts');

describe('N3 演示示例保单', () => {
  it('静态 PDF 与内置字节一致，且仍须非空才能落盘', async () => {
    const disk = await readFile(samplePdf);
    const source = await readFile(sampleModule, 'utf8');
    const embedded = source.match(/DEMO_SINOSURE_PDF_BASE64 =\s*\n\s*'([^']+)'/);
    expect(embedded).toBeTruthy();
    const bytes = Buffer.from(embedded![1], 'base64');
    expect(bytes.equals(disk)).toBe(true);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(() => assertSinosureUpload({ originalname: '中信保演示示例保单.pdf', size: bytes.length })).not.toThrow();
    expect(() => assertSinosureUpload({ originalname: '中信保演示示例保单.pdf', size: 0 })).toThrow(/上传文件为空/);

    const root = await mkdtemp(path.join(tmpdir(), 'sinosure-demo-'));
    try {
      const meta = await writeSinosureFile({
        caseId: 'case_demo',
        id: 'sample',
        originalName: '中信保演示示例保单.pdf',
        buffer: bytes,
        root,
      });
      expect(meta.storageKey).toBe('sinosure/case_demo/sample.pdf');
      expect(meta.size).toBe(bytes.length);
      const stored = await readFile(absolutePathForKey(meta.storageKey, root));
      expect(stored.equals(bytes)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
