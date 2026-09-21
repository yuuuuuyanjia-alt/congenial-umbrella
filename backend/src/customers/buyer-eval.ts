/**
 * 客户评估（建议级别）：内部经营口径，不是中信保官方评级。
 * 规则：价值 50 / 风险 30 / 资信 20；百分位 + 固定权重；无 ML。
 */

import { RemittanceStatus, RemittanceStatusCode } from './remittance';
import { receivedFenOf, SettlementLedgerInput } from './sinosure-exposure';

export const EVAL_WEIGHTS = { value: 50, risk: 30, credit: 20 } as const;

/** 限额 ≤ 100,000 USD（分）触发「限额偏低·须核原因」；默认不得给 S。 */
export const LOW_LIMIT_USD_FEN = 10_000_000;

export const EvalGrade = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
} as const;

export type SuggestedGrade = (typeof EvalGrade)[keyof typeof EvalGrade];

export const EvalTag = {
  GOOD_REMIT: '回款优质',
  LOW_LIMIT: '限额偏低·须核原因',
  LONG_AR: '长期应收关注',
  THIN_MARGIN: '规模大·利润薄',
  DEDUCTION: '有扣款',
  NO_LIMIT: '限额未登记',
} as const;

export const PROFIT_MISSING_LABEL = '毛利估算/暂缺';

export type DeductionValue = 'none' | number;

export interface BuyerSinosureSlice {
  insuredLimitFen: number | null;
  occupancyFen: number;
  remainingFen: number;
  excessFen: number;
  band: string | null;
  bandLabel?: string | null;
  gateDecision?: string | null;
  gateLabel?: string | null;
  currency?: string | null;
  limitCurrency?: string | null;
  summary?: string | null;
}

export interface BuyerCaseEvalSlice {
  amountFen: number;
  currency: string;
  receivedFen: number;
  unpaidFen: number;
  remittanceCode: RemittanceStatusCode;
  paymentDueAt?: Date | string | null;
  /** 关联本销售合同的采购成本；币种需与销售一致才计入毛利。 */
  procurement?: Array<{ amountFen?: number | null; currency?: string | null }>;
}

export interface BuyerEvalFacts {
  salesFen: number;
  costFen: number | null;
  costMissing: boolean;
  remittance: {
    onTime: number;
    overdue: number;
    notDue: number;
    noRecord: number;
    unpaidFen: number;
    over60Fen: number;
    over90Fen: number;
    /** TODO: Settlement 无扣款金额字段；现网只能是 'none'。 */
    deduction: DeductionValue;
  };
  sinosure: BuyerSinosureSlice;
  /**
   * TODO: Customer 无「小单品种 vs 额度约束」原因字段。
   * 限额偏低进入 A 需要该原因；v1 无记录则不可进 A。
   */
  lowLimitReason?: string | null;
}

export interface BuyerEvaluation {
  suggestedGrade: SuggestedGrade;
  scores: { value: number; risk: number; credit: number; total: number };
  tags: string[];
  profit: {
    salesFen: number;
    costFen: number | null;
    grossFen: number | null;
    marginPct: number | null;
    costMissing: boolean;
    label: string | null;
  };
  remittance: {
    onTimeRate: number | null;
    unpaidFen: number;
    over60Fen: number;
    over90Fen: number;
    deduction: DeductionValue;
    counts: { onTime: number; overdue: number; notDue: number; noRecord: number };
  };
  sinosure: BuyerSinosureSlice;
}

function toDate(v?: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function utcDaysPastDue(dueAt?: Date | string | null, now?: Date | string | null): number | null {
  const due = toDate(dueAt);
  if (!due) return null;
  const n = utcDay(toDate(now) ?? new Date());
  return Math.round((n.getTime() - utcDay(due).getTime()) / 86_400_000);
}

export function isUsd(currency?: string | null): boolean {
  return String(currency || 'USD').trim().toUpperCase() === 'USD';
}

/** 中点百分位：并列取一半。空样本视为 50。 */
export function percentile(value: number, values: number[]): number {
  if (!values.length) return 50;
  let less = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) less += 1;
    else if (v === value) equal += 1;
  }
  return ((less + 0.5 * equal) / values.length) * 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundScore(n: number): number {
  return Math.round(clamp(n, 0, 100));
}

