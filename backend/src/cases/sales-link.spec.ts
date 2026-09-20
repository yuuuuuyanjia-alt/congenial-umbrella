import { NodeStatus } from '../common/constants';
import {
  explicitSalesCaseId,
  filterSalesOptions,
  hasReachedNode,
  isEligibleSalesCase,
  isProcurementContractListItem,
  isSalesContractListItem,
  isSalesContractSigned,
  parseContractListKind,
  presentSalesLink,
  procurementContractTitle,
  procurementExportCustomerOf,
  procurementProductOf,
  salesContractDeliveryOf,
  signedSalesOptions,
} from './sales-link';

const nord = {
  id: 'c-pass',
  caseNo: 'DEMO-PASS',
  title: 'Nordlicht 绿灯',
  status: 'COMPLETED',
  currentNode: 'N9',
  goodsDesc: '数控机床配件',
  destination: 'Hamburg',
  amountFen: 12800000,
  currency: 'USD',
  contract: {
    counterparty: 'Nordlicht GmbH',
    amountFen: 12800000,
    currency: 'USD',
    deliveryDate: '2026-11-30',
  },
  parties: [{ role: 'BUYER', name: 'Nordlicht GmbH' }],
  nodes: [{ code: 'N3', status: NodeStatus.PASSED }],
};
const soft = {
  id: 'c-soft',
  caseNo: 'DEMO-SOFT',
  title: 'Acme 软提示',
  status: 'IN_PROGRESS',
  currentNode: 'N3',
  goodsDesc: '手工具套装',
  destination: 'Los Angeles',
  amountFen: 3600000,
  currency: 'USD',
  contract: null,
  parties: [{ role: 'BUYER', name: 'Acme Industrial Co' }],
  nodes: [{ code: 'N3', status: NodeStatus.IN_PROGRESS }],
};
const limit = {
  id: 'c-limit',
  caseNo: 'DEMO-LIMIT',
  title: 'Pacific Gear 超额',
  status: 'IN_PROGRESS',
  currentNode: 'N3',
  goodsDesc: '工业泵',
  destination: 'Melbourne',
  amountFen: 8000000,
  currency: 'USD',
  contract: { counterparty: 'Pacific Gear Ltd', amountFen: 8000000, currency: 'USD' },
  parties: [{ role: 'BUYER', name: 'Pacific Gear Ltd' }],
  nodes: [{ code: 'N3', status: NodeStatus.IN_PROGRESS }],
};

