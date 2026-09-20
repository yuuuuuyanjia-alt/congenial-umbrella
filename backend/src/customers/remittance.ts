/** 约定日对照：收汇/收款、交货、货款。纯函数，供 API / 种子 / 单测共用。 */

export const RemittanceStatus = {
  ON_TIME: 'ON_TIME',
  OVERDUE: 'OVERDUE',
  NOT_DUE: 'NOT_DUE',
  NO_RECORD: 'NO_RECORD',
} as const;

export type RemittanceStatusCode = (typeof RemittanceStatus)[keyof typeof RemittanceStatus];

export type ScheduleKind = 'remittance' | 'collection' | 'delivery' | 'payment';

export const RemittanceStatusLabel: Record<RemittanceStatusCode, string> = {
  ON_TIME: '按期',
  OVERDUE: '逾期',
  NOT_DUE: '未到期',
  NO_RECORD: '无收汇记录',
};

const KIND_NO_RECORD: Record<ScheduleKind, string> = {
  remittance: '无收汇记录',
  collection: '无收款约定',
  delivery: '无交货记录',
  payment: '无付款约定',
};

const KIND_NOTES: Record<
  ScheduleKind,
  {
    onTimeNoDue: string;
    onTime: string;
    overdueOccurred: string;
    notDue: string;
    overdueUnoccurred: string;
    noRecord: string;
  }
> = {
  remittance: {
    onTimeNoDue: '已收汇，合同未登记到期日，按已到账视为按期',
    onTime: '到账日不晚于约定到期日',
    overdueOccurred: '到账日晚于约定到期日',
    notDue: '尚未到账，约定到期日未过',
    overdueUnoccurred: '约定到期日已过且尚未到账',
    noRecord: '无收汇到账记录，也无约定到期日（合同账期不足时无法推算）',
  },
  collection: {
    onTimeNoDue: '货款已收齐，未登记约定收款日，视为按期',
    onTime: '收齐日不晚于约定收款日',
    overdueOccurred: '收齐日晚于约定收款日',
    notDue: '尚有未收汇，约定收款日未过',
    overdueUnoccurred: '约定收款日已过且尚未收齐',
    noRecord: '无合同金额与约定收款日',
  },
  delivery: {
    onTimeNoDue: '已交付，未登记供应商实际交付日期，视为按期',
    onTime: '实际交付日期不晚于供应商实际交付日期（或关联销售合同交货期）',
    overdueOccurred: '实际交付日期晚于供应商实际交付日期/关联销售合同交货期',
    notDue: '尚未交付，供应商实际交付日期未过',
    overdueUnoccurred: '供应商实际交付日期已过且尚未交付',
    noRecord: '无供应商实际交付日期，也无实际交付记录',
  },
  payment: {
    onTimeNoDue: '货款已付清，未登记约定付款日，视为按期',
    onTime: '付清日不晚于约定付款日',
    overdueOccurred: '付清日晚于约定付款日',
    notDue: '尚有未付款，约定付款日未过',
    overdueUnoccurred: '约定付款日已过且货款未付清',
    noRecord: '无采购金额与约定付款日',
  },
};

export interface RemittanceEval {
  code: RemittanceStatusCode;
  label: string;
  settledOnTime: boolean | null;
  paymentDueAt: string | null;
  receivedAt: string | null;
  note: string;
}

export interface RemittanceSummary {
  code: RemittanceStatusCode;
  label: string;
  settledOnTime: boolean | null;
  counts: {
    onTime: number;
    overdue: number;
    notDue: number;
    noRecord: number;
  };
}

