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

export function percentInputFromBps(bps?: number | null) {
  if (bps == null || !Number.isFinite(Number(bps))) return '';
  return String(Math.round(Number(bps) / 100));
}

function yuanToFenOrNull(yuan: string) {
  const text = String(yuan || '').trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * 合同前收汇写回销售合同：只改前 T/T 比例、约定金额和凭证。
 * 其余条款从当前合同原样带回，避免部分保存清掉运输术语或后 T/T 天数。
 * 结算方式不是前 T/T 时返回 null，不在收汇页改条款。
 */
export function buildAdvanceReceiptSave(
  row: {
    customer?: string | null;
    goodsDesc?: string | null;
    goodsSpec?: string | null;
    amountFen?: number | null;
    currency?: string | null;
    parties?: Array<{ role?: string; name?: string | null }> | null;
    contract?: (TtTermsInput & {
      counterparty?: string | null;
      buyerName?: string | null;
      consigneeName?: string | null;
      goodsDesc?: string | null;
      goodsSpec?: string | null;
      incoterms?: string | null;
      quantity?: number | null;
      unit?: string | null;
      amountFen?: number | null;
      loadingPort?: string | null;
      shipmentDeadline?: string | null;
      deliveryMode?: string | null;
      directPort?: { warehouseLocation?: string | null; batchNo?: string | null } | null;
      ttVouchers?: TtVoucher[] | null;
    }) | null;
  } | null,
  draft: { percent: string; amountYuan: string; vouchers: TtVoucher[] },
): Record<string, unknown> | null {
  const ct = row?.contract;
  if (!ct || !isAdvanceTt(ct)) return null;
  const buyer = (row?.parties || []).find((p) => p.role === 'BUYER');
  const consignee = (row?.parties || []).find((p) => p.role === 'CONSIGNEE');
  const buyerName = buyer?.name || ct.buyerName || ct.counterparty || row?.customer || '';
  const percent = String(draft.percent || '').trim();
  const pctNum = Number(percent);
  return {
    counterparty: buyerName,
    buyerName,
    consigneeName: consignee?.name || ct.consigneeName || buyerName,
    goodsDesc: ct.goodsDesc || row?.goodsDesc || '',
    goodsSpec: ct.goodsSpec || row?.goodsSpec || '',
    incoterms: ct.incoterms || 'FOB',
    paymentTerms: ct.paymentTerms || null,
    ttTiming: 'ADVANCE',
    ttPercentBps: percent && Number.isFinite(pctNum) ? Math.round(pctNum * 100) : null,
    ttAdvanceFen: yuanToFenOrNull(draft.amountYuan),
    ttDaysAfterShipment: null,
    ttVouchers: draft.vouchers || [],
    quantity: ct.quantity ?? undefined,
    unit: ct.unit || undefined,
    amountFen: ct.amountFen ?? row?.amountFen,
    currency: ct.currency || row?.currency || 'USD',
    loadingPort: ct.loadingPort || null,
    shipmentDeadline: ct.shipmentDeadline || null,
    deliveryMode: ct.deliveryMode || null,
    directPort:
      ct.deliveryMode === 'DIRECT_PORT'
        ? {
            warehouseLocation: ct.directPort?.warehouseLocation || null,
            batchNo: ct.directPort?.batchNo || null,
          }
        : null,
  };
}
