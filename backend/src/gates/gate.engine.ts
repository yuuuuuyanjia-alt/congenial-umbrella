import {
  Bearer,
  BlControl,
  BUYER_ARRANGED_FREIGHT_INCOTERMS,
  CHANGE_FIELDS,
  CIF_FAMILY_INCOTERMS,
  INCOTERMS_CODES,
  N6_MISSING_TRANSPORT_FALLBACK,
  COMPARE_FIELDS,
  ChangeStatus,
  Decision,
  DelayTrigger,
  Disposition,
  DocType,
  EportStatus,
  FieldLabel,
  HISTORY_DEV_MEDIUM_PCT,
  HISTORY_DEV_SOFT_PCT,
  NodeStatus,
  CUSTOMER_PARTY_ROLES,
  N3_SINOSURE_UNREGISTERED_REASON,
  N5_SALES_LINK_REQUIRED_REASON,
  N5_SALES_NOT_SIGNED_REASON,
  N6_PLUS_PENDING_CHANGE_REASON,
  SINOSURE_EXPOSURE_HIGH_REJECTED_REASON,
  SINOSURE_EXPOSURE_HIGH_REVIEW_REASON,
  PartyRole,
  PartyRoleLabel,
  PriceBasis,
  QuoteStatus,
  SENSITIVE_CHANGE_FIELDS,
  VAGUE_PRICE_RE,
} from '../common/constants';
import {
  CaseSnapshot,
  ChangeDiffSnap,
  ChangeOrderSnap,
  GateResult,
  HitSnap,
  QuoteSnap,
  ShipmentSnap,
  SinosurePolicySnap,
} from '../common/types';
import {
  ExposureBand,
  evaluateOccupancy,
  moneyLabel,
  newContractFenForNode,
} from '../customers/sinosure-exposure';
import {
  OccupancyReviewStatus,
  SINOSURE_EXPOSURE_HIGH_APPROVED_ALERT,
  isOccupancyHighApproved,
  matchingOccupancyReview,
} from '../workbench/occupancy-review';
import { applyTaxFinanceGate } from '../tax-finance/tax-finance';

const HARD_GATES = new Set(['N6', 'N7', 'N9']);

export function emptyResult(nodeCode: string): GateResult {
  return {
    nodeCode,
    decision: Decision.PASS,
    canProceed: true,
    missing: [],
    reasons: [],
    alerts: [],
  };
}

export function evaluateNode(nodeCode: string, snap: CaseSnapshot): GateResult {
  let result: GateResult;
  switch (nodeCode) {
    case 'N1':
      result = evaluateN1(snap);
      break;
    case 'N2':
      result = evaluateN2(snap);
      break;
    case 'N3':
      result = evaluateN3(snap);
      break;
    case 'N4':
      result = evaluateN4(snap);
      break;
    case 'N5':
      result = evaluateN5(snap);
      break;
    case 'N6':
      result = evaluateN6(snap);
      break;
    case 'N7':
      result = evaluateN7(snap);
      break;
    case 'N8':
      result = evaluateN8(snap);
      break;
    case 'N9':
      result = evaluateN9(snap);
      break;
    default:
      result = { ...emptyResult(nodeCode), canProceed: false, reasons: ['未知节点'] };
  }
  return applyTaxFinanceGate(result, snap);
}

export function isSupplierHit(h: HitSnap): boolean {
  return h.partyRole === PartyRole.SUPPLIER || h.nodeCode === 'N5';
}

export function customerHitsOf(hits: HitSnap[]): HitSnap[] {
  return hits.filter((h) => !isSupplierHit(h));
}

export function supplierHitsOf(hits: HitSnap[]): HitSnap[] {
  return hits.filter((h) => isSupplierHit(h));
}

export function evaluateN1(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N1');
  for (const role of CUSTOMER_PARTY_ROLES) {
    if (!snap.parties.some((p) => p.role === role && p.name.trim())) {
      r.missing.push(`N1_PARTY_${role}`);
      r.reasons.push(`缺少当事方：${PartyRoleLabel[role]}`);
    }
  }
  if (!snap.kycRan) {
    r.missing.push('N1_SCREENING_NOT_RUN');
    r.reasons.push('尚未完成制裁/不可靠实体筛查');
  }

  const buckets = openHitBuckets(customerHitsOf(snap.hits));
  if (
    applyHighScreening(
      r,
      buckets,
      'N1_HIGH_CONFIDENCE_HIT',
      '高置信命中制裁/不可靠实体清单，硬拦截，禁止进入后续交易节点',
    )
  ) {
    return r;
  }
  if (r.missing.length) return blockMissing(r);
  if (
    applyMediumScreening(
      r,
      buckets,
      'N1_REVIEW_PENDING',
      '中风险命中，进入案例工作台审核队列，通过前不得推进',
    )
  ) {
    return r;
  }
  if (applyLowScreeningAlert(r, buckets, '低置信/低风险命中：软提示，不阻断业务，须保留审计痕迹')) {
    r.reasons.push('当事方齐全，筛查仅低置信软提示');
    return r;
  }
  r.decision = Decision.PASS;
  r.canProceed = true;
  r.reasons.push('当事方齐全且筛查未命中阻断项');
  return r;
}

