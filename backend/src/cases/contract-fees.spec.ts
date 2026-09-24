import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeContractFees,
  presentContractFees,
  resolveFeeCurrency,
} from './contract-fees';

describe('销售合同费用', () => {
  it('四项与自定义行都可空，空保存得到全空', () => {
    expect(normalizeContractFees({})).toEqual({
      oceanFreightFen: null,
      inlandFreightFen: null,
      portChargesFen: null,
      insuranceFen: null,
      custom: [],
      customJson: '[]',
    });
    expect(normalizeContractFees(null).customJson).toBe('[]');
  });

  it('可只填一部分，0 与留空不同', () => {
    const row = normalizeContractFees({
      oceanFreightFen: 125000,
      portChargesFen: 0,
      custom: [{ name: '文件费', amountFen: null }],
    });
    expect(row.oceanFreightFen).toBe(125000);
    expect(row.inlandFreightFen).toBeNull();
    expect(row.portChargesFen).toBe(0);
    expect(row.insuranceFen).toBeNull();
    expect(row.custom).toEqual([{ name: '文件费', amountFen: null }]);
  });

  it('自定义行可增删语义：空行丢弃，只留名称或只留金额的行保留', () => {
    const row = normalizeContractFees({
      custom: [
        { name: '  仓储费  ', amountFen: 8000 },
        { name: '', amountFen: null },
        { name: '   ', amountFen: '' },
        { name: '', amountFen: 500 },
      ],
    });
    expect(row.custom).toEqual([
      { name: '仓储费', amountFen: 8000 },
      { name: '', amountFen: 500 },
    ]);
  });

  it('拒绝负数、非整数和过长名称', () => {
    expect(() => normalizeContractFees({ insuranceFen: -1 })).toThrow(/不能为负/);
    expect(() => normalizeContractFees({ oceanFreightFen: 1.5 })).toThrow(/整数分/);
    expect(() => normalizeContractFees({ custom: [{ name: '费'.repeat(41), amountFen: 1 }] })).toThrow(/40/);
  });

  it('币种跟随销售合同，否则标明 USD 或 CNY', () => {
    expect(resolveFeeCurrency('CNY', 'USD')).toMatchObject({ code: 'CNY', source: 'contract' });
    expect(resolveFeeCurrency('cny', null).label).toContain('跟随销售合同');
    expect(resolveFeeCurrency(null, 'CNY')).toMatchObject({ code: 'CNY', source: 'case' });
    expect(resolveFeeCurrency('', 'USD').label).toContain('美元');
    expect(resolveFeeCurrency(null, null)).toMatchObject({ code: 'USD', source: 'default' });
    expect(resolveFeeCurrency('EUR', 'JPY').label).toContain('按美元');
  });

  it('再次打开还原已存金额；报价所含项目只作提示，不写入金额', () => {
    const view = presentContractFees({
      id: 'c1',
      caseNo: 'SC-1',
      title: '演示',
      currency: 'USD',
      contract: { currency: 'CNY', counterparty: '北欧客户' },
      quotes: [
        { version: 1, includedItems: '["INLAND_FREIGHT"]' },
        { version: 3, includedItems: '["OCEAN_FREIGHT","PORT_CHARGES"]' },
      ],
      contractFee: {
        oceanFreightFen: null,
        inlandFreightFen: 200,
        portChargesFen: null,
        insuranceFen: 300,
        customJson: JSON.stringify([{ name: '文件费', amountFen: 100 }]),
      },
    });
    expect(view.customer).toBe('北欧客户');
    expect(view.currency).toBe('CNY');
    expect(view.currencySource).toBe('contract');
    expect(view.inlandFreightFen).toBe(200);
    expect(view.insuranceFen).toBe(300);
    expect(view.oceanFreightFen).toBeNull();
    expect(view.custom).toEqual([{ name: '文件费', amountFen: 100 }]);
    expect(view.quoteIncludedLabels).toBe('海运费、港杂');
  });

  it('没有费用记录时金额全空', () => {
    const view = presentContractFees({
      id: 'c1',
      caseNo: 'SC-1',
      title: '演示销售',
      currency: 'USD',
      contract: null,
      quotes: [],
      contractFee: null,
    });
    expect(view.oceanFreightFen).toBeNull();
    expect(view.custom).toEqual([]);
    expect(view.quoteIncludedLabels).toBeNull();
    expect(view.currencySource).toBe('case');
    expect(view.customer).toBe('演示销售');
  });

  it('节点闸门与推进不读取合同费用', () => {
    const gate = readFileSync(join(__dirname, '../gates/gate.engine.ts'), 'utf8');
    const advance = readFileSync(join(__dirname, 'advance-guard.ts'), 'utf8');
    for (const src of [gate, advance]) {
      expect(src.includes('ContractFee')).toBe(false);
      expect(src.includes('oceanFreightFen')).toBe(false);
      expect(src.includes('contractFee')).toBe(false);
    }
  });
});
