/**
 * 出口退税与融资性贸易审查（FT1–FT4）。
 * 公司是出口方，不是过桥。不强制自有仓；港口直出须货物流+报关+发票+收汇闭环。
 * 红线 HARD_BLOCK；黄灯工作台领取/通过/驳回。
 */

import { Decision, EportStatus } from '../common/constants';
import { CaseSnapshot, ContractSnap, GateResult, ProcurementPlanSnap } from '../common/types';

export const DeliveryMode = {
  OWN_WAREHOUSE: 'OWN_WAREHOUSE',
  BONDED: 'BONDED',
  DIRECT_PORT: 'DIRECT_PORT',
} as const;

export type DeliveryModeCode = (typeof DeliveryMode)[keyof typeof DeliveryMode];

export const DeliveryModeLabel: Record<string, string> = {
  OWN_WAREHOUSE: '自有仓',
  BONDED: '保税仓储',
  DIRECT_PORT: '港口直出',
};

export const TAX_FINANCE_NODES = new Set(['N3', 'N5', 'N6', 'N7']);

/** 毛利率低于 3%（300 bps）视为薄利，直出时黄灯。 */
export const THIN_MARGIN_BPS = 300;

export const TaxFinanceBand = {
  YELLOW: 'YELLOW',
  RED: 'RED',
} as const;

export const TaxFinanceReviewStatus = {
  OPEN: 'OPEN',
  CLAIMED: 'CLAIMED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
  HARD_BLOCKED: 'HARD_BLOCKED',
} as const;

export type TaxFinanceReviewStatusCode =
  (typeof TaxFinanceReviewStatus)[keyof typeof TaxFinanceReviewStatus];

export const TaxFinanceReviewStatusLabel: Record<string, string> = {
  OPEN: '待领取',
  CLAIMED: '已领取',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  SUPERSEDED: '已失效',
  HARD_BLOCKED: '红线硬拦截',
};

export const TaxFinanceWorkbenchAction = {
  CLAIM: 'CLAIM',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
} as const;

export const TaxFinanceWorkbenchActionLabel: Record<string, string> = {
  CLAIM: '领取',
  APPROVE: '通过',
  REJECT: '驳回',
};

export const TAX_FINANCE_QUEUE_STATUSES = [
  TaxFinanceReviewStatus.OPEN,
  TaxFinanceReviewStatus.CLAIMED,
  TaxFinanceReviewStatus.REJECTED,
  TaxFinanceReviewStatus.HARD_BLOCKED,
] as const;

export const TAX_FINANCE_YELLOW_APPROVED_ALERT = '工作台已通过该退税·融资性审核，允许推进';
export const TAX_FINANCE_YELLOW_REVIEW_REASON =
  '港口直出叠加采购-销售薄利，须在审核工作台领取并通过后方可推进（不强制自有仓）';
export const TAX_FINANCE_YELLOW_REJECTED_REASON = '工作台已驳回该退税·融资性审核，禁止推进';
export const TAX_FINANCE_EMPTY_TURN_REASON =
  '红线：港口直出迹象像空转/假出口，硬拦截，不得推进';
export const TAX_FINANCE_DELIVERY_MODE_REASON = '须选择交货方式（自有仓 / 港口直出）';
export const TAX_FINANCE_DIRECT_DOCS_REASON =
  '港口直出须填写货物仓储地点与批次号';
export const FT4_DECLARE_REASON = '退税申报前须完成就绪清单：报关放行、N9 收汇、进项发票号、四流闭环';

export const WorkbenchItemKindTax = {
  TAX_FINANCE: 'TAX_FINANCE',
} as const;

export interface DirectPortSnap {
  warehouseLocation?: string | null;
  batchNo?: string | null;
  goodsWhereAnswer?: string | null;
  goodsWhereRef?: string | null;
  customsPartyAnswer?: string | null;
  remittanceBoundAnswer?: string | null;
  remittanceBoundRef?: string | null;
  emptyTurnLikely?: boolean | null;
  emptyTurnAnswer?: string | null;
  emptyTurnRef?: string | null;
}

export interface TaxFinanceReviewSnap {
  id?: string;
  nodeCode: string;
  status: string;
  band?: string | null;
  reasonCode?: string | null;
  summary?: string | null;
  fingerprint?: string | null;
  claimedById?: string | null;
  comment?: string | null;
}