export function evaluateN2(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N2');
  const q = activeQuote(snap);
  if (!q) {
    r.missing.push('N2_QUOTE');
    r.reasons.push('尚未录入有效报价');
    return blockMissing(r);
  }

  const textBlob = [q.includedItems, q.excludedItems, q.notes, q.abnormalPriceNote]
    .filter(Boolean)
    .join(' ');
  if (VAGUE_PRICE_RE.test(textBlob) || VAGUE_PRICE_RE.test(q.priceBasis || '')) {
    r.missing.push('N2_VAGUE_PRICING');
    r.reasons.push('报价含「价格待定/费用另议」等模糊用语，禁止推进');
  }

  if (!Object.values(PriceBasis).includes(q.priceBasis as (typeof PriceBasis)[keyof typeof PriceBasis])) {
    r.missing.push('N2_PRICE_BASIS');
    r.reasons.push('未明确价格基础（含项目 / 不含项目 / 部分含）');
  } else if (q.priceBasis === PriceBasis.INCLUSIVE || q.priceBasis === PriceBasis.MIXED) {
    if (!q.includedItems?.trim()) {
      r.missing.push('N2_INCLUDED_ITEMS');
      r.reasons.push('价格基础为含项目，须列明所含费用项目');
    }
  }
  if (q.priceBasis === PriceBasis.EXCLUSIVE || q.priceBasis === PriceBasis.MIXED) {
    if (!q.excludedItems?.trim()) {
      r.missing.push('N2_EXCLUDED_ITEMS');
      r.reasons.push('价格基础为不含项目，须列明未含费用项目');
    }
  }

  if (!q.validityUntil) {
    r.missing.push('N2_VALIDITY');
    r.reasons.push('未填写报价有效期');
  } else if (toDate(q.validityUntil).getTime() < toDate(snap.now ?? new Date()).getTime()) {
    r.missing.push('N2_VALIDITY_EXPIRED');
    r.reasons.push('报价有效期已过，须出具新版本报价');
  }

  if (!q.freightBearer || !isBearer(q.freightBearer)) {
    r.missing.push('N2_FREIGHT_BEARER');
    r.reasons.push('未明确运费承担方');
  }
  if (!q.taxBearer || !isBearer(q.taxBearer)) {
    r.missing.push('N2_TAX_BEARER');
    r.reasons.push('未明确税费承担方');
  }
  if (!q.unitPriceFen || q.unitPriceFen <= 0) {
    r.missing.push('N2_UNIT_PRICE');
    r.reasons.push('未填写有效单价');
  }

  if (r.missing.length) return blockMissing(r);

  const price = q.unitPriceFen!;
  if (snap.costFloorFen && price < snap.costFloorFen) {
    const msg = `报价单价低于成本底线（底线 ${(snap.costFloorFen / 100).toFixed(2)}，报价 ${(price / 100).toFixed(2)}）`;
    if (q.abnormalPriceNote?.trim()) {
      r.alerts.push(`${msg}；已注明原因，软提示关注`);
    } else {
      r.decision = Decision.REVIEW;
      r.canProceed = false;
      r.missing.push('N2_BELOW_COST_FLOOR');
      r.reasons.push(`${msg}，中风险，须填写异常说明后复核`);
      return r;
    }
  }

  if (snap.historyUnitPrices?.length) {
    const avg = snap.historyUnitPrices.reduce((s, n) => s + n, 0) / snap.historyUnitPrices.length;
    if (avg > 0) {
      const pct = Math.abs(price - avg) / avg;
      if (pct >= HISTORY_DEV_MEDIUM_PCT) {
        r.alerts.push(
          `单价较历史均价偏离 ${(pct * 100).toFixed(0)}%（均价 ${(avg / 100).toFixed(2)}），中度异常，软提示`,
        );
      } else if (pct >= HISTORY_DEV_SOFT_PCT) {
        r.alerts.push(`单价较历史均价偏离 ${(pct * 100).toFixed(0)}%，软提示关注`);
      }
    }
  }

  if (r.alerts.length) {
    r.decision = Decision.SOFT_ALERT;
    r.canProceed = true;
    r.reasons.push(`报价版本 v${q.version} 要素齐全，存在价格偏离提示`);
    return r;
  }
  r.reasons.push(`报价版本 v${q.version} 价格基础、有效期与承担方齐全`);
  return r;
}

export function evaluateN3(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N3');
  if (!hasRegisteredSinosureLimit(snap, 'N3')) {
    return blockN3SinosureUnregistered(r, snap);
  }
  const c = snap.contract;
  if (!c) {
    r.missing.push('N3_CONTRACT');
    r.reasons.push('尚未录入合同/订单确认信息');
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    return r;
  }
  if (!c.hasRetentionOfTitle) {
    r.missing.push('N3_RETENTION_OF_TITLE');
    r.reasons.push('缺少所有权保留条款（必填）');
  }
  if (!c.hasDisputeClause) {
    r.missing.push('N3_DISPUTE_CLAUSE');
    r.reasons.push('缺少争议解决条款（必填）');
  }
  const transportCode = parseIncotermsCode(c.incoterms);
  if (!transportCode) {
    r.missing.push('N3_INCOTERMS');
    r.reasons.push(
      isSettlementOnlyIncoterms(c.incoterms)
        ? 'T/T 是结算方式，不能写入国际贸易术语；请另选 FOB/CIF 等运输术语'
        : '未填写国际贸易术语（Incoterms）',
    );
  } else if (['EXW', 'DDP'].includes(transportCode)) {
    r.alerts.push(`国际贸易术语 ${c.incoterms} 对出口方货权/清关责任不利，软提示关注`);
  }
  if (!c.paymentTerms) {
    r.missing.push('N3_PAYMENT_TERMS');
    r.reasons.push('未填写付款条件');
  } else if (/OA|开账|赊销/i.test(c.paymentTerms) && /90|120|180/.test(c.paymentTerms)) {
    r.alerts.push(`付款条件「${c.paymentTerms}」账期较长，软提示关注收汇风险`);
  }

  const total = contractTotalFen(snap);
  const ccy = contractCurrency(snap);
  if (!total || total <= 0) {
    r.missing.push('N3_CONTRACT_AMOUNT');
    r.reasons.push('未填写合同总金额，无法核对中信保限额');
  }
  applySinosureGate(r, snap, 'N3', total, ccy);

  if (hardMissing(r).length) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    return r;
  }
  return finalizeExposureDecision(
    r,
    snap,
    '所有权保留与争议条款齐全，贸易术语、付款条件与中信保占用已校验',
  );
}