export function agingUnpaidFen(
  rows: Array<{ unpaidFen: number; paymentDueAt?: Date | string | null }>,
  now?: Date | string | null,
): { over60Fen: number; over90Fen: number } {
  let over60Fen = 0;
  let over90Fen = 0;
  for (const row of rows) {
    const unpaid = Math.max(0, Number(row.unpaidFen) || 0);
    if (!unpaid) continue;
    const days = utcDaysPastDue(row.paymentDueAt, now);
    if (days == null || days <= 60) continue;
    over60Fen += unpaid;
    if (days > 90) over90Fen += unpaid;
  }
  return { over60Fen, over90Fen };
}

export function onTimeRateOf(counts: { onTime: number; overdue: number }): number | null {
  const rated = (Number(counts.onTime) || 0) + (Number(counts.overdue) || 0);
  if (rated <= 0) return null;
  return (Number(counts.onTime) || 0) / rated;
}

function limitUnregistered(sino: BuyerSinosureSlice): boolean {
  return sino.insuredLimitFen == null || Number(sino.insuredLimitFen) <= 0;
}

function lowUsdLimit(sino: BuyerSinosureSlice): boolean {
  if (limitUnregistered(sino)) return false;
  const currency = sino.limitCurrency || sino.currency || 'USD';
  if (!isUsd(currency)) {
    // TODO: 非美元限额未换算，不套用「≤10 万美金」标签。
    return false;
  }
  return Number(sino.insuredLimitFen) <= LOW_LIMIT_USD_FEN;
}

function profitOf(facts: BuyerEvalFacts) {
  const salesFen = Math.max(0, Number(facts.salesFen) || 0);
  if (facts.costMissing) {
    return {
      salesFen,
      costFen: null as number | null,
      grossFen: null as number | null,
      marginPct: null as number | null,
      costMissing: true,
      label: PROFIT_MISSING_LABEL,
    };
  }
  if (facts.costFen == null) {
    return {
      salesFen,
      costFen: null as number | null,
      grossFen: null as number | null,
      marginPct: null as number | null,
      costMissing: false,
      label: null as string | null,
    };
  }
  const costFen = Math.max(0, Number(facts.costFen) || 0);
  const grossFen = salesFen - costFen;
  const marginPct = salesFen > 0 ? Math.round((grossFen / salesFen) * 1000) / 10 : null;
  return {
    salesFen,
    costFen,
    grossFen,
    marginPct,
    costMissing: false,
    label: null as string | null,
  };
}

function valueScore(
  facts: BuyerEvalFacts,
  peers: BuyerEvalFacts[],
): { score: number; gpLow: boolean; thinMargin: boolean; salesPct: number; gpPct: number | null } {
  const salesFen = Math.max(0, Number(facts.salesFen) || 0);
  const salesPct = percentile(
    salesFen,
    peers.map((p) => Math.max(0, Number(p.salesFen) || 0)),
  );
  const selfProfit = profitOf(facts);
  const peerGross = peers
    .map((p) => profitOf(p))
    .filter((p) => !p.costMissing && p.grossFen != null)
    .map((p) => p.grossFen as number);

  // 毛利权重大于销售额（70 / 30），低毛利百分位不得进 S/A。
  const gpShare = 0.7;
  const salesShare = 0.3;
  if (selfProfit.costMissing || selfProfit.grossFen == null) {
    const score = roundScore((salesPct / 100) * salesShare * EVAL_WEIGHTS.value);
    return { score, gpLow: true, thinMargin: false, salesPct, gpPct: null };
  }
  const gpPct = percentile(selfProfit.grossFen, peerGross.length ? peerGross : [selfProfit.grossFen]);
  const score = roundScore(((gpPct / 100) * gpShare + (salesPct / 100) * salesShare) * EVAL_WEIGHTS.value);
  const gpLow = gpPct < 40;
  const thinMargin = salesPct >= 70 && gpPct < 40;
  return { score: clamp(score, 0, EVAL_WEIGHTS.value), gpLow, thinMargin, salesPct, gpPct };
}

function riskScore(facts: BuyerEvalFacts): number {
  const rate = onTimeRateOf(facts.remittance);
  const onTimePts = (rate == null ? 0.5 : rate) * 12;
  let agingPts = 10;
  if (facts.remittance.over90Fen > 0) agingPts = 0;
  else if (facts.remittance.over60Fen > 0) agingPts = 4;
  const band = facts.sinosure.band;
  let occPts = 4;
  if (limitUnregistered(facts.sinosure)) occPts = 4;
  else if (band === 'WITHIN_LIMIT') occPts = 8;
  else if (band === 'BELOW_MEDIUM' || band === 'MEDIUM') occPts = 5;
  else if (band === 'HIGH') occPts = 2;
  else if (band === 'ULTRA_HIGH') occPts = 0;
  let deductionPenalty = 0;
  if (typeof facts.remittance.deduction === 'number' && facts.remittance.deduction > 0) {
    deductionPenalty = 5;
  }
  return clamp(roundScore(onTimePts + agingPts + occPts - deductionPenalty), 0, EVAL_WEIGHTS.risk);
}

