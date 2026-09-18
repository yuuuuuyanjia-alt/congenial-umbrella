/** 采购货款分期：比例/金额解析与按期次逾期判断。纯函数，供 API / 种子 / 单测共用。 */

import {
  RemittanceStatus,
  evaluateRemittance,
  summarizeRemittance,
  type RemittanceEval,
  type RemittanceSummary,
} from '../customers/remittance';

export const PaymentMode = {
  FULL: 'FULL',
  STAGED: 'STAGED',
} as const;

export type PaymentModeCode = (typeof PaymentMode)[keyof typeof PaymentMode];

export const PaymentModeLabel: Record<PaymentModeCode, string> = {
  FULL: '一次性付清',
  STAGED: '分期支付',
};

export const InstallmentStatus = {
  PAID: 'PAID',
  ON_TIME: 'ON_TIME',
  OVERDUE: 'OVERDUE',
  NOT_DUE: 'NOT_DUE',
} as const;

export type InstallmentStatusCode = (typeof InstallmentStatus)[keyof typeof InstallmentStatus];

export const InstallmentStatusLabel: Record<InstallmentStatusCode, string> = {
  PAID: '已付清',
  ON_TIME: '按期',
  OVERDUE: '逾期',
  NOT_DUE: '未到期',
};

export interface ScheduleInstallmentInput {
  id?: string | null;
  seq?: number | null;
  label?: string | null;
  percent?: number | null;
  percentBps?: number | null;
  amountFen?: number | null;
  conditionText?: string | null;
  dueAt?: Date | string | null;
  paidFen?: number | null;
  paidAt?: Date | string | null;
}

export interface ResolvedInstallment {
  id?: string;
  seq: number;
  label: string;
  percentBps: number | null;
  amountFen: number;
  conditionText: string | null;
  dueAt: Date | string | null;
  paidFen: number;
  paidAt: Date | string | null;
}

export interface PresentedInstallment {
  id?: string;
  seq: number;
  label: string;
  percentBps: number | null;
  percent: number | null;
  amountFen: number;
  unpaidFen: number;
  conditionText: string | null;
  dueAt: string | null;
  paidFen: number;
  paidAt: string | null;
  status: InstallmentStatusCode;
  statusLabel: string;
  duePassed: boolean;
  timing: RemittanceEval;
  /** 约定付款时间：约定日期和/或触发时间 */
  agreedPaymentTime: string;
}

export interface PresentedPlanPayment {
  paymentMode: PaymentModeCode;
  paymentModeLabel: string;
  amountFen: number;
  paidFen: number;
  unpaidFen: number;
  paymentDueAt: string | null;
  paidAt: string | null;
  installments: PresentedInstallment[];
  wording: string | null;
  payment: RemittanceSummary;
}

