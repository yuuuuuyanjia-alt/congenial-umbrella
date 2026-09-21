import { yuanToFen } from './api';
import { canWriteBusiness } from './role';

/** 与后端 DEMO_CREATE_DEFAULTS 对齐：约 25,000 USD，品名/目的地可改。 */
export const DEMO_CREATE = {
  goodsDesc: '数控机床配件（演示）',
  destination: 'Hamburg, DE',
  amountYuan: '25000.00',
  currency: 'USD',
  buyerCountry: 'DE',
  salesTitle: '演示销售合同',
  procurementTitle: '演示采购合同',
} as const;

export function canShowCreateContract(role?: string | null) {
  return canWriteBusiness(role);
}

export function buildCreateCaseBody(
  kind: 'sales' | 'procurement',
  title: string,
  amountYuan: string,
) {
  const fallback = kind === 'procurement' ? DEMO_CREATE.procurementTitle : DEMO_CREATE.salesTitle;
  const t = String(title || '').trim() || fallback;
  const fen = yuanToFen(amountYuan);
  const body: Record<string, unknown> = {
    title: t,
    goodsDesc: DEMO_CREATE.goodsDesc,
    destination: DEMO_CREATE.destination,
    amountFen: fen > 0 ? fen : 2_500_000,
    currency: DEMO_CREATE.currency,
  };
  if (kind === 'sales') {
    body.buyerName = t;
    body.buyerCountry = DEMO_CREATE.buyerCountry;
  }
  return body;
}

export function createFormPage(kind: 'sales' | 'procurement') {
  return kind === 'procurement' ? '/pages/node/procurement' : '/pages/node/contract';
}
