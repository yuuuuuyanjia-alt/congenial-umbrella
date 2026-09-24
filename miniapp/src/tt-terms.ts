/** 销售合同上的前/后 T/T 条款。收汇页只展示，约定仍在 N3 修改。 */

export type TtVoucher = { ref: string; fileName?: string | null };

export type TtTermsInput = {
  ttTiming?: string | null;
  paymentTerms?: string | null;
  ttPercentBps?: number | null;
  ttAdvanceFen?: number | null;
  ttDaysAfterShipment?: number | null;
  currency?: string | null;
  amountFen?: number | null;
};

export function ttTimingOf(input?: TtTermsInput | null): 'ADVANCE' | 'AFTER' | '' {
  const raw = String(input?.ttTiming || '').trim().toUpperCase();
  if (raw === 'ADVANCE' || raw === 'AFTER') return raw;
  const terms = String(input?.paymentTerms || '');
  if (/前\s*T\s*\/\s*T|in\s*advance|预付/i.test(terms)) return 'ADVANCE';
  if (/后\s*T\s*\/\s*T|after\s*shipment|装运后/i.test(terms)) return 'AFTER';
  return '';
}

export function isAdvanceTt(input?: TtTermsInput | null) {
  return ttTimingOf(input) === 'ADVANCE';
}

function moneyFen(fen: number | null | undefined, currency: string) {
  if (fen == null || !Number.isFinite(Number(fen))) return '';
  return `${currency} ${(Number(fen) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 收汇页页头：前/后 T/T 摘要，只读。 */
export function ttTermsSummary(input?: TtTermsInput | null): string {
  const timing = ttTimingOf(input);
  const currency = input?.currency || 'USD';
  if (timing === 'ADVANCE') {
    const pct = input?.ttPercentBps != null ? `${Math.round(Number(input.ttPercentBps) / 100)}%` : '未填比例';
    const agreed = Number(input?.ttAdvanceFen);
    const fromPercent =
      !(agreed > 0) && input?.ttPercentBps != null && input?.amountFen != null
        ? Math.round((Number(input.amountFen) * Number(input.ttPercentBps)) / 10_000)
        : null;
    const fen = agreed > 0 ? agreed : fromPercent;
    const amt = fen != null && fen > 0 ? moneyFen(fen, currency) : '未填约定金额';
    return `前 T/T · 约定比例 ${pct} · 约定金额 ${amt}`;
  }
  if (timing === 'AFTER') {
    const days = Number(input?.ttDaysAfterShipment);
    const dayText = Number.isFinite(days) && days > 0 ? `${Math.round(days)} 天` : '未填天数';
    return `后 T/T · 到达目的港后付款天数 ${dayText}`;
  }
  const terms = String(input?.paymentTerms || '').trim();
  return terms ? `结算方式 ${terms}` : '未登记前/后 T/T';
}

/**
 * 合同前收汇只提交凭证。比例、约定金额等条款留在 N3，本请求不携带。
 * 结算方式不是前 T/T 时返回 null。
 */
export function buildAdvanceVoucherSave(
  row: { contract?: TtTermsInput | null } | null,
  vouchers: TtVoucher[],
): { ttVouchers: TtVoucher[] } | null {
  if (!row?.contract || !isAdvanceTt(row.contract)) return null;
  return { ttVouchers: vouchers || [] };
}