describe('销售合同关联（先销售后采购）', () => {
  it('无销售合同不算已签', () => {
    expect(isSalesContractSigned({ currentNode: 'N3', n3Status: NodeStatus.PASSED, hasContract: false })).toBe(false);
    expect(isSalesContractSigned({ currentNode: 'N5', n3Status: NodeStatus.IN_PROGRESS, hasContract: false })).toBe(
      false,
    );
  });

  it('N3 已通过且有合同视为已签', () => {
    expect(isSalesContractSigned({ currentNode: 'N3', n3Status: NodeStatus.PASSED, hasContract: true })).toBe(true);
    expect(isSalesContractSigned({ currentNode: 'N5', n3Status: NodeStatus.PASSED, hasContract: true })).toBe(true);
  });

  it('仅到达 N3 进行中、合同已填但未过闸，不算已签', () => {
    expect(
      isSalesContractSigned({ currentNode: 'N3', n3Status: NodeStatus.IN_PROGRESS, hasContract: true }),
    ).toBe(false);
  });

  it('已推进到 N3 之后且有合同，即使 N3 状态缺失也视为已签', () => {
    expect(isSalesContractSigned({ currentNode: 'N5', n3Status: null, hasContract: true })).toBe(true);
    expect(isSalesContractSigned({ currentNode: 'N4', n3Status: NodeStatus.IN_PROGRESS, hasContract: true })).toBe(true);
  });

  it('询盘/报价阶段不可作为采购关联对象', () => {
    expect(isSalesContractSigned({ currentNode: 'N1', n3Status: NodeStatus.NOT_STARTED, hasContract: true })).toBe(
      false,
    );
    expect(isSalesContractSigned({ currentNode: 'N2', n3Status: NodeStatus.NOT_STARTED, hasContract: true })).toBe(
      false,
    );
  });

  it('已签销售合同可出现在采购关联选项中，未签的不出现', () => {
    expect(isEligibleSalesCase(nord)).toBe(true);
    expect(isEligibleSalesCase(soft)).toBe(false);
    expect(isEligibleSalesCase(limit)).toBe(false);
    const opts = signedSalesOptions([nord, soft, limit], 'c-pass');
    expect(opts.map((o) => o.caseNo)).toEqual(['DEMO-PASS']);
    expect(opts[0].isCurrent).toBe(true);
    expect(opts[0].customer).toBe('Nordlicht GmbH');
    expect(opts[0].contractNo).toBe('DEMO-PASS');
    expect(opts[0].statusLabel).toBe('已完成');
  });

  it('可选列表含全部已签销售合同，本案不是唯一可选项、也不排到最前', () => {
    const fob = {
      ...nord,
      id: 'c-fob',
      caseNo: 'DEMO-FOB',
      title: 'Pacific Tools FOB',
      contract: { counterparty: 'Pacific Tools Pte Ltd', amountFen: 3600000, currency: 'USD' },
      parties: [{ role: 'BUYER', name: 'Pacific Tools Pte Ltd' }],
    };
    const gate = {
      ...nord,
      id: 'c-gate',
      caseNo: 'DEMO-GATE',
      title: 'Harbor View',
      contract: { counterparty: 'Harbor View Ltd', amountFen: 5400000, currency: 'USD' },
      parties: [{ role: 'BUYER', name: 'Harbor View Ltd' }],
    };
    const opts = signedSalesOptions([nord, fob, gate, soft], 'c-fob');
    expect(opts.map((o) => o.caseNo)).toEqual(['DEMO-FOB', 'DEMO-GATE', 'DEMO-PASS']);
    expect(opts.find((o) => o.caseNo === 'DEMO-FOB')?.isCurrent).toBe(true);
    expect(opts.find((o) => o.caseNo === 'DEMO-PASS')?.isCurrent).toBe(false);
    expect(opts.filter((o) => o.signed)).toHaveLength(3);
  });

  it('关联销售合同须用户选定或沿用已保存值，不得因本案已签而自动填入', () => {
    expect(explicitSalesCaseId(undefined, undefined)).toBe('');
    expect(explicitSalesCaseId('', 'existing-id')).toBe('');
    expect(explicitSalesCaseId(undefined, 'saved-sales')).toBe('saved-sales');
    expect(explicitSalesCaseId('picked-id', 'saved-sales')).toBe('picked-id');
    expect(explicitSalesCaseId('  other-signed  ', nord.id)).toBe('other-signed');
  });

  it('可按客户或合同号筛选可选销售合同', () => {
    const fob = {
      ...nord,
      id: 'c-fob',
      caseNo: 'DEMO-FOB',
      title: 'Pacific Tools FOB',
      goodsDesc: '手工具套装',
      contract: { counterparty: 'Pacific Tools Pte Ltd' },
      parties: [{ role: 'BUYER', name: 'Pacific Tools Pte Ltd' }],
    };
    const opts = signedSalesOptions([nord, fob], 'c-pass');
    expect(filterSalesOptions(opts, 'nordlicht').map((o) => o.caseNo)).toEqual(['DEMO-PASS']);
    expect(filterSalesOptions(opts, 'FOB').map((o) => o.caseNo)).toEqual(['DEMO-FOB']);
    expect(filterSalesOptions(opts, '').map((o) => o.caseNo)).toEqual(['DEMO-FOB', 'DEMO-PASS']);
  });

  it('展示字段含客户、合同号、金额与状态（中文）', () => {
    const view = presentSalesLink(nord);
    expect(view.customer).toBe('Nordlicht GmbH');
    expect(view.contractNo).toBe('DEMO-PASS');
    expect(view.amountFen).toBe(12800000);
    expect(view.currency).toBe('USD');
    expect(view.currentNodeLabel).toContain('收汇');
    expect(view.signed).toBe(true);
    expect(String(view.deliveryDate).slice(0, 10)).toBe('2026-11-30');
  });
});

