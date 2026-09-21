import { CUSTOMER_PARTY_ROLES, PartyRole } from '../common/constants';
import { canWriteBusiness } from '../auth/roles';
import { isProcurementContractListItem, isSalesContractListItem } from './sales-link';

/** 演示新建合同：金额约 25,000 USD，避免一上来撞超高风险占用档。 */
export const DEMO_CREATE_DEFAULTS = {
  goodsDesc: '数控机床配件（演示）',
  destination: 'Hamburg, DE',
  amountFen: 2_500_000,
  currency: 'USD',
  buyerCountry: 'DE',
  salesTitle: '演示销售合同',
  procurementTitle: '演示采购合同',
} as const;

export type ContractCreateKind = 'sales' | 'procurement';

export type CreateCaseSeedInput = {
  title: string;
  goodsDesc: string;
  destination: string;
  amountFen: number;
  currency: string;
  buyerName?: string;
  buyerCountry?: string;
};

/**
 * POST /cases 始终落在 N1（DRAFT）。销售合同页（N3）/ 采购合同页（N5）可以打开并预填，
 * 但过闸不能跳过：销售确认推进须先过 N1 筛查与 N2 报价；采购保存仍须关联已签销售合同。
 */
export function contractCreateLanding(kind: ContractCreateKind) {
  if (kind === 'procurement') {
    return {
      formNode: 'N5' as const,
      formPath: '/pages/node/procurement',
      earliestWritable: 'N1' as const,
      requiresSalesLink: true,
      mustPassBeforeAdvance: ['N1', 'N2', 'N3'] as const,
    };
  }
  return {
    formNode: 'N3' as const,
    formPath: '/pages/node/contract',
    earliestWritable: 'N1' as const,
    requiresSalesLink: false,
    mustPassBeforeAdvance: ['N1', 'N2'] as const,
  };
}

export function demoCreateCaseInput(
  kind: ContractCreateKind,
  title?: string | null,
  amountFen?: number | null,
): CreateCaseSeedInput {
  const fallback = kind === 'procurement' ? DEMO_CREATE_DEFAULTS.procurementTitle : DEMO_CREATE_DEFAULTS.salesTitle;
  const t = String(title || '').trim() || fallback;
  const amt = Number(amountFen);
  const body: CreateCaseSeedInput = {
    title: t,
    goodsDesc: DEMO_CREATE_DEFAULTS.goodsDesc,
    destination: DEMO_CREATE_DEFAULTS.destination,
    amountFen: Number.isFinite(amt) && amt > 0 ? Math.round(amt) : DEMO_CREATE_DEFAULTS.amountFen,
    currency: DEMO_CREATE_DEFAULTS.currency,
  };
  if (kind === 'sales') {
    body.buyerName = t;
    body.buyerCountry = DEMO_CREATE_DEFAULTS.buyerCountry;
  }
  return body;
}

/** 买方/付款人/收货人同名，演示最短可筛查路径（付款人/收货人=买方）。 */
export function demoPartiesFromBuyer(buyerName?: string | null, country?: string | null) {
  const name = String(buyerName || '').trim();
  if (!name) return [];
  const c = String(country || '').trim() || null;
  return CUSTOMER_PARTY_ROLES.map((role) => ({
    role,
    name,
    country: c,
    isSameAsBuyer: role !== PartyRole.BUYER,
  }));
}

export function canShowCreateContract(role?: string | null) {
  return canWriteBusiness(role);
}

/** 新建返回的案件尚未进入销售/采购列表，除非随后保存了合同或采购计划。 */
export function newCaseAppearsOnList(
  kind: ContractCreateKind,
  row: { currentNode?: string | null; contract?: unknown | null; procurementPlan?: unknown | null },
) {
  return kind === 'procurement' ? isProcurementContractListItem(row) : isSalesContractListItem(row);
}