export interface TaxRebateSnap {
  inputInvoiceNo?: string | null;
  flowGoods?: boolean | null;
  flowCustoms?: boolean | null;
  flowInvoice?: boolean | null;
  flowRemittance?: boolean | null;
  declaredAt?: string | Date | null;
}

export interface SalesSideSnap {
  deliveryMode?: string | null;
  goodsDesc?: string | null;
  amountFen?: number | null;
  quantity?: number | null;
  currency?: string | null;
  directPort?: DirectPortSnap | null;
  consigneeName?: string | null;
  buyerName?: string | null;
}

export interface TaxFinanceView {
  band: 'YELLOW' | 'RED' | null;
  reasonCode: string;
  fingerprint: string;
  summary: string;
  marginBps: number | null;
  deliveryMode: string | null;
  directPortComplete: boolean;
}

export interface TaxFinanceEval {
  decision: GateResult['decision'];
  canProceed: boolean;
  missing: string[];
  reasons: string[];
  alerts: string[];
  view: TaxFinanceView;
}

export function isDeliveryMode(v?: string | null): v is DeliveryModeCode {
  return v === DeliveryMode.OWN_WAREHOUSE || v === DeliveryMode.BONDED || v === DeliveryMode.DIRECT_PORT;
}

export function parseDirectPort(raw?: string | null | DirectPortSnap): DirectPortSnap | null {
  if (!raw) return null;
  let v: DirectPortSnap | null = null;
  if (typeof raw === 'object') v = raw;
  else {
    try {
      const parsed = JSON.parse(raw) as DirectPortSnap;
      v = parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!v) return null;
  const warehouseLocation = v.warehouseLocation || v.goodsWhereAnswer || null;
  const batchNo = v.batchNo || v.goodsWhereRef || null;
  const rest = { ...v } as DirectPortSnap & { eLedgerNo?: string | null; customsPartyRef?: string | null };
  delete rest.eLedgerNo;
  delete rest.customsPartyRef;
  return {
    ...rest,
    warehouseLocation,
    batchNo,
    goodsWhereAnswer: v.goodsWhereAnswer || warehouseLocation,
    goodsWhereRef: v.goodsWhereRef || batchNo,
  };
}

export function stringifyDirectPort(dp?: DirectPortSnap | null): string | null {
  if (!dp) return null;
  const warehouseLocation = dp.warehouseLocation || dp.goodsWhereAnswer || null;
  const batchNo = dp.batchNo || dp.goodsWhereRef || null;
  return JSON.stringify({
    warehouseLocation,
    batchNo,
    goodsWhereAnswer: dp.goodsWhereAnswer || warehouseLocation,
    goodsWhereRef: dp.goodsWhereRef || batchNo,
    customsPartyAnswer: dp.customsPartyAnswer ?? null,
    remittanceBoundAnswer: dp.remittanceBoundAnswer ?? null,
    remittanceBoundRef: dp.remittanceBoundRef ?? null,
    emptyTurnLikely: dp.emptyTurnLikely ?? null,
    emptyTurnAnswer: dp.emptyTurnAnswer ?? null,
    emptyTurnRef: dp.emptyTurnRef ?? null,
  });
}

function filled(v?: string | null): boolean {
  return !!String(v || '').trim();
}

export function directPortGaps(dp?: DirectPortSnap | null): string[] {
  const missing: string[] = [];
  const warehouse = dp?.warehouseLocation || dp?.goodsWhereAnswer;
  const batch = dp?.batchNo || dp?.goodsWhereRef;
  if (!filled(warehouse)) missing.push('FT2_WAREHOUSE_LOCATION');
  if (!filled(batch)) missing.push('FT2_BATCH_NO');
  return missing;
}

export function isDirectPortComplete(dp?: DirectPortSnap | null): boolean {
  return directPortGaps(dp).length === 0;
}

function normalizeGoods(s?: string | null): string {
  return String(s || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function goodsLooseMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeGoods(a);
  const nb = normalizeGoods(b);
  if (!na || !nb) return true;
  return na.includes(nb) || nb.includes(na);
}

export function purchaseSalesMarginBps(salesFen?: number | null, purchaseFen?: number | null): number | null {
  const s = Number(salesFen) || 0;
  const p = Number(purchaseFen) || 0;
  if (s <= 0 || p <= 0) return null;
  return Math.round(((s - p) / s) * 10000);
}

export function isThinMargin(marginBps: number | null | undefined): boolean {
  return marginBps != null && marginBps < THIN_MARGIN_BPS;
}

export function effectiveSalesContract(snap: CaseSnapshot): SalesSideSnap | null {
  if (snap.salesContract) return snap.salesContract;
  const c = snap.contract;
  if (!c) return null;
  return {
    deliveryMode: c.deliveryMode,
    goodsDesc: c.goodsDesc,
    amountFen: c.amountFen,
    quantity: c.quantity,
    currency: c.currency,
    directPort: c.directPort || null,
    consigneeName: c.consigneeName,
    buyerName: c.buyerName,
  };
}

export function taxFinanceFingerprint(input: {
  band?: string | null;
  reasonCode?: string | null;
  deliveryMode?: string | null;
  marginBps?: number | null;
  emptyTurn?: boolean | null;
  docsComplete?: boolean;
  goodsMatch?: boolean;
}): string {
  return [
    input.band || '',
    input.reasonCode || '',
    input.deliveryMode || '',
    input.marginBps == null ? '' : String(input.marginBps),
    input.emptyTurn === true ? '1' : input.emptyTurn === false ? '0' : '',
    input.docsComplete ? '1' : '0',
    input.goodsMatch === false ? '0' : '1',
  ].join('|');
}

export function matchingTaxFinanceReview(
  reviews: TaxFinanceReviewSnap[] | null | undefined,
  nodeCode: string,
  fingerprint: string,
): TaxFinanceReviewSnap | undefined {
  const list = reviews || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const row = list[i];
    if (row.nodeCode !== nodeCode) continue;
    if (row.status === TaxFinanceReviewStatus.SUPERSEDED) continue;
    if ((row.fingerprint || '') === fingerprint) return row;
  }
  return undefined;
}

export function isTaxFinanceYellowApproved(
  reviews: TaxFinanceReviewSnap[] | null | undefined,
  nodeCode: string,
  fingerprint: string,
): boolean {
  return matchingTaxFinanceReview(reviews, nodeCode, fingerprint)?.status === TaxFinanceReviewStatus.APPROVED;
}

export function isTaxFinanceWorkbenchAction(action?: string | null): boolean {
  return (
    action === TaxFinanceWorkbenchAction.CLAIM ||
    action === TaxFinanceWorkbenchAction.APPROVE ||
    action === TaxFinanceWorkbenchAction.REJECT
  );
}

export function taxFinanceActionNextStatus(
  status: string,
  action: string,
): { ok: true; status: TaxFinanceReviewStatusCode } | { ok: false; error: string } {
  if (status === TaxFinanceReviewStatus.HARD_BLOCKED) {
    return { ok: false, error: '红线硬拦截，不可工作台放行' };
  }
  if (status === TaxFinanceReviewStatus.APPROVED || status === TaxFinanceReviewStatus.SUPERSEDED) {
    return { ok: false, error: '该退税·融资性审核已结束，不能再处置' };
  }
  if (action === TaxFinanceWorkbenchAction.CLAIM) {
    if (
      status === TaxFinanceReviewStatus.OPEN ||
      status === TaxFinanceReviewStatus.CLAIMED ||
      status === TaxFinanceReviewStatus.REJECTED
    ) {
      return { ok: true, status: TaxFinanceReviewStatus.CLAIMED };
    }
    return { ok: false, error: '当前状态不可领取' };
  }
  if (action === TaxFinanceWorkbenchAction.APPROVE) {
    if (
      status === TaxFinanceReviewStatus.OPEN ||
      status === TaxFinanceReviewStatus.CLAIMED ||
      status === TaxFinanceReviewStatus.REJECTED
    ) {
      return { ok: true, status: TaxFinanceReviewStatus.APPROVED };
    }
    return { ok: false, error: '当前状态不可通过' };
  }
  if (action === TaxFinanceWorkbenchAction.REJECT) {
    if (status === TaxFinanceReviewStatus.OPEN || status === TaxFinanceReviewStatus.CLAIMED) {
      return { ok: true, status: TaxFinanceReviewStatus.REJECTED };
    }
    if (status === TaxFinanceReviewStatus.REJECTED) {
      return { ok: true, status: TaxFinanceReviewStatus.REJECTED };
    }
    return { ok: false, error: '当前状态不可驳回' };
  }
  return { ok: false, error: '未知工作台动作' };
}

export function planTaxFinanceReviewSync(
  reviews: TaxFinanceReviewSnap[] | null | undefined,
  nodeCode: string,
  evalView: Pick<TaxFinanceView, 'band' | 'reasonCode' | 'fingerprint' | 'summary'> | null,
): {
  keepId?: string;
  supersedeIds: string[];
  create?: {
    nodeCode: string;
    status: string;
    band: string;
    reasonCode: string;
    summary: string;
    fingerprint: string;
  };
} {
  const current = (reviews || []).filter(
    (row) => row.nodeCode === nodeCode && row.status !== TaxFinanceReviewStatus.SUPERSEDED,
  );
  const stale = (statuses: string[]) =>
    current.filter((row) => statuses.includes(row.status) && row.id).map((row) => row.id!);

  if (!evalView?.band) {
    return {
      supersedeIds: stale([
        TaxFinanceReviewStatus.OPEN,
        TaxFinanceReviewStatus.CLAIMED,
        TaxFinanceReviewStatus.REJECTED,
        TaxFinanceReviewStatus.HARD_BLOCKED,
      ]),
    };
  }

  const match = matchingTaxFinanceReview(current, nodeCode, evalView.fingerprint);
  if (match) return { keepId: match.id, supersedeIds: [] };

  const queueStale = stale([
    TaxFinanceReviewStatus.OPEN,
    TaxFinanceReviewStatus.CLAIMED,
    TaxFinanceReviewStatus.REJECTED,
    TaxFinanceReviewStatus.HARD_BLOCKED,
  ]);

  const status =
    evalView.band === TaxFinanceBand.RED
      ? TaxFinanceReviewStatus.HARD_BLOCKED
      : TaxFinanceReviewStatus.OPEN;

  return {
    supersedeIds: queueStale,
    create: {
      nodeCode,
      status,
      band: evalView.band,
      reasonCode: evalView.reasonCode,
      summary: evalView.summary,
      fingerprint: evalView.fingerprint,
    },
  };
}

function emptyEval(deliveryMode: string | null): TaxFinanceEval {
  return {
    decision: Decision.PASS,
    canProceed: true,
    missing: [],
    reasons: [],
    alerts: [],
    view: {
      band: null,
      reasonCode: '',
      fingerprint: '',
      summary: '',
      marginBps: null,
      deliveryMode,
      directPortComplete: true,
    },
  };
}

function sameCurrency(a?: string | null, b?: string | null): boolean {
  const x = String(a || '').trim().toUpperCase();
  const y = String(b || '').trim().toUpperCase();
  return !!x && !!y && x === y;
}

function purchaseAmount(plan?: ProcurementPlanSnap | null): { fen: number | null; currency: string | null } {
  if (!plan) return { fen: null, currency: null };
  return { fen: plan.amountFen ?? null, currency: plan.currency ?? null };
}

export function evaluateTaxFinance(snap: CaseSnapshot, nodeCode: string): TaxFinanceEval {
  if (!TAX_FINANCE_NODES.has(nodeCode)) return emptyEval(null);

  const sales = effectiveSalesContract(snap);
  const contract: ContractSnap | null | undefined = snap.contract;
  const mode = (sales?.deliveryMode || contract?.deliveryMode || '').trim() || null;
  const dp = sales?.directPort || contract?.directPort || null;
  const r = emptyEval(mode);

  const isSignNode = nodeCode === 'N3' || nodeCode === 'N5';
  if (isSignNode && !isDeliveryMode(mode)) {
    r.missing.push('FT1_DELIVERY_MODE');
    r.reasons.push(TAX_FINANCE_DELIVERY_MODE_REASON);
  }

  const purchaseGoods = snap.caseGoodsDesc || contract?.goodsDesc || sales?.goodsDesc;
  const salesGoods = sales?.goodsDesc || contract?.goodsDesc || snap.caseGoodsDesc;
  const goodsMatch = goodsLooseMatch(salesGoods, purchaseGoods);
  const plan = snap.procurementPlan;
  const hasPurchase = !!(plan && (plan.poNo || plan.amountFen || plan.salesCaseId));

  if ((nodeCode === 'N5' || (nodeCode === 'N3' && hasPurchase)) && hasPurchase && !goodsMatch) {
    r.missing.push('FT1_GOODS_MISMATCH');
    r.reasons.push('红线：采购与销售货描严重不符，疑似假出口/空转，硬拦截');
    r.view.band = TaxFinanceBand.RED;
    r.view.reasonCode = 'FT1_GOODS_MISMATCH';
  }

  const purchase = purchaseAmount(plan);
  const salesFen = sales?.amountFen ?? contract?.amountFen ?? snap.caseAmountFen ?? null;
  const salesCcy = sales?.currency || contract?.currency || snap.caseCurrency || null;
  const marginBps =
    hasPurchase && sameCurrency(salesCcy, purchase.currency)
      ? purchaseSalesMarginBps(salesFen, purchase.fen)
      : null;
  r.view.marginBps = marginBps;

  const direct = mode === DeliveryMode.DIRECT_PORT;
  const docsMissing = direct ? directPortGaps(dp) : [];
  r.view.directPortComplete = !direct || docsMissing.length === 0;

  if (direct && (isSignNode || nodeCode === 'N6' || nodeCode === 'N7')) {
    if (docsMissing.length) {
      r.missing.push('FT2_DIRECT_PORT_DOCS', ...docsMissing);
      r.reasons.push(TAX_FINANCE_DIRECT_DOCS_REASON);
    }
    if (dp?.emptyTurnLikely === true) {
      r.missing.push('FT2_EMPTY_TURN');
      r.reasons.push(TAX_FINANCE_EMPTY_TURN_REASON);
      r.view.band = TaxFinanceBand.RED;
      r.view.reasonCode = 'FT2_EMPTY_TURN';
    }
  }

  if (direct && (nodeCode === 'N6' || nodeCode === 'N7')) {
    applyFt3(r, snap, sales, contract);
  }

  if (
    direct &&
    isSignNode &&
    isThinMargin(marginBps) &&
    r.view.band !== TaxFinanceBand.RED &&
    !docsMissing.length
  ) {
    r.view.band = TaxFinanceBand.YELLOW;
    r.view.reasonCode = 'FT1_THIN_MARGIN';
  }

  const fp = taxFinanceFingerprint({
    band: r.view.band,
    reasonCode: r.view.reasonCode,
    deliveryMode: mode,
    marginBps,
    emptyTurn: dp?.emptyTurnLikely ?? null,
    docsComplete: r.view.directPortComplete,
    goodsMatch,
  });
  r.view.fingerprint = fp;

  if (r.view.band === TaxFinanceBand.RED) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    r.view.summary = r.reasons[r.reasons.length - 1] || TAX_FINANCE_EMPTY_TURN_REASON;
    return r;
  }

  if (r.missing.filter((m) => m !== 'FT1_THIN_MARGIN').length) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    r.view.summary = r.reasons[0] || TAX_FINANCE_DIRECT_DOCS_REASON;
    r.view.fingerprint = taxFinanceFingerprint({
      band: null,
      reasonCode: r.missing[0],
      deliveryMode: mode,
      marginBps,
      emptyTurn: dp?.emptyTurnLikely ?? null,
      docsComplete: r.view.directPortComplete,
      goodsMatch,
    });
    return r;
  }

  if (r.view.band === TaxFinanceBand.YELLOW) {
    r.view.summary = TAX_FINANCE_YELLOW_REVIEW_REASON;
    if (isTaxFinanceYellowApproved(snap.taxFinanceReviews, nodeCode, fp)) {
      r.decision = Decision.SOFT_ALERT;
      r.canProceed = true;
      r.alerts.push(TAX_FINANCE_YELLOW_APPROVED_ALERT);
      return r;
    }
    r.missing.push('FT1_THIN_MARGIN');
    r.decision = Decision.REVIEW;
    r.canProceed = false;
    const review = matchingTaxFinanceReview(snap.taxFinanceReviews, nodeCode, fp);
    if (review?.status === TaxFinanceReviewStatus.REJECTED) {
      r.reasons.push(TAX_FINANCE_YELLOW_REJECTED_REASON);
    } else {
      r.reasons.push(TAX_FINANCE_YELLOW_REVIEW_REASON);
    }
    return r;
  }

  if (direct && r.view.directPortComplete) {
    r.reasons.push('港口直出已填仓储地点与批次号');
    r.view.summary = r.reasons[r.reasons.length - 1];
  }
  r.view.fingerprint = fp;
  return r;
}