export function evaluateN4(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N4');
  const open = (snap.changeOrders || []).filter(
    (c) => c.status !== ChangeStatus.APPLIED && c.status !== ChangeStatus.SUPERSEDED,
  );
  if (!open.length && !(snap.changeOrders || []).length) {
    r.reasons.push('无待确认变更，允许进入国内采购/备货');
    return r;
  }

  for (const co of open) {
    if (!co.diffs?.length) {
      r.missing.push(`N4_DIFF_${co.changeNo}`);
      r.reasons.push(`变更单 ${co.changeNo} 缺少字段 diff`);
    }
    if (!co.customerAck || !co.customerAckEvidenceId) {
      r.missing.push(`N4_CUSTOMER_ACK_${co.changeNo}`);
      r.reasons.push(`变更单 ${co.changeNo} 缺少客户确认（须可追溯证据编号）`);
    }
    if (!co.internalAck || !co.internalAckEvidenceId) {
      r.missing.push(`N4_INTERNAL_ACK_${co.changeNo}`);
      r.reasons.push(`变更单 ${co.changeNo} 缺少内部确认`);
    }
    if (co.isSensitive && (!co.approved || !co.approvalEvidenceId)) {
      r.missing.push(`N4_APPROVAL_${co.changeNo}`);
      r.reasons.push(`变更单 ${co.changeNo} 含敏感字段，须额外审批`);
    }
    if (co.status !== ChangeStatus.APPLIED && co.customerAck && co.internalAck && (!co.isSensitive || co.approved)) {
      r.missing.push(`N4_NOT_APPLIED_${co.changeNo}`);
      r.reasons.push(`变更单 ${co.changeNo} 已确认但尚未生效，须应用新版本`);
    }
  }

  const post = snapAfterChanges(snap);
  const total = contractTotalFen(post);
  const ccy = contractCurrency(post);
  applySinosureGate(r, snap, 'N4', total, ccy);

  if (hardMissing(r).length) return blockMissing(r);

  const relevant = (snap.changeOrders || []).filter((c) => c.status !== ChangeStatus.SUPERSEDED);
  for (const co of relevant) {
    const retrigger = retriggerRelated(snap, co);
    if (retrigger) {
      r.missing.push(...retrigger.missing.map((m) => `N4_RETRIGGER_${co.changeNo}_${m}`));
      r.reasons.push(
        `变更单 ${co.changeNo} 触发关联节点复核未通过：${retrigger.reasons.join('；')}`,
      );
      r.alerts.push(...retrigger.alerts);
      if (retrigger.decision === Decision.HARD_BLOCK || retrigger.decision === Decision.REVIEW) {
        r.decision = retrigger.decision;
        r.canProceed = false;
        return r;
      }
    }
  }

  if (hardMissing(r).length) return blockMissing(r);
  return finalizeExposureDecision(
    r,
    snap,
    '变更单证据链完整（diff → 客户/内部确认 → 新版本），中信保占用已按变更后金额核对',
  );
}

export function evaluateN5(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N5');
  if (hasPendingChanges(snap)) {
    r.missing.push('N5_PENDING_CHANGE');
    r.reasons.push('存在未生效变更单，须先完成变更管理（客户确认 + 内部确认）');
    return blockMissing(r);
  }
  const plan = snap.procurementPlan;
  if (!plan) {
    r.missing.push('N5_PLAN');
    r.reasons.push('尚未录入国内采购/备货信息');
    return blockMissing(r);
  }
  const supplier = snap.parties.find((p) => p.role === PartyRole.SUPPLIER && p.name.trim());
  if (!supplier) {
    r.missing.push('N5_SUPPLIER');
    r.reasons.push('缺少国内供应商名称');
  }
  if (!plan.poNo?.trim()) {
    r.missing.push('N5_PO_NO');
    r.reasons.push('未填写采购订单/采购合同编号');
  }
  if (!plan.salesCaseId?.trim()) {
    r.missing.push('N5_SALES_LINK');
    r.reasons.push(N5_SALES_LINK_REQUIRED_REASON);
  } else if (!plan.salesContractSigned) {
    r.missing.push('N5_SALES_NOT_SIGNED');
    r.reasons.push(N5_SALES_NOT_SIGNED_REASON);
  }
  if (!plan.plannedArrival) {
    r.missing.push('N5_PLANNED_ARRIVAL');
    r.reasons.push('未填写供应商实际交付日期');
  }
  const contractDelivery = plan.contractDelivery || snap.contract?.deliveryDate;
  if (!snap.supplierScreened) {
    r.missing.push('N5_SCREENING_NOT_RUN');
    r.reasons.push('尚未完成国内供应商制裁/不可靠实体筛查');
  }

  const buckets = openHitBuckets(supplierHitsOf(snap.hits));
  if (
    applyHighScreening(
      r,
      buckets,
      'N5_HIGH_CONFIDENCE_HIT',
      '国内供应商高置信命中制裁/不可靠实体清单，硬拦截，禁止推进',
    )
  ) {
    return r;
  }
  if (r.missing.length) return blockMissing(r);
  if (
    applyMediumScreening(
      r,
      buckets,
      'N5_REVIEW_PENDING',
      '国内供应商中风险命中，进入案例工作台审核队列，通过前不得推进',
    )
  ) {
    return r;
  }

  const delay = checkProcurementDelayVsSalesDelivery({
    plannedArrival: plan.plannedArrival,
    actualArrival: plan.actualArrival,
    salesDelivery: contractDelivery,
  });
  if (!delay.delayed) {
    if (delay.passReason) r.reasons.push(delay.passReason);
    applyLowScreeningAlert(r, buckets, '国内供应商低置信/低风险命中：软提示，不阻断，须保留审计痕迹');
    return r;
  }

  if (!plan.delayRegistered) {
    r.missing.push('N5_DELAY_NOT_REGISTERED');
    r.reasons.push(delay.lateReason);
  }
  const validTrigger =
    !!plan.delayTriggerCode &&
    Object.values(DelayTrigger).includes(plan.delayTriggerCode as (typeof DelayTrigger)[keyof typeof DelayTrigger]);
  if (!validTrigger && !plan.delayTriggerRef?.trim()) {
    r.missing.push('N5_DELAY_TRIGGER');
    r.reasons.push('延期触发条件须选择结构化原因或填写依据编号');
  }
  if (r.missing.length) return blockMissing(r);

  if (!plan.customerConsent || !plan.customerConsentEvidenceId) {
    r.decision = Decision.REVIEW;
    r.canProceed = false;
    r.missing.push('N5_DELAY_WITHOUT_CONSENT');
    r.reasons.push('采购交付延期未经客户同意（缺少可追溯证据编号），中风险，禁止推进');
    return r;
  }
  r.reasons.push('已登记结构化采购交付延期且客户同意证据可追溯');
  applyLowScreeningAlert(r, buckets, '国内供应商低置信/低风险命中：软提示，不阻断，须保留审计痕迹');
  return r;
}

/** 日历日比较：供应商实际交付日期或实际交付日期任一晚于关联销售合同交货期，即视为延期。 */
export type ProcurementDelayVsSales = {
  salesDelivery: Date | null;
  salesDeliveryYmd: string | null;
  plannedLate: boolean;
  actualLate: boolean;
  delayed: boolean;
  passReason: string | null;
  lateReason: string;
};

