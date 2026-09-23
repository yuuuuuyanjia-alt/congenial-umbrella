import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { tradeDocUpload } from '../common/constants';
import { assertSafeStorageKey } from './sinosure-file';
import { writeTradeDocFile } from './trade-doc-file';

describe('装运/单证上传', () => {
  it('N6 只有商业发票和箱单，N7 七个槽位且商业发票与发票分开', () => {
    expect(tradeDocUpload('N6', 'invoice')?.slot).toBe('invoice');
    expect(tradeDocUpload('N6', 'invoice')?.kind).toBe('N6_INVOICE');
    expect(tradeDocUpload('N6', 'invoice')?.label).toBe('商业发票');
    expect(tradeDocUpload('N6', 'packing')?.kind).toBe('N6_PACKING');
    expect(tradeDocUpload('N6', 'sales-contract')).toBeNull();
    expect(tradeDocUpload('N7', 'commercial-invoice')?.missing).toBe('N7_COMMERCIAL_INVOICE');
    expect(tradeDocUpload('N7', 'invoice')?.missing).toBe('N7_INVOICE');
    expect(tradeDocUpload('N7', 'invoice')?.label).toBe('发票');
    expect(tradeDocUpload('N7', 'invoice')?.kind).not.toBe(tradeDocUpload('N7', 'commercial-invoice')?.kind);
    const n7 = [
      'sales-contract',
      'commercial-invoice',
      'packing',
      'purchase-contract',
      'invoice',
      'customs',
      'origin-cert',
    ];
    expect(n7.map((slot) => tradeDocUpload('N7', slot)?.label)).toEqual([
      '销售合同',
      '商业发票',
      '箱单',
      '采购合同',
      '发票',
      '报关单',
      '原产地证',
    ]);
    expect(tradeDocUpload('N7', 'origin-cert')?.missing).toBe('N7_ORIGIN_CERT');
  });

  it('单证文件写入 trade-docs 并可按存储键读回', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'trade-doc-'));
    try {
      const body = Buffer.from('%PDF-1.4 demo invoice');
      const meta = await writeTradeDocFile({
        caseId: 'case_1',
        slot: 'invoice',
        id: 'file1',
        originalName: '演示发票.pdf',
        buffer: body,
        root,
      });
      expect(meta.storageKey.startsWith('trade-docs/case_1/invoice/')).toBe(true);
      expect(assertSafeStorageKey(meta.storageKey)).toBe(meta.storageKey);
      const saved = await readFile(path.join(root, meta.storageKey));
      expect(saved.equals(body)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