function applyFt3(
  r: TaxFinanceEval,
  snap: CaseSnapshot,
  sales: SalesSideSnap | null,
  contract?: ContractSnap | null,
) {
  const goods = sales?.goodsDesc || contract?.goodsDesc || snap.caseGoodsDesc;
  const customsName = snap.customs?.productName;
  if (filled(customsName) && filled(goods) && !goodsLooseMatch(customsName, goods)) {
    r.missing.push('FT3_GOODS_MISMATCH');
    r.reasons.push('红线：报关品名与合同/直出货描严重不符，硬拦截');
    r.view.band = TaxFinanceBand.RED;
    r.view.reasonCode = 'FT3_GOODS_MISMATCH';
    return;
  }

  const expectedParty = sales?.consigneeName || contract?.consigneeName || contract?.buyerName;
  const blParty = snap.shipment?.consigneeOnBl;
  if (filled(blParty) && filled(expectedParty) && !goodsLooseMatch(blParty, expectedParty)) {
    r.missing.push('FT3_CONSIGNEE_MISMATCH');
    r.reasons.push('红线：提单收货人与合同收货人严重不符，硬拦截');
    r.view.band = TaxFinanceBand.RED;
    r.view.reasonCode = 'FT3_CONSIGNEE_MISMATCH';
  }
}