export function checkProcurementDelayVsSalesDelivery(input: {
  plannedArrival?: string | Date | null;
  actualArrival?: string | Date | null;
  salesDelivery?: string | Date | null;
}): ProcurementDelayVsSales {
  const salesDelivery = dayOrNull(input.salesDelivery);
  const planned = dayOrNull(input.plannedArrival);
  const actual = dayOrNull(input.actualArrival);
  const plannedLate = !!(salesDelivery && planned && planned.getTime() > salesDelivery.getTime());
  const actualLate = !!(salesDelivery && actual && actual.getTime() > salesDelivery.getTime());
  const delayed = plannedLate || actualLate;
  const salesDeliveryYmd = salesDelivery ? ymdLocal(salesDelivery) : null;
  const lateParts = [
    plannedLate ? '供应商实际交付日期' : '',
    actualLate ? '实际交付日期' : '',
  ].filter(Boolean);
  const lateReason = salesDeliveryYmd
    ? `对照关联销售合同交货期 ${salesDeliveryYmd}：${lateParts.join('与')}晚于该交期，须登记延期`
    : '供应商实际交付日期或实际交付日期晚于关联销售合同交货期，须登记延期';
  let passReason: string | null = null;
  if (salesDeliveryYmd && !delayed) {
    if (planned && actual) {
      passReason = `对照关联销售合同交货期 ${salesDeliveryYmd}：供应商实际交付日期与实际交付日期均不晚于该交期`;
    } else if (actual) {
      passReason = `对照关联销售合同交货期 ${salesDeliveryYmd}：实际交付日期不晚于该交期`;
    } else {
      passReason = `对照关联销售合同交货期 ${salesDeliveryYmd}：供应商实际交付日期不晚于该交期`;
    }
  }
  return { salesDelivery, salesDeliveryYmd, plannedLate, actualLate, delayed, passReason, lateReason };
}

const KNOWN_INCOTERMS = new Set<string>(INCOTERMS_CODES);

/** 文本是否含电汇结算（T/T），不论是否同时写了运输术语。 */
export function isTtSettlementText(raw?: string | null): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  return /t\s*\/\s*t/i.test(s) || /^tt(?:\b|\s|$)/i.test(s);
}

/** 整段只是结算方式、没有可识别的运输术语（历史把 T/T 写入 incoterms）。 */
export function isSettlementOnlyIncoterms(raw?: string | null): boolean {
  return isTtSettlementText(raw) && !parseIncotermsCode(raw);
}

/**
 * 从「FOB Shanghai」「Incoterms 2020 CIF」等文本取出运输术语代码。
 * 只认国际商会 Incoterms；电汇 T/T 不是术语，**不得**按斜杠切成 `T`。
 */
export function parseIncotermsCode(raw?: string | null): string {
  if (!raw) return '';
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/^INCOTERMS(?:\s*20\d{2})?\s+/, '');
  if (!s) return '';
  const found = s.match(/[A-Z]{3}/g) || [];
  for (const code of found) {
    if (KNOWN_INCOTERMS.has(code)) return code;
  }
  return '';
}

export function isBuyerArrangedFreight(incoterms?: string | null): boolean {
  const code = parseIncotermsCode(incoterms);
  return (BUYER_ARRANGED_FREIGHT_INCOTERMS as readonly string[]).includes(code);
}

/** CIF 条款族：销售合同展示装运港/到港货物状态；不影响 N6 FOB 无提单路径。 */
export function isCifFamilyIncoterms(incoterms?: string | null): boolean {
  const code = parseIncotermsCode(incoterms);
  return (CIF_FAMILY_INCOTERMS as readonly string[]).includes(code);
}

function contractHasTtSettlement(contract?: { ttTiming?: string | null; paymentTerms?: string | null } | null): boolean {
  const t = String(contract?.ttTiming || '').trim().toUpperCase();
  if (t === 'ADVANCE' || t === 'AFTER') return true;
  const terms = String(contract?.paymentTerms || '');
  return /前\s*T\s*\/\s*T|后\s*T\s*\/\s*T/i.test(terms);
}

/**
 * N6/N7 使用的运输术语：本节点手工覆盖优先，否则取 N3 合同运输术语。
 * T/T 是结算方式，装运规则跟随所选 Incoterm。
 * 无有效运输术语时（含历史 T/T 写入 incoterms、或已选前/后 T/T 却未填运输术语）
 * 明确回退为 FOB（买方安排运输），避免把 T/T 切成 T 后误走卖方提单路径。
 */
export function effectiveN6Incoterms(snap: CaseSnapshot): string {
  const raw = snap.shipment?.incotermsOverride || snap.contract?.incoterms;
  const code = parseIncotermsCode(raw);
  if (code) return code;
  if (isSettlementOnlyIncoterms(raw) || contractHasTtSettlement(snap.contract)) {
    return N6_MISSING_TRANSPORT_FALLBACK;
  }
  return '';
}

export { N6_MISSING_TRANSPORT_FALLBACK };

export function isBlTypeControl(blControl?: string | null): boolean {
  return blControl === BlControl.ORIGINAL || blControl === BlControl.TELEX_RELEASE;
}

export function isNoBlControl(blControl?: string | null): boolean {
  return blControl === BlControl.NO_BL || blControl === BlControl.FOB_NO_BL;
}

export function hasNoBlJustification(s: Pick<ShipmentSnap, 'noBlReason' | 'noBlRef' | 'noBlEvidenceStub'>): boolean {
  return !!(s.noBlReason?.trim() || s.noBlRef?.trim() || s.noBlEvidenceStub?.trim());
}

/** N7 跟随 N6：买方安排运输且已选无提单时，不硬要提单，改核装船通知 / 订舱号。 */
export function isN7NoBlPath(snap: CaseSnapshot): boolean {
  return isNoBlControl(snap.shipment?.blControl) && isBuyerArrangedFreight(effectiveN6Incoterms(snap));
}

