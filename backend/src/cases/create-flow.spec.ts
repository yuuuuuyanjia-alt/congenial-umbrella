import { UserRole } from '../common/constants';
import {
  canShowCreateContract,
  contractCreateLanding,
  demoCreateCaseInput,
  demoPartiesFromBuyer,
  DEMO_CREATE_DEFAULTS,
  newCaseAppearsOnList,
} from './create-flow';

describe('新建销售/采购合同（演示最短路径）', () => {
  it('POST /cases 从 N1 起：新案既不进销售列表也不进采购列表', () => {
    const created = { currentNode: 'N1', contract: null, procurementPlan: null };
    expect(newCaseAppearsOnList('sales', created)).toBe(false);
    expect(newCaseAppearsOnList('procurement', created)).toBe(false);
  });

  it('销售列表：保存销售合同后即可出现，即使 currentNode 仍为 N1', () => {
    expect(newCaseAppearsOnList('sales', { currentNode: 'N1', contract: { id: 'c1' } })).toBe(true);
  });

  it('采购列表：登记采购计划后即可出现；不因本案已签而自动关联销售合同', () => {
    expect(newCaseAppearsOnList('procurement', { currentNode: 'N1', procurementPlan: { poNo: 'PO-1' } })).toBe(true);
    expect(contractCreateLanding('procurement').requiresSalesLink).toBe(true);
  });

  it('销售落地打开 N3 表单，过闸最早可写节点仍是 N1 KYC', () => {
    const land = contractCreateLanding('sales');
    expect(land.formNode).toBe('N3');
    expect(land.formPath).toBe('/pages/node/contract');
    expect(land.earliestWritable).toBe('N1');
    expect(land.mustPassBeforeAdvance).toEqual(['N1', 'N2']);
  });

  it('采购落地打开 N5 表单，保存须另选已签销售合同', () => {
    const land = contractCreateLanding('procurement');
    expect(land.formNode).toBe('N5');
    expect(land.formPath).toBe('/pages/node/procurement');
    expect(land.earliestWritable).toBe('N1');
    expect(land.requiresSalesLink).toBe(true);
  });

  it('演示默认含标题、品名、目的地、金额；销售预填买方', () => {
    const sales = demoCreateCaseInput('sales');
    expect(sales.title).toBe(DEMO_CREATE_DEFAULTS.salesTitle);
    expect(sales.goodsDesc).toBe(DEMO_CREATE_DEFAULTS.goodsDesc);
    expect(sales.destination).toBe(DEMO_CREATE_DEFAULTS.destination);
    expect(sales.amountFen).toBe(DEMO_CREATE_DEFAULTS.amountFen);
    expect(sales.buyerName).toBe(sales.title);
    expect(sales.buyerCountry).toBe('DE');

    const custom = demoCreateCaseInput('sales', '  Helios Demo  ', 1_800_000);
    expect(custom.title).toBe('Helios Demo');
    expect(custom.amountFen).toBe(1_800_000);
    expect(custom.buyerName).toBe('Helios Demo');

    const po = demoCreateCaseInput('procurement', '', 0);
    expect(po.title).toBe(DEMO_CREATE_DEFAULTS.procurementTitle);
    expect(po.buyerName).toBeUndefined();
  });

  it('买方预填三当事方同名，付款人/收货人标记为与买方相同', () => {
    expect(demoPartiesFromBuyer('  ', 'DE')).toEqual([]);
    const rows = demoPartiesFromBuyer('Nordlicht Demo GmbH', 'DE');
    expect(rows.map((r) => r.role)).toEqual(['BUYER', 'PAYER', 'CONSIGNEE']);
    expect(rows.every((r) => r.name === 'Nordlicht Demo GmbH' && r.country === 'DE')).toBe(true);
    expect(rows.find((r) => r.role === 'BUYER')?.isSameAsBuyer).toBe(false);
    expect(rows.find((r) => r.role === 'PAYER')?.isSameAsBuyer).toBe(true);
  });

  it('仅 SALES / RISK 可见新建按钮，MANAGER 不可见', () => {
    expect(canShowCreateContract(UserRole.SALES)).toBe(true);
    expect(canShowCreateContract(UserRole.RISK)).toBe(true);
    expect(canShowCreateContract(UserRole.MANAGER)).toBe(false);
    expect(canShowCreateContract(undefined)).toBe(false);
  });
});