export function applyTaxFinanceGate(r: GateResult, snap: CaseSnapshot): GateResult {
  if (!TAX_FINANCE_NODES.has(r.nodeCode)) return r;
  const tf = evaluateTaxFinance(snap, r.nodeCode);
  r.taxFinance = tf.view;
  for (const m of tf.missing) {
    if (!r.missing.includes(m)) r.missing.push(m);
  }
  for (const reason of tf.reasons) {
    if (!r.reasons.includes(reason)) r.reasons.push(reason);
  }
  for (const alert of tf.alerts) {
    if (!r.alerts.includes(alert)) r.alerts.push(alert);
  }
  if (tf.decision === Decision.HARD_BLOCK) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    return r;
  }
  if (tf.decision === Decision.REVIEW) {
    if (r.decision !== Decision.HARD_BLOCK) {
      r.decision = Decision.REVIEW;
      r.canProceed = false;
    }
    return r;
  }
  return r;
}

export interface Ft4Eval {
  canDeclare: boolean;
  missing: string[];
  reasons: string[];
  items: Array<{ code: string; label: string; ok: boolean; source: 'auto' | 'manual' }>;
}

export function evaluateFt4(snap: {
  customs?: { eportStatus?: string | null } | null;
  settlement?: { hasRemittanceMemo?: boolean | null; amountFen?: number | null } | null;
  taxRebate?: TaxRebateSnap | null;
}): Ft4Eval {
  const customsCleared = snap.customs?.eportStatus === EportStatus.RELEASED;
  const n9 =
    !!snap.settlement &&
    !!snap.settlement.hasRemittanceMemo &&
    (Number(snap.settlement.amountFen) || 0) > 0;
  const invoiceNo = String(snap.taxRebate?.inputInvoiceNo || '').trim();
  const flowGoods = !!snap.taxRebate?.flowGoods;
  const flowCustoms = !!snap.taxRebate?.flowCustoms;
  const flowInvoice = !!snap.taxRebate?.flowInvoice;
  const flowRemittance = !!snap.taxRebate?.flowRemittance;

  const items: Ft4Eval['items'] = [
    { code: 'FT4_CUSTOMS', label: '报关已放行', ok: customsCleared, source: 'auto' },
    { code: 'FT4_N9_REMITTANCE', label: 'N9 收汇已登记', ok: n9, source: 'auto' },
    { code: 'FT4_INPUT_INVOICE', label: '进项发票号（可手填）', ok: !!invoiceNo, source: 'manual' },
    { code: 'FT4_FLOW_GOODS', label: '货物流闭环', ok: flowGoods, source: 'manual' },
    { code: 'FT4_FLOW_CUSTOMS', label: '报关闭环', ok: flowCustoms, source: 'manual' },
    { code: 'FT4_FLOW_INVOICE', label: '发票流闭环', ok: flowInvoice, source: 'manual' },
    { code: 'FT4_FLOW_REMITTANCE', label: '收汇流闭环', ok: flowRemittance, source: 'manual' },
  ];
  const missing = items.filter((i) => !i.ok).map((i) => i.code);
  const reasons = missing.length ? [FT4_DECLARE_REASON, ...items.filter((i) => !i.ok).map((i) => `缺：${i.label}`)] : [];
  return { canDeclare: missing.length === 0, missing, reasons, items };
}

export function completeDirectPortFixture(over: Partial<DirectPortSnap> = {}): DirectPortSnap {
  return {
    warehouseLocation: '上海洋山港待装仓',
    batchNo: 'BATCH-YG-2026-088',
    goodsWhereAnswer: '上海洋山港待装仓',
    goodsWhereRef: 'BATCH-YG-2026-088',
    emptyTurnLikely: false,
    ...over,
  };
}
