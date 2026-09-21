import { CUSTOMER_PARTY_ROLES, PartyRole } from '../common/constants';
import { canWriteBusiness } from '../auth/roles';
import { isEligibleSalesCase, isProcurementContractListItem, isSalesContractListItem } from './sales-link';

/** 演示新建销售合同：金额约 25,000 USD，避免一上来撞超高风险占用档。 */
export const DEMO_CREATE_DEFAULTS = {
  goodsDesc: '数控机床配件（演示）',
  destination: 'Hamburg, DE',
  amountFen: 2_500_000,
  currency: 'USD',
  buyerCountry: 'DE',
  salesTitle: '演示销售合同',
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
 * 销售：POST /cases 从 N1 起，落地询盘 KYC，用户沿 N1→N2→N3 填写销售合同（不跳到空白 N3）。
 * 采购：不新建无销售合同的案件；须点选一笔已签销售合同，打开该案 N5（已有 PO 则编辑）。
 */
export function contractCreateLanding(kind: ContractCreateKind) {
  if (kind === 'procurement') {
    return {
      createsNewCase: false as const,
      formNode: 'N5' as const,
      formPath: '/pages/node/procurement',
      earliestWritable: 'N5' as const,
      requiresSignedSalesPick: true,
      mustPassBeforeAdvance: [] as const,
    };
  }
  return {
    createsNewCase: true as const,
    formNode: 'N1' as const,
    formPath: '/pages/node/kyc',
    earliestWritable: 'N1' as const,
    requiresSignedSalesPick: false,
    mustPassBeforeAdvance: ['N1', 'N2'] as const,
  };
}

export function demoCreateCaseInput(title?: string | null, amountFen?: number | null): CreateCaseSeedInput {
  const t = String(title || '').trim() || DEMO_CREATE_DEFAULTS.salesTitle;
  const amt = Number(amountFen);
  return {
    title: t,
    goodsDesc: DEMO_CREATE_DEFAULTS.goodsDesc,
    destination: DEMO_CREATE_DEFAULTS.destination,
    amountFen: Number.isFinite(amt) && amt > 0 ? Math.round(amt) : DEMO_CREATE_DEFAULTS.amountFen,
    currency: DEMO_CREATE_DEFAULTS.currency,
    buyerName: t,
    buyerCountry: DEMO_CREATE_DEFAULTS.buyerCountry,
  };
}

/** 买方/付款人/收货人同名，便于在 N1 直接筛查（付款人/收货人=买方）。 */
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

export function isSignedSalesPick(row: {
  signed?: boolean;
  currentNode?: string | null;
  contract?: unknown | null;
  nodes?: Array<{ code: string; status: string }>;
}) {
  if (typeof row.signed === 'boolean') return row.signed;
  return isEligibleSalesCase(row as Parameters<typeof isEligibleSalesCase>[0]);
}

export function procurementOpenTarget(row: { id: string; procurementPlan?: unknown | null; poNo?: string | null }) {
  return {
    caseId: row.id,
    formPath: '/pages/node/procurement',
    isEdit: !!(row.procurementPlan || row.poNo),
  };
}

/** 新建销售案尚未进销售列表，除非随后到达 N3 或已有销售合同。 */
export function newCaseAppearsOnList(
  kind: ContractCreateKind,
  row: { currentNode?: string | null; contract?: unknown | null; procurementPlan?: unknown | null },
) {
  return kind === 'procurement' ? isProcurementContractListItem(row) : isSalesContractListItem(row);
}
