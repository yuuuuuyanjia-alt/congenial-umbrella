import { CIF_FAMILY_INCOTERMS } from '../common/constants';
import { isBuyerArrangedFreight, parseIncotermsCode } from '../gates/gate.engine';
import {
  isCifFamilyIncoterms,
  presentSalesContract,
  resolveRemittedFen,
  unpaidRemittanceFen,
} from './sales-contract';

describe('销售合同 CIF 装运节点与收汇', () => {
  it('CIF / CIP 及带港口的写法视为 CIF 条款族', () => {
    expect(isCifFamilyIncoterms('CIF')).toBe(true);
    expect(isCifFamilyIncoterms('cif hamburg')).toBe(true);
    expect(isCifFamilyIncoterms('Incoterms 2020 CIF')).toBe(true);
    expect(isCifFamilyIncoterms('CIP')).toBe(true);
    expect(CIF_FAMILY_INCOTERMS).toEqual(['CIF', 'CIP']);
  });

  it('FOB / CFR / EXW 不展示 CIF 装运区块，且不破坏 FOB 无提单判定', () => {
    expect(isCifFamilyIncoterms('FOB')).toBe(false);
    expect(isCifFamilyIncoterms('FOB Shanghai')).toBe(false);
    expect(isCifFamilyIncoterms('CFR')).toBe(false);
    expect(isCifFamilyIncoterms('EXW')).toBe(false);
    expect(isCifFamilyIncoterms('')).toBe(false);
    expect(isBuyerArrangedFreight('FOB Shanghai')).toBe(true);
    expect(isBuyerArrangedFreight('CIF Hamburg')).toBe(false);
    expect(parseIncotermsCode('FOB Shanghai')).toBe('FOB');
  });

  it('未收汇 = 合同总额 − 收汇金额（分）', () => {
    expect(unpaidRemittanceFen(12_800_000, 5_000_000)).toBe(7_800_000);
    expect(unpaidRemittanceFen(12_800_000, 12_800_000)).toBe(0);
    expect(unpaidRemittanceFen(12_800_000, 0)).toBe(12_800_000);
    expect(unpaidRemittanceFen(1_000_000, 2_000_000)).toBe(0);
  });

  it('是否收汇为否时收汇金额记 0', () => {
    expect(resolveRemittedFen({ hasRemittance: false, remittedFen: 500_000 })).toBe(0);
    expect(resolveRemittedFen({ hasRemittance: true, remittedFen: 500_000 })).toBe(500_000);
    expect(resolveRemittedFen({ hasRemittance: true, remittedFen: -1 })).toBe(0);
  });

  it('present 带出未收汇与 CIF 可见性，不改原合同金额', () => {
    const cif = presentSalesContract({
      incoterms: 'CIF Hamburg',
      amountFen: 10_000_000,
      hasRemittance: true,
      remittedFen: 4_000_000,
    });
    expect(cif?.cifShippingVisible).toBe(true);
    expect(cif?.unpaidFen).toBe(6_000_000);
    expect(cif?.amountFen).toBe(10_000_000);

    const fob = presentSalesContract({
      incoterms: 'FOB',
      amountFen: 3_600_000,
      hasRemittance: false,
      remittedFen: 99,
    });
    expect(fob?.cifShippingVisible).toBe(false);
    expect(fob?.remittedFen).toBe(0);
    expect(fob?.unpaidFen).toBe(3_600_000);
  });
});
