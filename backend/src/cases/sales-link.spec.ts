import { NodeStatus } from '../common/constants';
import {
  isEligibleSalesCase,
  isSalesContractSigned,
  presentSalesLink,
  signedSalesOptions,
} from './sales-link';

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

  it('展示字段含客户、合同号、金额与状态（中文）', () => {
    const view = presentSalesLink(nord);
    expect(view.customer).toBe('Nordlicht GmbH');
    expect(view.contractNo).toBe('DEMO-PASS');
    expect(view.amountFen).toBe(12800000);
    expect(view.currency).toBe('USD');
    expect(view.currentNodeLabel).toContain('收汇');
    expect(view.signed).toBe(true);
  });
});