function creditScore(facts: BuyerEvalFacts, peers: BuyerEvalFacts[]): number {
  if (limitUnregistered(facts.sinosure)) return 0;
  const limitFen = Number(facts.sinosure.insuredLimitFen) || 0;
  const peerLimits = peers
    .map((p) => p.sinosure.insuredLimitFen)
    .filter((v): v is number => v != null && v > 0);
  const limitPct = percentile(limitFen, peerLimits.length ? peerLimits : [limitFen]);
  const remainingRatio =
    limitFen > 0 ? clamp((Number(facts.sinosure.remainingFen) || 0) / limitFen, 0, 1) : 0;
  // 限额偏低不是「资信很差」的绝对结论，只略降权重，硬约束走级别封顶。
  const lowHaircut = lowUsdLimit(facts.sinosure) ? 0.9 : 1;
  const raw = ((limitPct / 100) * 12 + remainingRatio * 8) * lowHaircut;
  return clamp(roundScore(raw), 0, EVAL_WEIGHTS.credit);
}

function applyGradeCaps(
  total: number,
  opts: { unregistered: boolean; gpLow: boolean; lowLimit: boolean; hasLowLimitReason: boolean },
): SuggestedGrade {
  if (opts.unregistered) return EvalGrade.D;
  let grade: SuggestedGrade = EvalGrade.D;
  if (total >= 85) grade = EvalGrade.S;
  else if (total >= 70) grade = EvalGrade.A;
  else if (total >= 55) grade = EvalGrade.B;
  else if (total >= 40) grade = EvalGrade.C;

  if (opts.gpLow && (grade === EvalGrade.S || grade === EvalGrade.A)) grade = EvalGrade.B;
  if (opts.lowLimit) {
    if (grade === EvalGrade.S) grade = EvalGrade.A;
    if (grade === EvalGrade.A && !opts.hasLowLimitReason) grade = EvalGrade.B;
  }
  return grade;
}

function buildTags(input: {
  unregistered: boolean;
  lowLimit: boolean;
  longAr: boolean;
  thinMargin: boolean;
  deduction: boolean;
  goodRemit: boolean;
  grade: SuggestedGrade;
}): string[] {
  const tags: string[] = [];
  if (input.unregistered) tags.push(EvalTag.NO_LIMIT);
  if (input.lowLimit) tags.push(EvalTag.LOW_LIMIT);
  if (input.longAr) tags.push(EvalTag.LONG_AR);
  if (input.deduction) tags.push(EvalTag.DEDUCTION);
  if (input.thinMargin) tags.push(EvalTag.THIN_MARGIN);
  // 限额未登记硬门到 D，不得看起来「优质」。
  if (input.goodRemit && !input.unregistered && input.grade !== EvalGrade.D) {
    tags.push(EvalTag.GOOD_REMIT);
  }
  return tags;
}

