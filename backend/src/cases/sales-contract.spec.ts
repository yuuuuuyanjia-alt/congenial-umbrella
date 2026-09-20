import { CIF_FAMILY_INCOTERMS } from '../common/constants';
import { isBuyerArrangedFreight, parseIncotermsCode } from '../gates/gate.engine';
import {
  composeTtPaymentTerms,
  groupSalesByShipmentBucket,
  isCifFamilyIncoterms,
  isSalesPickedUp,
  isSalesRemittanceComplete,
  isSalesShipped,
  presentSalesContract,
  presentSalesShipmentStatus,
  resolveRemittedFen,
  resolveTradeTerm,
  resolveTtTiming,
  salesShipmentBucketOf,
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

  it('是否收汇为否时收汇金额记 0（N3 旧字段，不再作为已回款口径）', () => {
    expect(resolveRemittedFen({ hasRemittance: false, remittedFen: 500_000 })).toBe(0);
    expect(resolveRemittedFen({ hasRemittance: true, remittedFen: 500_000 })).toBe(500_000);
    expect(resolveRemittedFen({ hasRemittance: true, remittedFen: -1 })).toBe(0);
  });

  it('present 的收汇金额只 overlay N9 settlement，N3 是否收汇不能假装已回款', () => {
    const cif = presentSalesContract(
      {
        incoterms: 'CIF Hamburg',
        amountFen: 10_000_000,
        hasRemittance: true,
        remittedFen: 10_000_000,
      },
      { hasRemittanceMemo: true, amountFen: 4_000_000 },
    );
    expect(cif?.cifShippingVisible).toBe(true);
    expect(cif?.hasRemittance).toBe(true);
    expect(cif?.remittedFen).toBe(4_000_000);
    expect(cif?.unpaidFen).toBe(6_000_000);
    expect(cif?.amountFen).toBe(10_000_000);

    const n3Only = presentSalesContract({
      incoterms: 'FOB',
      amountFen: 3_600_000,
      hasRemittance: true,
      remittedFen: 3_600_000,
    });
    expect(n3Only?.cifShippingVisible).toBe(false);
    expect(n3Only?.fobDomesticVisible).toBe(true);
    expect(n3Only?.hasRemittance).toBe(false);
    expect(n3Only?.remittedFen).toBe(0);
    expect(n3Only?.unpaidFen).toBe(3_600_000);
    expect(cif?.fobDomesticVisible).toBe(false);
    expect(cif?.tradeTerm).toBe('CIF');
    expect(cif?.ttVisible).toBe(false);
    expect(n3Only?.tradeTerm).toBe('FOB');
  });

  it('FOB / CIF / T/T 为并列三选一，T/T 再分前/后', () => {
    expect(resolveTradeTerm('CIF Hamburg')).toBe('CIF');
    expect(resolveTradeTerm('CIP')).toBe('CIF');
    expect(resolveTradeTerm('FOB Shanghai')).toBe('FOB');
    expect(resolveTradeTerm('T/T')).toBe('T/T');
    expect(resolveTradeTerm('t/t 预付')).toBe('T/T');
    const tt = presentSalesContract({ incoterms: 'T/T', amountFen: 800_000, ttTiming: 'ADVANCE', ttPercentBps: 3000 });
    expect(tt?.ttVisible).toBe(true);
    expect(tt?.cifShippingVisible).toBe(false);
    expect(tt?.fobDomesticVisible).toBe(false);
    expect(tt?.ttTiming).toBe('ADVANCE');
    expect(tt?.ttAdvanceFen).toBe(240_000);
    expect(composeTtPaymentTerms('AFTER', 30)).toBe('后 T/T 30 days');
    expect(composeTtPaymentTerms('ADVANCE')).toBe('前 T/T');
    expect(resolveTtTiming({ paymentTerms: '前 T/T' })).toBe('ADVANCE');
    expect(resolveTtTiming({ paymentTerms: '后 T/T 30 days' })).toBe('AFTER');
    const fobKeep = presentSalesContract({ incoterms: 'FOB', paymentTerms: 'OA 15 days' });
    expect(fobKeep?.tradeTerm).toBe('FOB');
    expect(fobKeep?.ttVisible).toBe(false);
    expect(fobKeep?.fobDomesticVisible).toBe(true);
  });
});