function toDate(v?: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 从付款条件解析账期天数：T/T 30 days、OA 60天、Net 15 等 */
export function parsePaymentTermDays(terms?: string | null): number | null {
  if (!terms) return null;
  const m = terms.match(/(\d+)\s*(?:days?|天)/i);
  return m ? Number(m[1]) : null;
}

/** 交货期 + 付款条件账期 → 约定收汇到期日（UTC 日历日） */
export function derivePaymentDueAt(
  deliveryDate?: Date | string | null,
  paymentTerms?: string | null,
): Date | null {
  const delivery = toDate(deliveryDate);
  if (!delivery) return null;
  const days = parsePaymentTermDays(paymentTerms);
  if (days == null) return null;
  const due = new Date(Date.UTC(delivery.getUTCFullYear(), delivery.getUTCMonth(), delivery.getUTCDate()));
  due.setUTCDate(due.getUTCDate() + days);
  return due;
}

export function evaluateSchedule(input: {
  kind?: ScheduleKind;
  dueAt?: Date | string | null;
  occurredAt?: Date | string | null;
  remainingFen?: number | null;
  now?: Date | string;
}): RemittanceEval {
  const kind: ScheduleKind = input.kind ?? 'remittance';
  const notes = KIND_NOTES[kind];
  const noRecordLabel = KIND_NO_RECORD[kind];
  const remaining = input.remainingFen;
  const due = toDate(input.dueAt);
  let occurred = toDate(input.occurredAt);
  const now = toDate(input.now) ?? new Date();

  if (remaining != null && remaining > 0) {
    occurred = null;
  } else if (remaining != null && remaining <= 0 && !occurred) {
    occurred = due ?? now;
  }

  const paymentDueAt = due ? ymd(due) : null;
  const receivedAt = occurred ? ymd(occurred) : null;

  if (occurred) {
    if (!due) {
      return {
        code: RemittanceStatus.ON_TIME,
        label: RemittanceStatusLabel.ON_TIME,
        settledOnTime: true,
        paymentDueAt,
        receivedAt,
        note: notes.onTimeNoDue,
      };
    }
    const onTime = ymd(occurred) <= ymd(due);
    return {
      code: onTime ? RemittanceStatus.ON_TIME : RemittanceStatus.OVERDUE,
      label: onTime ? RemittanceStatusLabel.ON_TIME : RemittanceStatusLabel.OVERDUE,
      settledOnTime: onTime,
      paymentDueAt,
      receivedAt,
      note: onTime ? notes.onTime : notes.overdueOccurred,
    };
  }

  if (due) {
    const notDue = ymd(now) <= ymd(due);
    return {
      code: notDue ? RemittanceStatus.NOT_DUE : RemittanceStatus.OVERDUE,
      label: notDue ? RemittanceStatusLabel.NOT_DUE : RemittanceStatusLabel.OVERDUE,
      settledOnTime: notDue ? null : false,
      paymentDueAt,
      receivedAt,
      note: notDue ? notes.notDue : notes.overdueUnoccurred,
    };
  }

  return {
    code: RemittanceStatus.NO_RECORD,
    label: noRecordLabel,
    settledOnTime: null,
    paymentDueAt,
    receivedAt,
    note: notes.noRecord,
  };
}

export function evaluateRemittance(input: {
  paymentDueAt?: Date | string | null;
  receivedAt?: Date | string | null;
  remainingFen?: number | null;
  now?: Date | string;
  kind?: ScheduleKind;
}): RemittanceEval {
  return evaluateSchedule({
    kind: input.kind ?? 'remittance',
    dueAt: input.paymentDueAt,
    occurredAt: input.receivedAt,
    remainingFen: input.remainingFen,
    now: input.now,
  });
}

export function summarizeRemittance(
  items: Array<{ code: RemittanceStatusCode }>,
  noRecordLabel = '无记录',
): RemittanceSummary {
  const counts = { onTime: 0, overdue: 0, notDue: 0, noRecord: 0 };
  for (const item of items) {
    if (item.code === RemittanceStatus.ON_TIME) counts.onTime += 1;
    else if (item.code === RemittanceStatus.OVERDUE) counts.overdue += 1;
    else if (item.code === RemittanceStatus.NOT_DUE) counts.notDue += 1;
    else counts.noRecord += 1;
  }
  let code: RemittanceStatusCode = RemittanceStatus.NO_RECORD;
  if (counts.overdue) code = RemittanceStatus.OVERDUE;
  else if (counts.onTime) code = RemittanceStatus.ON_TIME;
  else if (counts.notDue) code = RemittanceStatus.NOT_DUE;
  return {
    code,
    label: code === RemittanceStatus.NO_RECORD ? noRecordLabel : RemittanceStatusLabel[code],
    settledOnTime: counts.overdue ? false : counts.onTime ? true : null,
    counts,
  };
}

export function moneyBuckets(
  rows: Array<{ currency?: string | null; amountFen?: number | null; receivedOrPaidFen?: number | null }>,
) {
  const map = new Map<string, { currency: string; amountFen: number; settledFen: number; openFen: number }>();
  for (const row of rows) {
    const currency = row.currency || 'USD';
    const amount = Math.max(0, Number(row.amountFen) || 0);
    const settled = Math.max(0, Number(row.receivedOrPaidFen) || 0);
    if (!amount && !settled) continue;
    const cur = map.get(currency) ?? { currency, amountFen: 0, settledFen: 0, openFen: 0 };
    cur.amountFen += amount;
    cur.settledFen += Math.min(settled, amount || settled);
    cur.openFen += Math.max(0, amount - settled);
    map.set(currency, cur);
  }
  return [...map.values()];
}