/** 纯函数：对单一买方打分。peers 用于销售额/毛利/限额百分位。 */
export function evaluateBuyer(facts: BuyerEvalFacts, peers: BuyerEvalFacts[] = []): BuyerEvaluation {
  const cohort = peers.length ? peers : [facts];
  const profit = profitOf(facts);
  const value = valueScore(facts, cohort);
  const risk = riskScore(facts);
  const credit = creditScore(facts, cohort);
  const scores = {
    value: clamp(value.score, 0, EVAL_WEIGHTS.value),
    risk,
    credit,
    total: 0,
  };
  scores.total = scores.value + scores.risk + scores.credit;

  const unregistered = limitUnregistered(facts.sinosure);
  const lowLimit = lowUsdLimit(facts.sinosure);
  const rate = onTimeRateOf(facts.remittance);
  const suggestedGrade = applyGradeCaps(scores.total, {
    unregistered,
    gpLow: value.gpLow,
    lowLimit,
    hasLowLimitReason: !!String(facts.lowLimitReason || '').trim(),
  });
  const tags = buildTags({
    unregistered,
    lowLimit,
    longAr: facts.remittance.over60Fen > 0 || facts.remittance.over90Fen > 0,
    thinMargin: value.thinMargin,
    deduction: typeof facts.remittance.deduction === 'number' && facts.remittance.deduction > 0,
    goodRemit: rate != null && rate >= 0.9 && facts.remittance.overdue === 0,
    grade: suggestedGrade,
  });

  return {
    suggestedGrade,
    scores,
    tags,
    profit,
    remittance: {
      onTimeRate: rate == null ? null : Math.round(rate * 1000) / 1000,
      unpaidFen: Math.max(0, Number(facts.remittance.unpaidFen) || 0),
      over60Fen: Math.max(0, Number(facts.remittance.over60Fen) || 0),
      over90Fen: Math.max(0, Number(facts.remittance.over90Fen) || 0),
      deduction: facts.remittance.deduction ?? 'none',
      counts: {
        onTime: facts.remittance.onTime,
        overdue: facts.remittance.overdue,
        notDue: facts.remittance.notDue,
        noRecord: facts.remittance.noRecord,
      },
    },
    sinosure: { ...facts.sinosure },
  };
}

export function emptySinosureSlice(partial?: Partial<BuyerSinosureSlice>): BuyerSinosureSlice {
  return {
    insuredLimitFen: null,
    occupancyFen: 0,
    remainingFen: 0,
    excessFen: 0,
    band: null,
    bandLabel: '未测算',
    gateDecision: null,
    gateLabel: '未测算',
    currency: 'USD',
    limitCurrency: null,
    summary: '尚未登记投保限额。',
    ...partial,
  };
}

/**
 * 从案件切片汇总评估事实。
 * 回款只认调用方传入的 N9 receivedFen / remittanceCode（与 receivedFenOf 同一口径）。
 */
export function factsFromCases(
  cases: BuyerCaseEvalSlice[],
  sinosure: BuyerSinosureSlice,
  opts?: { now?: Date | string | null; deduction?: DeductionValue; lowLimitReason?: string | null },
): BuyerEvalFacts {
  let salesFen = 0;
  let costFen = 0;
  let costKnown = true;
  let hasSale = false;
  const counts = { onTime: 0, overdue: 0, notDue: 0, noRecord: 0 };
  let unpaidFen = 0;
  const agingRows: Array<{ unpaidFen: number; paymentDueAt?: Date | string | null }> = [];

  for (const c of cases) {
    const currency = c.currency || 'USD';
    const amountFen = Math.max(0, Number(c.amountFen) || 0);
    const unpaid = Math.max(0, Number(c.unpaidFen) || 0);
    unpaidFen += unpaid;
    agingRows.push({ unpaidFen: unpaid, paymentDueAt: c.paymentDueAt });

    if (c.remittanceCode === RemittanceStatus.ON_TIME) counts.onTime += 1;
    else if (c.remittanceCode === RemittanceStatus.OVERDUE) counts.overdue += 1;
    else if (c.remittanceCode === RemittanceStatus.NOT_DUE) counts.notDue += 1;
    else counts.noRecord += 1;

    if (amountFen <= 0) continue;
    if (!isUsd(currency)) {
      // TODO: 非美元销售未换算，不并入 salesFen。
      continue;
    }
    hasSale = true;
    salesFen += amountFen;

    const usable = (c.procurement || []).filter(
      (p) => p.amountFen != null && Number(p.amountFen) > 0 && isUsd(p.currency),
    );
    if (!usable.length) {
      costKnown = false;
      continue;
    }
    costFen += usable.reduce((s, p) => s + Math.max(0, Number(p.amountFen) || 0), 0);
  }

  const aging = agingUnpaidFen(agingRows, opts?.now);
  const costMissing = hasSale && !costKnown;
  return {
    salesFen,
    costFen: hasSale && costKnown ? costFen : null,
    costMissing: hasSale ? costMissing : false,
    remittance: {
      ...counts,
      unpaidFen,
      over60Fen: aging.over60Fen,
      over90Fen: aging.over90Fen,
      deduction: opts?.deduction ?? 'none',
    },
    sinosure,
    lowLimitReason: opts?.lowLimitReason ?? null,
  };
}

/** 用 N9 水单/到账算出已收汇，供评估与占用共用，禁止用 N3 是否收汇缓存。 */
export function n9ReceivedFen(settlement: SettlementLedgerInput, amountFen: number): number {
  return receivedFenOf(settlement, amountFen);
}