function ymd(v?: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function toPercentBps(percent?: number | null, percentBps?: number | null): number | null {
  if (percentBps != null && Number.isFinite(Number(percentBps))) {
    return Math.max(0, Math.round(Number(percentBps)));
  }
  if (percent != null && Number.isFinite(Number(percent))) {
    return Math.max(0, Math.round(Number(percent) * 100));
  }
  return null;
}

export function bpsToPercent(percentBps?: number | null): number | null {
  if (percentBps == null || !Number.isFinite(Number(percentBps))) return null;
  return Number(percentBps) / 100;
}

export function formatPercent(percentBps?: number | null): string {
  const n = bpsToPercent(percentBps);
  if (n == null) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** 约定付款时间：约定日期、触发时间，或两者。 */
export function agreedPaymentTime(item: { dueAt?: Date | string | null; conditionText?: string | null }): string {
  const date = ymd(item.dueAt);
  const trigger = (item.conditionText || '').trim();
  if (date && trigger && trigger !== '一次性付清') return `${date}（${trigger}）`;
  if (date) return date;
  return trigger;
}

/** 分期支付每一期须填写：约定付款时间、付款比例、金额。 */
export function validateStagedInstallments(items?: ScheduleInstallmentInput[] | null): string[] {
  const rows = items || [];
  if (rows.length < 2) return ['分期支付至少两期，每一期须填写约定付款时间、付款比例、金额'];
  const reasons: string[] = [];
  rows.forEach((item, i) => {
    const n = i + 1;
    const bps = toPercentBps(item.percent, item.percentBps);
    const amount =
      item.amountFen != null && Number.isFinite(Number(item.amountFen)) ? Number(item.amountFen) : null;
    if (bps == null) reasons.push(`第${n}期须填写付款比例`);
    if (amount == null) reasons.push(`第${n}期须填写金额`);
    if (!item.dueAt && !(item.conditionText || '').trim()) {
      reasons.push(`第${n}期须填写约定付款时间（约定日期或触发时间）`);
    }
  });
  return reasons;
}

function defaultLabel(seq: number, total: number, paymentMode: PaymentModeCode): string {
  if (paymentMode === PaymentMode.FULL || total === 1) return '一次性付清';
  if (seq === 1) return '到货付款';
  if (seq === total) return '尾款';
  return `第${seq}期`;
}

/**
 * 解析各期应付金额。有比例且采购总额已知时按比例计算；
 * 最后一期在总额已知时取剩余尾款，避免分位舍入后对不齐。
 */
export function resolveSchedule(
  planAmountFen: number,
  items: ScheduleInstallmentInput[],
): ResolvedInstallment[] {
  const plan = Math.max(0, Math.round(Number(planAmountFen) || 0));
  const rows = (items || []).map((item, i) => ({
    ...item,
    seq: item.seq != null && Number.isFinite(Number(item.seq)) ? Number(item.seq) : i + 1,
  }));
  rows.sort((a, b) => a.seq - b.seq);
  const total = rows.length;
  const mode: PaymentModeCode = total > 1 ? PaymentMode.STAGED : PaymentMode.FULL;
  let allocated = 0;
  return rows.map((item, i) => {
    const isLast = i === total - 1;
    const percentBps = toPercentBps(item.percent, item.percentBps);
    const explicitAmount =
      item.amountFen != null && Number.isFinite(Number(item.amountFen)) ? Math.max(0, Math.round(Number(item.amountFen))) : null;
    let dueFen = 0;
    if (isLast && plan > 0) {
      dueFen = Math.max(0, plan - allocated);
    } else if (percentBps != null && plan > 0) {
      dueFen = Math.round((plan * percentBps) / 10000);
    } else if (explicitAmount != null) {
      dueFen = explicitAmount;
    } else {
      dueFen = 0;
    }
    allocated += dueFen;
    const derivedBps = percentBps != null ? percentBps : plan > 0 ? Math.round((dueFen * 10000) / plan) : null;
    const paidFen = Math.max(0, Math.round(Number(item.paidFen) || 0));
    return {
      id: item.id || undefined,
      seq: i + 1,
      label: (item.label || '').trim() || defaultLabel(i + 1, total, mode),
      percentBps: derivedBps,
      amountFen: dueFen,
      conditionText: item.conditionText?.trim() || (mode === PaymentMode.FULL ? '一次性付清' : null),
      dueAt: item.dueAt ?? null,
      paidFen,
      paidAt: item.paidAt ?? null,
    };
  });
}

export function evaluateInstallment(
  item: ResolvedInstallment,
  now?: Date | string,
): PresentedInstallment {
  const unpaidFen = Math.max(0, item.amountFen - item.paidFen);
  const timing = evaluateRemittance({
    kind: 'payment',
    paymentDueAt: item.dueAt,
    receivedAt: item.paidAt,
    remainingFen: item.amountFen || item.dueAt ? unpaidFen : null,
    now,
  });
  const settled = unpaidFen <= 0 && item.amountFen > 0;
  const dueYmd = ymd(item.dueAt);
  const nowYmd = ymd(now ?? new Date()) || '';
  const duePassed = !settled && !!dueYmd && nowYmd > dueYmd;
  let status: InstallmentStatusCode = InstallmentStatus.NOT_DUE;
  if (settled || (item.amountFen <= 0 && item.paidFen > 0)) {
    status = InstallmentStatus.PAID;
  } else if (timing.code === RemittanceStatus.OVERDUE || duePassed) {
    status = InstallmentStatus.OVERDUE;
  } else if (timing.code === RemittanceStatus.ON_TIME) {
    status = InstallmentStatus.ON_TIME;
  } else {
    status = InstallmentStatus.NOT_DUE;
  }
  return {
    id: item.id,
    seq: item.seq,
    label: item.label,
    percentBps: item.percentBps,
    percent: bpsToPercent(item.percentBps),
    amountFen: item.amountFen,
    unpaidFen,
    conditionText: item.conditionText,
    dueAt: dueYmd,
    paidFen: item.paidFen,
    paidAt: ymd(item.paidAt),
    status,
    statusLabel: InstallmentStatusLabel[status],
    duePassed,
    timing,
    agreedPaymentTime: agreedPaymentTime({ dueAt: item.dueAt, conditionText: item.conditionText }),
  };
}

export function scheduleWording(
  installments: Array<Pick<PresentedInstallment, 'percentBps' | 'amountFen' | 'conditionText'>>,
  currency = 'CNY',
): string | null {
  if (installments.length < 2) return null;
  const first = installments[0];
  const last = installments[installments.length - 1];
  const pct = formatPercent(first.percentBps);
  const residualYuan = (Number(last.amountFen) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const cond = last.conditionText?.trim() || '填写条件';
  return `货物到达交付地点之后支付（${pct || ' '}）%货款，剩余尾款（${currency} ${residualYuan}）于（${cond}）支付`;
}

export function inferPaymentMode(
  requested?: string | null,
  installmentCount = 0,
  existing?: string | null,
): PaymentModeCode {
  if (requested === PaymentMode.FULL || requested === PaymentMode.STAGED) return requested;
  if (installmentCount > 1) return PaymentMode.STAGED;
  if (existing === PaymentMode.FULL || existing === PaymentMode.STAGED) return existing;
  return PaymentMode.FULL;
}

export function synthesizeFullInstallment(input: {
  amountFen?: number | null;
  paymentDueAt?: Date | string | null;
  paidFen?: number | null;
  paidAt?: Date | string | null;
  conditionText?: string | null;
}): ScheduleInstallmentInput[] {
  const amountFen = input.amountFen ?? 0;
  const paidFen = input.paidFen ?? 0;
  if (!amountFen && !paidFen && !input.paymentDueAt) return [];
  return [
    {
      seq: 1,
      label: '一次性付清',
      percentBps: 10000,
      amountFen: amountFen || null,
      conditionText: input.conditionText?.trim() || '一次性付清',
      dueAt: input.paymentDueAt ?? null,
      paidFen,
      paidAt: input.paidAt ?? null,
    },
  ];
}

export function rollupPaymentFields(installments: ResolvedInstallment[]) {
  const paidFen = installments.reduce((s, i) => s + i.paidFen, 0);
  const unpaid = installments.filter((i) => i.paidFen < i.amountFen);
  const dueSource = unpaid.length ? unpaid : installments;
  const dueDates = dueSource.map((i) => ymd(i.dueAt)).filter((d): d is string => !!d).sort();
  const paidDates = installments.map((i) => ymd(i.paidAt)).filter((d): d is string => !!d).sort();
  const allSettled = installments.length > 0 && installments.every((i) => i.amountFen <= 0 || i.paidFen >= i.amountFen);
  return {
    paidFen,
    paymentDueAt: dueDates[0] ? new Date(`${dueDates[0]}T00:00:00.000Z`) : null,
    paidAt: allSettled ? (paidDates[paidDates.length - 1] ? new Date(`${paidDates[paidDates.length - 1]}T00:00:00.000Z`) : null) : paidDates[paidDates.length - 1] ? new Date(`${paidDates[paidDates.length - 1]}T00:00:00.000Z`) : null,
  };
}

export function presentPlanPayment(
  plan: {
    amountFen?: number | null;
    currency?: string | null;
    paidFen?: number | null;
    paymentDueAt?: Date | string | null;
    paidAt?: Date | string | null;
    paymentMode?: string | null;
    installments?: ScheduleInstallmentInput[] | null;
  } | null
    | undefined,
  now?: Date | string,
): PresentedPlanPayment {
  const amountFen = Math.max(0, Number(plan?.amountFen) || 0);
  const currency = plan?.currency || 'CNY';
  const raw =
    plan?.installments && plan.installments.length
      ? plan.installments
      : synthesizeFullInstallment({
          amountFen: plan?.amountFen,
          paymentDueAt: plan?.paymentDueAt,
          paidFen: plan?.paidFen,
          paidAt: plan?.paidAt,
        });
  const resolved = resolveSchedule(amountFen, raw);
  const installments = resolved.map((item) => evaluateInstallment(item, now));
  const paidFen = installments.reduce((s, i) => s + i.paidFen, 0);
  const unpaidFen = Math.max(0, amountFen - paidFen);
  const paymentMode = inferPaymentMode(plan?.paymentMode, installments.length);
  const rollup = rollupPaymentFields(resolved);
  return {
    paymentMode,
    paymentModeLabel: PaymentModeLabel[paymentMode],
    amountFen,
    paidFen,
    unpaidFen,
    paymentDueAt: ymd(rollup.paymentDueAt) ?? ymd(plan?.paymentDueAt),
    paidAt: ymd(rollup.paidAt) ?? ymd(plan?.paidAt),
    installments,
    wording: scheduleWording(installments, currency),
    payment: summarizeRemittance(
      installments.length ? installments.map((i) => i.timing) : [{ code: RemittanceStatus.NO_RECORD }],
      '无付款约定',
    ),
  };
}

export function buildInstallmentRecords(
  dto: {
    paymentMode?: string | null;
    paymentConditionText?: string | null;
    amountFen?: number | null;
    paidFen?: number | null;
    paymentDueAt?: Date | string | null;
    paidAt?: Date | string | null;
    installments?: ScheduleInstallmentInput[] | null;
  },
  existing?: {
    paymentMode?: string | null;
    amountFen?: number | null;
    paidFen?: number | null;
    paymentDueAt?: Date | string | null;
    paidAt?: Date | string | null;
    installments?: ScheduleInstallmentInput[] | null;
  } | null,
) {
  const amountFen = dto.amountFen ?? existing?.amountFen ?? 0;
  const paymentMode = inferPaymentMode(
    dto.paymentMode,
    dto.installments?.length ?? existing?.installments?.length ?? 0,
    existing?.paymentMode,
  );
  let raw: ScheduleInstallmentInput[];
  if (paymentMode === PaymentMode.FULL) {
    raw = synthesizeFullInstallment({
      amountFen,
      paymentDueAt: dto.paymentDueAt ?? existing?.paymentDueAt,
      paidFen: dto.paidFen ?? existing?.paidFen ?? 0,
      paidAt: dto.paidAt ?? existing?.paidAt,
      conditionText: dto.paymentConditionText,
    });
  } else if (dto.installments && dto.installments.length) {
    raw = dto.installments;
  } else if (existing?.installments?.length) {
    raw = existing.installments;
  } else {
    raw = synthesizeFullInstallment({
      amountFen,
      paymentDueAt: dto.paymentDueAt ?? existing?.paymentDueAt,
      paidFen: dto.paidFen ?? existing?.paidFen ?? 0,
      paidAt: dto.paidAt ?? existing?.paidAt,
      conditionText: dto.paymentConditionText,
    });
  }
  const resolved = resolveSchedule(amountFen ?? 0, raw);
  const mode = inferPaymentMode(paymentMode, resolved.length);
  const rollup = rollupPaymentFields(resolved);
  return { paymentMode: mode, resolved, rollup };
}