describe('销售合同出运/履约分组', () => {
  const cifShipped = {
    shipmentDate: '2026-08-15',
    customerPickedUp: true,
    amountFen: 12_800_000,
    currentNode: 'N9',
    nodes: [{ code: 'N6', status: 'PASSED' }],
    settlement: {
      hasRemittanceMemo: true,
      amountFen: 12_800_000,
      receivedAt: '2026-09-10',
    },
  };

  it('CIF 装运日期已填视为已出运', () => {
    expect(isSalesShipped({ shipmentDate: '2026-08-15', currentNode: 'N3' })).toBe(true);
    expect(isSalesShipped({ contract: { shipmentDate: new Date('2026-08-15') }, currentNode: 'N3' })).toBe(true);
    expect(isSalesShipped({ shipmentDate: '', currentNode: 'N3' })).toBe(false);
    expect(isSalesShipped({ shipmentDate: '2026-12-01', currentNode: 'N3' })).toBe(true);
  });

  it('FOB 无装运日期时以国内段到达口岸、N6 已通过或提单/无提单路径为准', () => {
    expect(isSalesShipped({ currentNode: 'N6', nodes: [{ code: 'N6', status: 'IN_PROGRESS' }] })).toBe(false);
    expect(isSalesShipped({ domesticPortArrivalAt: '2026-12-08 10:00', currentNode: 'N3' })).toBe(true);
    expect(isSalesShipped({ contract: { domesticPortArrivalAt: new Date('2026-12-08T10:00:00.000Z') }, currentNode: 'N3' })).toBe(
      true,
    );
    expect(isSalesShipped({ currentNode: 'N6', nodes: [{ code: 'N6', status: 'PASSED' }] })).toBe(true);
    expect(isSalesShipped({ currentNode: 'N7', nodes: [{ code: 'N6', status: 'IN_PROGRESS' }] })).toBe(true);
    expect(isSalesShipped({ currentNode: 'N6', shipment: { blNo: 'COSU8899001' } })).toBe(true);
    expect(
      isSalesShipped({
        currentNode: 'N6',
        shipment: { blControl: 'NO_BL', noBlRef: 'SA-FOB-2026-004', noBlReason: '买方订舱' },
      }),
    ).toBe(true);
    expect(isSalesShipped({ currentNode: 'N6', shipment: { blControl: 'NO_BL' } })).toBe(false);
  });

  it('已回款只认 N9 水单/到账且未收汇为 0；勾选 N3 是否收汇不能假装完成', () => {
    expect(
      isSalesRemittanceComplete({
        amountFen: 12_800_000,
        settlement: { hasRemittanceMemo: true, amountFen: 12_800_000, receivedAt: '2026-09-10' },
      }),
    ).toBe(true);
    expect(
      isSalesRemittanceComplete({
        amountFen: 12_800_000,
        settlement: { hasRemittanceMemo: true, amountFen: 5_000_000, receivedAt: '2026-09-10' },
      }),
    ).toBe(false);
    expect(
      isSalesRemittanceComplete({
        amountFen: 12_800_000,
        hasRemittance: true,
        remittedFen: 12_800_000,
      } as Parameters<typeof isSalesRemittanceComplete>[0]),
    ).toBe(false);
    expect(
      isSalesRemittanceComplete({
        amountFen: 12_800_000,
        settlement: { receivedAt: '2026-09-10' },
      }),
    ).toBe(true);
    expect(isSalesPickedUp({ customerPickedUp: true })).toBe(true);
    expect(isSalesPickedUp({ customerPickedUp: false })).toBe(false);
    expect(isSalesPickedUp({ customerPickedUp: null })).toBe(false);
  });

  it('已完成 = 已出运且已提货且 N9 已回款；仅填 N3 收汇仍停在已出运', () => {
    expect(salesShipmentBucketOf(cifShipped)).toBe('completed');
    expect(presentSalesShipmentStatus(cifShipped).shipmentBucketLabel).toBe('已完成');

    expect(
      salesShipmentBucketOf({
        ...cifShipped,
        customerPickedUp: false,
      }),
    ).toBe('shipped');

    expect(
      salesShipmentBucketOf({
        ...cifShipped,
        settlement: { hasRemittanceMemo: true, amountFen: 4_000_000, receivedAt: '2026-09-10' },
      }),
    ).toBe('shipped');

    expect(
      salesShipmentBucketOf({
        shipmentDate: '2026-08-15',
        customerPickedUp: true,
        amountFen: 12_800_000,
        currentNode: 'N3',
        hasRemittance: true,
        remittedFen: 12_800_000,
      } as Parameters<typeof salesShipmentBucketOf>[0]),
    ).toBe('shipped');

    expect(
      salesShipmentBucketOf({
        domesticPortArrivalAt: '2026-12-08 10:00',
        currentNode: 'N3',
        customerPickedUp: false,
        amountFen: 3_600_000,
      }),
    ).toBe('shipped');

    expect(
      salesShipmentBucketOf({
        shipmentDate: '2026-12-01',
        currentNode: 'N3',
        customerPickedUp: false,
        amountFen: 800_000,
        settlement: { hasRemittanceMemo: true, amountFen: 240_000 },
      }),
    ).toBe('shipped');

    expect(
      salesShipmentBucketOf({
        shipmentDate: null,
        currentNode: 'N5',
        nodes: [{ code: 'N6', status: 'NOT_STARTED' }],
        customerPickedUp: false,
        amountFen: 1_800_000,
      }),
    ).toBe('unshipped');
  });

  it('仅填 N9 水单/到账即可与占用释放同步进入已完成', () => {
    expect(
      salesShipmentBucketOf({
        shipmentDate: '2026-08-15',
        customerPickedUp: true,
        amountFen: 12_800_000,
        hasRemittance: false,
        remittedFen: 0,
        settlement: { hasRemittanceMemo: true, receivedAt: '2026-09-10' },
      } as Parameters<typeof salesShipmentBucketOf>[0]),
    ).toBe('completed');
  });

  it('分组顺序为未出运 / 已出运 / 已完成，标签为中文', () => {
    const groups = groupSalesByShipmentBucket([
      { caseNo: 'DONE', ...cifShipped },
      { caseNo: 'SHIP', shipmentDate: '2026-11-10', customerPickedUp: false, amountFen: 100 },
      { caseNo: 'WIP', currentNode: 'N3' },
    ] as Array<{ caseNo: string } & Parameters<typeof salesShipmentBucketOf>[0]>);
    expect(groups.map((g) => g.label)).toEqual(['未出运', '已出运', '已完成']);
    expect(groups[0].items.map((r) => r.caseNo)).toEqual(['WIP']);
    expect(groups[1].items.map((r) => r.caseNo)).toEqual(['SHIP']);
    expect(groups[2].items.map((r) => r.caseNo)).toEqual(['DONE']);
  });
});