export function evaluateN6(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N6');
  const pending = refusePendingChangeAtShipment(r, snap);
  if (pending) return pending;
  const s = snap.shipment;
  if (!s) {
    r.missing.push('N6_SHIPMENT');
    r.reasons.push('尚未录入装运/提单指示');
    return finalizeHard(r);
  }

  if (!s.hasCustomerWrittenInstruction || !s.instructionRef?.trim()) {
    r.missing.push('N6_CUSTOMER_WRITTEN_INSTRUCTION');
    r.reasons.push('硬闸门：缺少客户书面提单指示');
  }
  if (!s.hasInternalApproval) {
    r.missing.push('N6_INTERNAL_APPROVAL');
    r.reasons.push('硬闸门：缺少内部审批');
  }

  const rawIncoterms = s.incotermsOverride || snap.contract?.incoterms;
  const incoterms = effectiveN6Incoterms(snap);
  const buyerFreight = isBuyerArrangedFreight(incoterms);
  const blType = isBlTypeControl(s.blControl);
  const noBl = isNoBlControl(s.blControl);
  if (!parseIncotermsCode(rawIncoterms) && incoterms === N6_MISSING_TRANSPORT_FALLBACK) {
    r.alerts.push(
      '未识别到运输术语（T/T 为结算方式，不是 Incoterm）。N6 按 FOB（买方安排运输）回退执行，不按卖方提单路径。',
    );
  }

  if (noBl) {
    if (!buyerFreight) {
      r.missing.push('N6_NO_BL_INCOTERMS');
      r.reasons.push(
        '硬闸门：无提单路径仅适用于 FOB/EXW/FAS/FCA（买方安排运输）；CIF/CFR 等须改本节点贸易术语或改选正本/电放',
      );
    }
    if (!hasNoBlJustification(s)) {
      r.missing.push('N6_NO_BL_JUSTIFICATION');
      r.reasons.push('硬闸门：无提单路径须记录依据（装船通知 / 订舱 / 买方自行安排运输说明）');
    }
  } else if (blType) {
    // 正本或电放任一即可，不必同时具备；FOB 交易若实际仍有提单亦可走此路径。
  } else if (buyerFreight) {
    r.missing.push('N6_NO_BL_PATH');
    r.reasons.push('硬闸门：FOB 等买方安排运输须选择「无提单」路径并记录依据，或仍选择正本/电放其一');
  } else {
    r.missing.push('N6_BL_CONTROL');
    r.reasons.push('硬闸门：未明确提单控制方式（正本或电放，二选一即可）');
  }

  if (!r.missing.length) {
    if (noBl) {
      r.reasons.push(`硬闸门证据齐全：书面指示、内部审批、无提单路径（${incoterms || '买方安排运输'}）`);
    } else if (s.blControl === BlControl.TELEX_RELEASE) {
      r.reasons.push('硬闸门证据齐全：书面指示、内部审批、电放提单');
    } else {
      r.reasons.push('硬闸门证据齐全：书面指示、内部审批、正本提单');
    }
  }

  return finalizeHard(r);
}

export function evaluateN7(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N7');
  const pending = refusePendingChangeAtShipment(r, snap);
  if (pending) return pending;
  const byType = Object.fromEntries(snap.documents.map((d) => [d.type, d]));
  const contractDoc = byType[DocType.CONTRACT];
  const invoice = byType[DocType.INVOICE];
  const packing = byType[DocType.PACKING];
  const bl = byType[DocType.BL];
  const finalContract = snap.contract?.isFinal || contractDoc?.isFinal;

  if (!finalContract) {
    r.missing.push('N7_FINAL_CONTRACT');
    r.reasons.push('硬闸门：缺少终稿合同');
  }
  if (!invoice) {
    r.missing.push('N7_INVOICE');
    r.reasons.push('硬闸门：缺少发票');
  }
  if (!packing) {
    r.missing.push('N7_PACKING');
    r.reasons.push('硬闸门：缺少装箱单');
  }

  const noBlPath = isN7NoBlPath(snap);
  if (noBlPath) {
    if (!snap.shipment || !hasNoBlJustification(snap.shipment)) {
      r.missing.push('N7_SHIPPING_ADVICE');
      r.reasons.push('硬闸门：无提单路径须核验装船通知 / 订舱号等依据（与 N6 NO_BL 一致），不要求提单');
    }
  } else if (!bl) {
    r.missing.push('N7_BL');
    r.reasons.push('硬闸门：缺少提单');
  }

  const docs = (noBlPath ? [contractDoc, invoice, packing] : [contractDoc, invoice, packing, bl]).filter(Boolean);
  const setLabel = noBlPath ? '合同/发票/装箱单' : '合同/发票/装箱单/提单';
  const fixed = new Set(snap.mismatchFixes.map((f) => f.field));
  for (const field of COMPARE_FIELDS) {
    const values = docs
      .map((d) => d!.fields[field])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
      .map((v) => comparableDocField(field, v))
      .filter((v): v is string => !!v);
    if (values.length < 2) continue;
    const unique = new Set(values);
    if (unique.size > 1 && !fixed.has(field)) {
      r.missing.push(`N7_FIELD_MISMATCH_${field}`);
      r.reasons.push(
        `硬闸门：${FieldLabel[field] || field} 在${setLabel}间不一致，且无不符点修改记录`,
      );
    }
  }
  return finalizeHard(r);
}

function comparableDocField(field: string, v: unknown): string | null {
  const s = String(v).trim();
  if (!s) return null;
  if (field !== 'incoterms') return s.toUpperCase();
  const code = parseIncotermsCode(s);
  if (code) return code;
  if (isSettlementOnlyIncoterms(s)) return null;
  return s.toUpperCase();
}

