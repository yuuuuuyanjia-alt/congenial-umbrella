import { yuanToFen, SALES_CURRENCY } from './api';
import { canWriteBusiness } from './role';

/** 与后端 DEMO_CREATE_DEFAULTS 对齐：约 25,000 USD。 */
export const DEMO_CREATE = {
  goodsDesc: '数控机床配件（演示）',
  destination: 'Hamburg, DE',
  amountYuan: '25000.00',
  currency: SALES_CURRENCY,
  buyerCountry: 'DE',
  salesTitle: '演示销售合同',
} as const;

export function canShowCreateContract(role?: string | null) {
  return canWriteBusiness(role);
}

export function buildCreateCaseBody(title: string, amountYuan: string) {
  const t = String(title || '').trim() || DEMO_CREATE.salesTitle;
  const fen = yuanToFen(amountYuan);
  return {
    title: t,
    goodsDesc: DEMO_CREATE.goodsDesc,
    destination: DEMO_CREATE.destination,
    amountFen: fen > 0 ? fen : 2_500_000,
    currency: DEMO_CREATE.currency,
    buyerName: t,
    buyerCountry: DEMO_CREATE.buyerCountry,
  };
}

export function salesCreateLandingPage(caseId: string) {
  return `/pages/node/quote?id=${caseId}&fromCreate=1`;
}

export function signedSalesPicks(rows: any[]) {
  return (rows || []).filter((c) => c && c.signed);
}

export function procurementOpenUrl(caseId: string) {
  return `/pages/node/procurement?id=${caseId}`;
}