describe('销售/采购合同列表分流（同一案件模型，按节点过滤）', () => {
  const blocked = {
    id: 'c-block',
    caseNo: 'DEMO-BLOCK',
    currentNode: 'N1',
    contract: null,
    procurementPlan: null,
  };
  const quoteOnly = {
    id: 'c-quote',
    caseNo: 'DEMO-QUOTE',
    currentNode: 'N2',
    contract: null,
    procurementPlan: null,
  };
  const unsignedN3 = {
    ...soft,
    procurementPlan: null,
  };
  const fillingN3 = {
    ...limit,
    procurementPlan: null,
  };
  const wipN5 = {
    id: 'c-wip',
    caseNo: 'DEMO-NORD-WIP',
    currentNode: 'N5',
    contract: { counterparty: 'Nordlicht GmbH' },
    procurementPlan: null,
    parties: [{ role: 'BUYER', name: 'Nordlicht GmbH' }],
    nodes: [{ code: 'N3', status: NodeStatus.PASSED }],
    title: 'Nordlicht 待采购',
    status: 'IN_PROGRESS',
    goodsDesc: '配件',
    destination: 'Hamburg',
    amountFen: 1800000,
    currency: 'USD',
  };
  const withPo = {
    ...nord,
    procurementPlan: { poNo: 'PO-BH-2026-011' },
  };

  it('kind 仅接受 sales / procurement', () => {
    expect(parseContractListKind('sales')).toBe('sales');
    expect(parseContractListKind('procurement')).toBe('procurement');
    expect(parseContractListKind('all')).toBeUndefined();
    expect(parseContractListKind('')).toBeUndefined();
  });

  it('N3 为销售列表起点，询盘硬拦截与报价中案件不进入销售合同列表', () => {
    expect(hasReachedNode('N2', 'N3')).toBe(false);
    expect(hasReachedNode('N3', 'N3')).toBe(true);
    expect(hasReachedNode('N5', 'N3')).toBe(true);
    expect(isSalesContractListItem(blocked)).toBe(false);
    expect(isSalesContractListItem(quoteOnly)).toBe(false);
    expect(isSalesContractListItem(unsignedN3)).toBe(true);
    expect(isSalesContractListItem(fillingN3)).toBe(true);
    expect(isSalesContractListItem(withPo)).toBe(true);
  });

  it('采购列表为 N5 及已登记 PO，不含未到采购节点的销售合同', () => {
    expect(hasReachedNode('N3', 'N5')).toBe(false);
    expect(hasReachedNode('N5', 'N5')).toBe(true);
    expect(isProcurementContractListItem(blocked)).toBe(false);
    expect(isProcurementContractListItem(unsignedN3)).toBe(false);
    expect(isProcurementContractListItem(fillingN3)).toBe(false);
    expect(isProcurementContractListItem(wipN5)).toBe(true);
    expect(isProcurementContractListItem(withPo)).toBe(true);
  });

  it('销售列表条目是出口案件而非采购 PO 号', () => {
    const sales = [blocked, unsignedN3, fillingN3, wipN5, withPo].filter(isSalesContractListItem);
    expect(sales.map((c) => c.caseNo)).toEqual(['DEMO-SOFT', 'DEMO-LIMIT', 'DEMO-NORD-WIP', 'DEMO-PASS']);
    expect(sales.every((c) => !('poNo' in c && c.poNo && !c.caseNo))).toBe(true);
    const proc = [blocked, unsignedN3, fillingN3, wipN5, withPo].filter(isProcurementContractListItem);
    expect(proc.map((c) => c.caseNo)).toEqual(['DEMO-NORD-WIP', 'DEMO-PASS']);
  });
});

describe('采购合同主标题（供应商采购产品出口客户）', () => {
  it('完整字段拼成「供应商采购产品出口客户」', () => {
    expect(
      procurementContractTitle({
        supplierName: '苏州精工机械有限公司',
        goodsDesc: '数控机床配件',
        salesLink: { customer: 'Nordlicht GmbH', goodsDesc: '数控机床配件' },
      }),
    ).toBe('苏州精工机械有限公司采购数控机床配件出口Nordlicht GmbH');
  });

  it('品名优先取关联销售合同货物，其次本案 goodsDesc、合同货物、报关品名', () => {
    expect(
      procurementProductOf({
        goodsDesc: '本案货物',
        contract: { goodsDesc: '合同货物' },
        customs: { productName: '报关品名' },
        salesLink: { customer: 'Nordlicht GmbH', goodsDesc: '出口品名' },
      }),
    ).toBe('出口品名');
    expect(
      procurementProductOf({
        goodsDesc: '本案货物',
        contract: { goodsDesc: '合同货物' },
        customs: { productName: '报关品名' },
      }),
    ).toBe('本案货物');
    expect(
      procurementProductOf({
        goodsDesc: '  ',
        contract: { goodsDesc: '合同货物' },
        customs: { productName: '报关品名' },
      }),
    ).toBe('合同货物');
    expect(procurementProductOf({ customs: { productName: '报关品名' } })).toBe('报关品名');
    expect(procurementProductOf({})).toBe('');
  });

  it('出口客户优先取关联销售合同买方，否则回退本案买方', () => {
    expect(
      procurementExportCustomerOf({
        customer: '本案买方',
        contract: { counterparty: '合同相对方' },
        parties: [{ role: 'BUYER', name: '当事方买方' }],
        salesLink: { customer: 'Harbor View Ltd', goodsDesc: '工业泵' },
      }),
    ).toBe('Harbor View Ltd');
    expect(
      procurementExportCustomerOf({
        parties: [{ role: 'BUYER', name: 'Nordlicht GmbH' }],
      }),
    ).toBe('Nordlicht GmbH');
  });

  it('缺字段用占位，不出现空白主标题', () => {
    expect(procurementContractTitle({})).toBe('供应商待登记采购货物出口客户待关联');
    expect(
      procurementContractTitle({
        parties: [{ role: 'SUPPLIER', name: '宁波五金制品有限公司' }],
        goodsDesc: '手工具套装',
      }),
    ).toBe('宁波五金制品有限公司采购手工具套装出口客户待关联');
  });
});

describe('关联销售合同交货期（延期对照）', () => {
  it('优先取关联销售合同当前交货期', () => {
    expect(
      salesContractDeliveryOf({
        salesLinkDelivery: '2026-11-30',
        planContractDelivery: '2026-10-01',
        caseContractDelivery: '2026-09-01',
      }),
    ).toBe('2026-11-30');
  });

  it('无销售合同交货期时回退采购计划快照', () => {
    expect(
      salesContractDeliveryOf({
        salesLinkDelivery: null,
        planContractDelivery: new Date('2026-12-15T00:00:00.000Z'),
        caseContractDelivery: '2026-09-01',
      }),
    ).toBe('2026-12-15');
  });
});