export function evaluateN8(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N8');
  const pending = refusePendingChangeAtShipment(r, snap);
  if (pending) return pending;
  const c = snap.customs;
  if (!c) {
    r.missing.push('N8_CUSTOMS');
    r.reasons.push('尚未录入报关信息');
    return blockMissing(r);
  }
  if (!c.hsCode?.trim()) {
    r.missing.push('N8_HS_CODE');
    r.reasons.push('未填写 HS 编码');
  }
  if (!c.productName?.trim()) {
    r.missing.push('N8_PRODUCT_NAME');
    r.reasons.push('未填写报关品名');
  }
  const tpl = snap.hsTemplate;
  if (c.hsCode?.trim() && !tpl) {
    r.missing.push('N8_HS_TEMPLATE');
    r.reasons.push(`HS ${c.hsCode} 无申报要素模板，禁止申报`);
  }
  if (tpl) {
    const elements = c.declareElements || {};
    const missingEls = tpl.requiredElements.filter((el) => !String(elements[el] ?? '').trim());
    if (missingEls.length) {
      r.missing.push('N8_DECLARE_ELEMENTS');
      r.reasons.push(`申报要素不完整，缺：${missingEls.join('、')}`);
    }
    if (c.productName?.trim() && !namesLooseMatch(c.productName, tpl.productName)) {
      r.missing.push('N8_HS_PRODUCT_MISMATCH');
      r.reasons.push(`品名「${c.productName}」与 HS 模板「${tpl.productName}」严重不符，禁止申报`);
    }
    if (c.unit?.trim() && normalize(c.unit) !== normalize(tpl.unit)) {
      r.alerts.push(`计量单位「${c.unit}」与税则单位「${tpl.unit}」不一致，软提示`);
    }
    if (c.exportTaxName?.trim() && normalize(c.exportTaxName) !== normalize(tpl.exportTaxName)) {
      r.alerts.push(`出口税则品名「${c.exportTaxName}」与模板「${tpl.exportTaxName}」不一致，软提示`);
    }
  }
  if (!c.originEvidenceType || !c.originEvidenceRef) {
    r.missing.push('N8_ORIGIN_EVIDENCE');
    r.reasons.push('缺少原产地证据（类型 + 编号）');
  }
  if (c.eportStatus === EportStatus.HELD) {
    r.missing.push('N8_EPORT_HELD');
    r.reasons.push('电子口岸状态为扣留/退单，禁止放行');
  }

  if (r.missing.length) return blockMissing(r);

  if (!c.eportStatus || c.eportStatus === EportStatus.NOT_SYNCED) {
    r.alerts.push('电子口岸尚未同步，可先模拟同步后再推进');
  }

  if (r.alerts.length) {
    r.decision = Decision.SOFT_ALERT;
    r.canProceed = true;
    r.reasons.push('HS 与申报要素齐全，存在税则品名/单位或口岸状态软提示');
    return r;
  }
  r.reasons.push('HS 编码、申报要素与原产地证据齐全，允许报关放行');
  return r;
}

export function evaluateN9(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N9');
  const pending = refusePendingChangeAtShipment(r, snap);
  if (pending) return pending;
  const n7 = snap.nodes.find((n) => n.code === 'N7');
  if (!n7 || n7.status !== NodeStatus.PASSED) {
    r.missing.push('N9_PREREQ_DOC_CONSISTENCY');
    r.reasons.push('硬闸门：单证一致性节点尚未通过，不能收汇放行');
  }
  const s = snap.settlement;
  if (!s) {
    r.missing.push('N9_SETTLEMENT');
    r.reasons.push('尚未录入收汇对账信息');
    return finalizeHard(r);
  }
  if (!s.hasRemittanceMemo || !s.remittanceMemoRef) {
    r.missing.push('N9_REMITTANCE_MEMO');
    r.reasons.push('硬闸门：缺少汇款附言/水单摘要');
  }
  if (!s.hasDocConsistencyProof) {
    r.missing.push('N9_DOC_CONSISTENCY_PROOF');
    r.reasons.push('硬闸门：缺少单证一致证明');
  }
  if (!s.hasReleaseApproval) {
    r.missing.push('N9_RELEASE_APPROVAL');
    r.reasons.push('硬闸门：缺少收汇放行审批');
  }
  const thirdParty = s.isThirdParty || namesDiffer(s.payerName, s.buyerName);
  if (thirdParty && !s.hasThirdPartyProof) {
    r.missing.push('N9_THIRD_PARTY_RELATION_PROOF');
    r.reasons.push('硬闸门：付款人与买方不一致，缺少第三方关系证明');
  }
  return finalizeHard(r);
}

function namesDiffer(a: string, b: string): boolean {
  return a.trim().toUpperCase() !== b.trim().toUpperCase();
}

function finalizeHard(r: GateResult): GateResult {
  if (r.missing.length) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    if (HARD_GATES.has(r.nodeCode) && !r.reasons.some((x) => x.includes('证据缺失不得推进'))) {
      r.reasons.push('硬闸门未满足，拒绝推进至下一节点');
    }
  } else {
    r.decision = r.alerts.length ? Decision.SOFT_ALERT : Decision.PASS;
    r.canProceed = true;
    if (!r.reasons.length) r.reasons.push('硬闸门证据齐全，允许推进');
  }
  return r;
}

function blockMissing(r: GateResult): GateResult {
  r.decision = Decision.HARD_BLOCK;
  r.canProceed = false;
  return r;
}

function openHitBuckets(hits: HitSnap[]) {
  const openHits = hits.filter(
    (h) => h.disposition === Disposition.OPEN || h.disposition === Disposition.CONFIRMED_TRUE,
  );
  return {
    high: openHits.filter((h) => h.riskLevel === 'HIGH' && h.confidence === 'HIGH'),
    confirmed: openHits.filter((h) => h.disposition === Disposition.CONFIRMED_TRUE),
    medium: openHits.filter((h) => h.riskLevel === 'MEDIUM' || h.confidence === 'MEDIUM'),
    low: openHits.filter((h) => h.riskLevel === 'LOW' || h.confidence === 'LOW'),
  };
}

type HitBuckets = ReturnType<typeof openHitBuckets>;

function applyHighScreening(r: GateResult, buckets: HitBuckets, missing: string, reason: string): boolean {
  if (!buckets.high.length && !buckets.confirmed.length) return false;
  r.decision = Decision.HARD_BLOCK;
  r.canProceed = false;
  r.missing.push(missing);
  r.reasons.push(reason);
  return true;
}

function applyMediumScreening(r: GateResult, buckets: HitBuckets, missing: string, reason: string): boolean {
  if (!buckets.medium.length) return false;
  r.decision = Decision.REVIEW;
  r.canProceed = false;
  r.missing.push(missing);
  r.reasons.push(reason);
  return true;
}

function applyLowScreeningAlert(r: GateResult, buckets: HitBuckets, alert: string): boolean {
  if (!buckets.low.length) return false;
  r.decision = Decision.SOFT_ALERT;
  r.canProceed = true;
  r.alerts.push(alert);
  return true;
}

function activeQuote(snap: CaseSnapshot): QuoteSnap | undefined {
  return (snap.quotes || []).find((q) => q.status === QuoteStatus.ACTIVE) || snap.quotes?.[0];
}

