import { CIF_FAMILY_INCOTERMS } from '../common/constants';
import { isBuyerArrangedFreight, parseIncotermsCode } from '../gates/gate.engine';
import {
  groupSalesByShipmentBucket,
  isCifFamilyIncoterms,
  isSalesPickedUp,
  isSalesRemittanceComplete,
  isSalesShipped,
  presentSalesContract,
  presentSalesShipmentStatus,
  resolveRemittedFen,
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
    expect(fob?.fobDomesticVisible).toBe(true);
    expect(fob?.remittedFen).toBe(0);
    expect(fob?.unpaidFen).toBe(3_600_000);
    expect(cif?.fobDomesticVisible).toBe(false);
  });
});

describe('销售合同出运/履约分组', () => {
  const cifShipped = {
    shipmentDate: '2026-08-15',
    customerPickedUp: true,
    hasRemittance: true,
    remittedFen: 12_800_000,
    amountFen: 12_800_000,
    currentNode: 'N9',
    nodes: [{ code: 'N6', status: 'PASSED' }],
  };

  it('CIF 装运日期已填视为已出运', () => {
    expect(isSalesShipped({ shipmentDate: '2026-08-15', currentNode: 'N3' })).toBe(true);
    expect(isSalesShipped({ contract: { shipmentDate: new Date('2026-08-15') }, currentNode: 'N3' })).toBe(true);
    expect(isSalesShipped({ shipmentDate: '', currentNode: 'N3' })).toBe(false);
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

  it('已回款须是否收汇为是且未收汇金额为 0', () => {
    expect(
      isSalesRemittanceComplete({ hasRemittance: true, remittedFen: 12_800_000, amountFen: 12_800_000 }),
    ).toBe(true);
    expect(
      isSalesRemittanceComplete({ hasRemittance: true, remittedFen: 5_000_000, amountFen: 12_800_000 }),
    ).toBe(false);
    expect(
      isSalesRemittanceComplete({ hasRemittance: false, remittedFen: 12_800_000, amountFen: 12_800_000 }),
    ).toBe(false);
    expect(isSalesPickedUp({ customerPickedUp: true })).toBe(true);
    expect(isSalesPickedUp({ customerPickedUp: false })).toBe(false);
    expect(isSalesPickedUp({ customerPickedUp: null })).toBe(false);
  });

  it('已完成 = 已出运且已提货且已回款；已出运列不含已完成', () => {
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
        hasRemittance: true,
        remittedFen: 4_000_000,
      }),
    ).toBe('shipped');

    expect(
      salesShipmentBucketOf({
        domesticPortArrivalAt: '2026-12-08 10:00',
        currentNode: 'N3',
        customerPickedUp: false,
        hasRemittance: false,
        amountFen: 3_600_000,
      }),
    ).toBe('shipped');

    expect(
      salesShipmentBucketOf({
        shipmentDate: null,
        currentNode: 'N5',
        nodes: [{ code: 'N6', status: 'NOT_STARTED' }],
        customerPickedUp: false,
        hasRemittance: false,
        amountFen: 1_800_000,
      }),
    ).toBe('unshipped');
  });

  it('分组顺序为未出运 / 已出运 / 已完成，标签为中文', () => {
    const groups = groupSalesByShipmentBucket([
      { caseNo: 'DONE', ...cifShipped },
      { caseNo: 'SHIP', shipmentDate: '2026-11-10', customerPickedUp: false, hasRemittance: false, amountFen: 100 },
      { caseNo: 'WIP', currentNode: 'N3' },
    ] as Array<{ caseNo: string } & Parameters<typeof salesShipmentBucketOf>[0]>);
    expect(groups.map((g) => g.label)).toEqual(['未出运', '已出运', '已完成']);
    expect(groups[0].items.map((r) => r.caseNo)).toEqual(['WIP']);
    expect(groups[1].items.map((r) => r.caseNo)).toEqual(['SHIP']);
    expect(groups[2].items.map((r) => r.caseNo)).toEqual(['DONE']);
  });
});
