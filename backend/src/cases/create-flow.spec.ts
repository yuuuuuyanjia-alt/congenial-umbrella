import { UserRole } from '../common/constants';
import {
  canShowCreateContract,
  contractCreateLanding,
  demoCreateCaseInput,
  demoPartiesFromBuyer,
  DEMO_CREATE_DEFAULTS,
  isSignedSalesPick,
  newCaseAppearsOnList,
  procurementOpenTarget,
} from './create-flow';

describe('新建销售/采购合同（N1 起 / 采购点选已签销售合同）', () => {
  it('POST /cases 从 N1 起：新案不进销售列表', () => {
    const created = { currentNode: 'N1', contract: null, procurementPlan: null };
    expect(newCaseAppearsOnList('sales', created)).toBe(false);
  });

  it('销售落地打开询盘 KYC，不跳到空白 N3', () => {
    const land = contractCreateLanding('sales');
    expect(land.createsNewCase).toBe(true);
    expect(land.formNode).toBe('N1');
    expect(land.formPath).toBe('/pages/node/kyc');
    expect(land.earliestWritable).toBe('N1');
    expect(land.mustPassBeforeAdvance).toEqual(['N1', 'N2']);
  });

  it('采购不新建案件，须点选已签销售合同后打开该案 N5', () => {
    const land = contractCreateLanding('procurement');
    expect(land.createsNewCase).toBe(false);
    expect(land.requiresSignedSalesPick).toBe(true);
    expect(land.formPath).toBe('/pages/node/procurement');
    expect(isSignedSalesPick({ signed: false })).toBe(false);
    expect(isSignedSalesPick({ signed: true })).toBe(true);
    expect(procurementOpenTarget({ id: 'c1', poNo: null }).isEdit).toBe(false);
    expect(procurementOpenTarget({ id: 'c1', poNo: 'PO-1' }).isEdit).toBe(true);
  });

  it('演示默认含标题、品名、目的地、金额，并预填买方', () => {
    const sales = demoCreateCaseInput();
    expect(sales.title).toBe(DEMO_CREATE_DEFAULTS.salesTitle);
    expect(sales.goodsDesc).toBe(DEMO_CREATE_DEFAULTS.goodsDesc);
    expect(sales.goodsDesc).not.toBe('机械');
    expect(sales.destination).toBe(DEMO_CREATE_DEFAULTS.destination);
    expect(sales.amountFen).toBe(DEMO_CREATE_DEFAULTS.amountFen);
    expect(sales.currency).toBe('USD');
    expect(sales.buyerName).toBe(sales.title);
    expect(sales.buyerCountry).toBe('DE');

    const custom = demoCreateCaseInput('  Helios Demo  ', 1_800_000);
    expect(custom.title).toBe('Helios Demo');
    expect(custom.amountFen).toBe(1_800_000);
    expect(custom.buyerName).toBe('Helios Demo');
  });

  it('买方预填买方与收货人同名，不预填付款人', () => {
    expect(demoPartiesFromBuyer('  ', 'DE')).toEqual([]);
    const rows = demoPartiesFromBuyer('Nordlicht Demo GmbH', 'DE');
    expect(rows.map((r) => r.role)).toEqual(['BUYER', 'CONSIGNEE']);
    expect(rows.every((r) => r.name === 'Nordlicht Demo GmbH' && r.country === 'DE')).toBe(true);
    expect(rows.find((r) => r.role === 'BUYER')?.isSameAsBuyer).toBe(false);
    expect(rows.find((r) => r.role === 'CONSIGNEE')?.isSameAsBuyer).toBe(true);
  });

  it('仅 SALES / RISK 可见新建按钮，MANAGER 不可见', () => {
    expect(canShowCreateContract(UserRole.SALES)).toBe(true);
    expect(canShowCreateContract(UserRole.RISK)).toBe(true);
    expect(canShowCreateContract(UserRole.MANAGER)).toBe(false);
    expect(canShowCreateContract(undefined)).toBe(false);
  });
});