function isBearer(v: string) {
  return v === Bearer.SELLER || v === Bearer.BUYER;
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayOrNull(v?: string | Date | null): Date | null {
  if (v == null || v === '') return null;
  const d = toDate(v as string | Date);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalize(s: string) {
  return s.replace(/\s+/g, '').toLowerCase();
}

function namesLooseMatch(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

function retriggerRelated(snap: CaseSnapshot, co: ChangeOrderSnap): GateResult | null {
  const fields = new Set(co.diffs.map((d) => d.field));
  const hypothetical = applyDiffsToSnap(snap, co.diffs);
  if (fields.has('consigneeName') || fields.has('buyerName') || fields.has('payerName')) {
    const n1 = evaluateN1(hypothetical);
    if (!n1.canProceed) return n1;
  }
  if (fields.has('paymentTerms')) {
    const n3 = evaluateN3(hypothetical);
    if (!n3.canProceed) return n3;
  }
  return null;
}

export function applyDiffsToSnap(snap: CaseSnapshot, diffs: ChangeDiffSnap[]): CaseSnapshot {
  const next: CaseSnapshot = JSON.parse(JSON.stringify(snap));
  next.contract = next.contract || {
    hasRetentionOfTitle: false,
    hasDisputeClause: false,
    isFinal: false,
  };
  for (const d of diffs) {
    if (d.field === 'deliveryDate') next.contract.deliveryDate = d.newValue;
    if (d.field === 'quantity') {
      const qty = Number(d.newValue);
      next.contract.quantity = qty;
      const quote = activeQuote(next);
      if (quote?.unitPriceFen && Number.isFinite(qty)) {
        next.contract.amountFen = quote.unitPriceFen * qty;
      } else {
        const oldQty = Number(d.oldValue);
        if (next.contract.amountFen && oldQty > 0 && Number.isFinite(qty)) {
          next.contract.amountFen = Math.round((next.contract.amountFen * qty) / oldQty);
        }
      }
    }
    if (d.field === 'amountFen') {
      const amt = Number(d.newValue);
      if (Number.isFinite(amt)) next.contract.amountFen = amt;
    }
    if (d.field === 'consigneeName') {
      next.contract.consigneeName = d.newValue;
      upsertPartySnap(next, PartyRole.CONSIGNEE, d.newValue);
    }
    if (d.field === 'paymentTerms') next.contract.paymentTerms = d.newValue;
    if (d.field === 'buyerName') {
      next.contract.buyerName = d.newValue;
      upsertPartySnap(next, PartyRole.BUYER, d.newValue);
    }
    if (d.field === 'payerName') upsertPartySnap(next, PartyRole.PAYER, d.newValue);
  }
  return next;
}

function upsertPartySnap(snap: CaseSnapshot, role: string, name: string) {
  const existing = snap.parties.find((p) => p.role === role);
  if (existing) existing.name = name;
  else snap.parties.push({ role, name, isSameAsBuyer: role === PartyRole.BUYER });
}

export function hasPendingChanges(snap: CaseSnapshot): boolean {
  return (snap.changeOrders || []).some(
    (c) => c.status !== ChangeStatus.APPLIED && c.status !== ChangeStatus.SUPERSEDED,
  );
}

/** N6+：未生效变更硬拦截装运及后续，不与其他缺项混报。 */
function refusePendingChangeAtShipment(r: GateResult, snap: CaseSnapshot): GateResult | null {
  if (!hasPendingChanges(snap)) return null;
  r.missing.push(`${r.nodeCode}_PENDING_CHANGE`);
  r.reasons.push(N6_PLUS_PENDING_CHANGE_REASON);
  return HARD_GATES.has(r.nodeCode) ? finalizeHard(r) : blockMissing(r);
}

/** 流程 1→2→3→4(按需)→5→6→7→8→9。N3 之后若无变更单则跳过 N4。 */
export function nextNode(current: string, snap?: CaseSnapshot): string | null {
  const order = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];
  const i = order.indexOf(current);
  if (i < 0 || i === order.length - 1) return null;
  if (current === 'N3' && snap && !(snap.changeOrders || []).length) return 'N5';
  return order[i + 1];
}

/** @deprecated 使用 nextNode */
export function nextMvpNode(current: string, snap?: CaseSnapshot): string | null {
  return nextNode(current, snap);
}

export function isChangeField(field: string): field is (typeof CHANGE_FIELDS)[number] {
  return (CHANGE_FIELDS as readonly string[]).includes(field);
}

export function isSensitiveChange(fields: string[]): boolean {
  return fields.some((f) => SENSITIVE_CHANGE_FIELDS.has(f));
}

export function latestSinosure(snap: CaseSnapshot, nodeCode: string): SinosurePolicySnap | undefined {
  const list = (snap.sinosurePolicies || []).filter((p) => p.nodeCode === nodeCode);
  return list.length ? list[list.length - 1] : undefined;
}

export function hasSinosureEvidence(p?: SinosurePolicySnap | null): boolean {
  return !!(p && (p.evidenceId || p.evidenceRef || p.fileName));
}

/** 本案 N3/N4 是否已登记有效投保限额（与客户管理「未登记」同一口径）。 */
export function hasRegisteredSinosureLimit(snap: CaseSnapshot, nodeCode: string): boolean {
  const pol = latestSinosure(snap, nodeCode);
  return !!(pol && pol.insuredLimitFen > 0);
}

/** N3 保存合同：未登记限额即 HARD_BLOCK，不要求合同要素已填。 */
export function evaluateN3ContractSave(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N3');
  if (!hasRegisteredSinosureLimit(snap, 'N3')) {
    return blockN3SinosureUnregistered(r, snap);
  }
  r.reasons.push('中信保限额已登记，允许保存合同');
  return r;
}

function blockN3SinosureUnregistered(r: GateResult, snap: CaseSnapshot): GateResult {
  const pol = latestSinosure(snap, 'N3');
  r.missing.push('N3_SINOSURE_LIMIT');
  if (!hasSinosureEvidence(pol)) {
    r.missing.push('N3_SINOSURE_EVIDENCE');
  }
  r.reasons.push(N3_SINOSURE_UNREGISTERED_REASON);
  r.decision = Decision.HARD_BLOCK;
  r.canProceed = false;
  return r;
}

export function contractCurrency(snap: CaseSnapshot): string {
  return snap.contract?.currency || snap.caseCurrency || 'USD';
}

/** 合同总金额（分）：优先 数量×报价单价，其次合同金额，再次报价/案件金额 */
export function contractTotalFen(snap: CaseSnapshot): number {
  const quote = activeQuote(snap);
  const qty = snap.contract?.quantity ?? quote?.quantity ?? null;
  if (qty && quote?.unitPriceFen) return qty * quote.unitPriceFen;
  if (snap.contract?.amountFen && snap.contract.amountFen > 0) return snap.contract.amountFen;
  if (quote?.amountFen && quote.amountFen > 0) return quote.amountFen;
  if (snap.caseAmountFen && snap.caseAmountFen > 0) return snap.caseAmountFen;
  return 0;
}

export function snapAfterChanges(snap: CaseSnapshot): CaseSnapshot {
  let next = snap;
  for (const co of (snap.changeOrders || []).filter((c) => c.status !== ChangeStatus.SUPERSEDED)) {
    next = applyDiffsToSnap(next, co.diffs);
  }
  return next;
}

function applySinosureGate(
  r: GateResult,
  snap: CaseSnapshot,
  nodeCode: 'N3' | 'N4',
  totalFen: number,
  currency: string,
) {
  const pol = latestSinosure(snap, nodeCode);
  if (nodeCode === 'N3' && !hasRegisteredSinosureLimit(snap, 'N3')) {
    blockN3SinosureUnregistered(r, snap);
    return;
  }
  if (!hasSinosureEvidence(pol)) {
    r.missing.push(`${nodeCode}_SINOSURE_EVIDENCE`);
    r.reasons.push(
      nodeCode === 'N3'
        ? N3_SINOSURE_UNREGISTERED_REASON
        : '进入变更后须再次上传或确认中信保保单',
    );
  }
  if (!pol || !pol.insuredLimitFen || pol.insuredLimitFen <= 0) {
    r.missing.push(`${nodeCode}_SINOSURE_LIMIT`);
    r.reasons.push(
      nodeCode === 'N3' ? N3_SINOSURE_UNREGISTERED_REASON : '变更后须重新登记中信保投保限额',
    );
  }
  if (pol?.currency && currency && pol.currency.toUpperCase() !== currency.toUpperCase()) {
    r.missing.push(`${nodeCode}_SINOSURE_CURRENCY`);
    r.reasons.push(`中信保限额币种（${pol.currency}）与合同币种（${currency}）不一致，禁止推进`);
  }

  const exp = evaluateOccupancy({
    openUnpaidFen: snap.sinosureOccupancy?.openUnpaidFen ?? 0,
    fulfilledUnpaidFen: snap.sinosureOccupancy?.fulfilledUnpaidFen ?? 0,
    newContractFen: newContractFenForNode({ nodeCode, nodes: snap.nodes, totalFen }),
    insuredLimitFen: pol?.insuredLimitFen ?? 0,
    currency: pol?.currency || currency || 'USD',
    limitCurrency: pol?.currency || null,
    contractCurrency: currency,
  });
  r.exposure = exp;
  for (const note of exp.notes) r.alerts.push(note);
  r.reasons.push(exp.summary);

  const canBand =
    !!pol && pol.insuredLimitFen > 0 && !r.missing.includes(`${nodeCode}_SINOSURE_CURRENCY`);
  if (!canBand) return;

  if (exp.band === ExposureBand.ULTRA_HIGH) {
    r.missing.push(`${nodeCode}_SINOSURE_OVER_LIMIT`);
    r.missing.push(`${nodeCode}_SINOSURE_EXPOSURE_ULTRA`);
    r.reasons.push(
      `中信保占用超过投保限额 ${moneyLabel(exp.excessFen, exp.currency)}，属超高风险，禁止推进`,
    );
  } else if (exp.band === ExposureBand.HIGH) {
    r.reasons.push(`超额 ${moneyLabel(exp.excessFen, exp.currency)}，高风险，须审核后才能推进`);
  } else if (exp.band === ExposureBand.MEDIUM) {
    r.alerts.push(`超额 ${moneyLabel(exp.excessFen, exp.currency)}，中风险软提示，可继续推进`);
  } else if (exp.band === ExposureBand.BELOW_MEDIUM) {
    r.alerts.push(`超额 ${moneyLabel(exp.excessFen, exp.currency)}（不足 1 万美元），软提示关注`);
  } else if (exp.band === ExposureBand.WITHIN_LIMIT) {
    r.reasons.push(`占用未超限额，剩余额度 ${moneyLabel(exp.remainingFen, exp.currency)}`);
  }
}

function hardMissing(r: GateResult): string[] {
  return (r.missing || []).filter((m) => !/_SINOSURE_EXPOSURE_HIGH$/.test(m));
}

function finalizeExposureDecision(r: GateResult, snap: CaseSnapshot, passReason: string): GateResult {
  const exp = r.exposure;
  if (hardMissing(r).length) return blockMissing(r);
  if (exp?.band === ExposureBand.HIGH) {
    if (isOccupancyHighApproved(snap.occupancyReviews, r.nodeCode, exp)) {
      r.decision = Decision.SOFT_ALERT;
      r.canProceed = true;
      if (!r.alerts.includes(SINOSURE_EXPOSURE_HIGH_APPROVED_ALERT)) {
        r.alerts.push(SINOSURE_EXPOSURE_HIGH_APPROVED_ALERT);
      }
      return r;
    }
    r.missing.push(`${r.nodeCode}_SINOSURE_EXPOSURE_HIGH`);
    r.decision = Decision.REVIEW;
    r.canProceed = false;
    const review = matchingOccupancyReview(snap.occupancyReviews, r.nodeCode, exp);
    if (review?.status === OccupancyReviewStatus.REJECTED) {
      if (!r.reasons.includes(SINOSURE_EXPOSURE_HIGH_REJECTED_REASON)) {
        r.reasons.push(SINOSURE_EXPOSURE_HIGH_REJECTED_REASON);
      }
    } else if (!r.reasons.includes(SINOSURE_EXPOSURE_HIGH_REVIEW_REASON)) {
      r.reasons.push(SINOSURE_EXPOSURE_HIGH_REVIEW_REASON);
    }
    return r;
  }
  if (r.alerts.length || exp?.band === ExposureBand.MEDIUM || exp?.band === ExposureBand.BELOW_MEDIUM) {
    r.decision = Decision.SOFT_ALERT;
    r.canProceed = true;
    return r;
  }
  if (!r.reasons.includes(passReason)) r.reasons.push(passReason);
  return r;
}
