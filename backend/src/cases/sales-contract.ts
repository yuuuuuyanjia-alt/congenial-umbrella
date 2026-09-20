import { CaseStatus, NODE_FLOW, NodeCode, NodeStatus } from '../common/constants';
import { isBuyerArrangedFreight, isCifFamilyIncoterms } from '../gates/gate.engine';
import {
  isSettlementPaid,
  receivedFenOf,
  type SettlementLedgerInput,
} from '../customers/sinosure-exposure';

export { isBuyerArrangedFreight, isCifFamilyIncoterms };

export const TRADE_TERM = {
  FOB: 'FOB',
  CIF: 'CIF',
  TT: 'T/T',
} as const;

export type TradeTerm = (typeof TRADE_TERM)[keyof typeof TRADE_TERM];

export const TRADE_TERM_OPTIONS: TradeTerm[] = [TRADE_TERM.FOB, TRADE_TERM.CIF, TRADE_TERM.TT];

export const TT_TIMING = {
  ADVANCE: 'ADVANCE',
  AFTER: 'AFTER',
} as const;

export type TtTiming = (typeof TT_TIMING)[keyof typeof TT_TIMING];

export const TtTimingLabel: Record<TtTiming, string> = {
  ADVANCE: '前 T/T',
  AFTER: '后 T/T',
};

/** FOB / CIF / T/T 三选一。CIP 归 CIF；EXW/FAS/FCA 归 FOB。T/T 不是独立结算方式。 */
export function resolveTradeTerm(raw?: string | null): TradeTerm | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/t\s*\/\s*t/i.test(s) || /^tt(?:\b|\s|$)/i.test(s)) return TRADE_TERM.TT;
  const code = s
    .toUpperCase()
    .replace(/^INCOTERMS(?:\s*20\d{2})?\s+/i, '')
    .split(/[\s,;:：-]+/)[0]
    .replace(/\/.*$/, '');
  if (code === 'CIF' || code === 'CIP') return TRADE_TERM.CIF;
  if (code === 'FOB' || code === 'EXW' || code === 'FAS' || code === 'FCA') return TRADE_TERM.FOB;
  return null;
}

export function resolveTtTiming(input: {
  ttTiming?: string | null;
  paymentTerms?: string | null;
  contract?: { ttTiming?: string | null; paymentTerms?: string | null } | null;
}): TtTiming | null {
  const raw = String(input.ttTiming || input.contract?.ttTiming || '').trim().toUpperCase();
  if (raw === TT_TIMING.ADVANCE || raw === '前' || raw === '前T/T') return TT_TIMING.ADVANCE;
  if (raw === TT_TIMING.AFTER || raw === '后' || raw === '后T/T') return TT_TIMING.AFTER;
  const terms = String(input.paymentTerms || input.contract?.paymentTerms || '');
  if (/前\s*T\s*\/\s*T|in\s*advance|预付/i.test(terms)) return TT_TIMING.ADVANCE;
  if (/后\s*T\s*\/\s*T|after\s*shipment|装运后/i.test(terms)) return TT_TIMING.AFTER;
  return null;
}

export function composeTtPaymentTerms(timing?: string | null, daysAfterShipment?: number | null): string {
  if (timing === TT_TIMING.ADVANCE) return '前 T/T';
  if (timing === TT_TIMING.AFTER) {
    const days = Number(daysAfterShipment);
    return Number.isFinite(days) && days > 0 ? `后 T/T ${Math.round(days)} days` : '后 T/T';
  }
  return 'T/T';
}

export function resolveTtAdvanceFen(input: {
  ttAdvanceFen?: number | null;
  ttPercentBps?: number | null;
  amountFen?: number | null;
}): number {
  const explicit = Number(input.ttAdvanceFen);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const bps = Math.max(0, Number(input.ttPercentBps) || 0);
  const amount = Math.max(0, Number(input.amountFen) || 0);
  return Math.round((amount * bps) / 10_000);
}

/** 销售合同列表出运/履约分组（中文标签固定）。 */
export const SALES_SHIPMENT_BUCKET = {
  UNSHIPPED: 'unshipped',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
} as const;

export type SalesShipmentBucket = (typeof SALES_SHIPMENT_BUCKET)[keyof typeof SALES_SHIPMENT_BUCKET];

export const SALES_SHIPMENT_BUCKET_ORDER: SalesShipmentBucket[] = [
  SALES_SHIPMENT_BUCKET.UNSHIPPED,
  SALES_SHIPMENT_BUCKET.SHIPPED,
  SALES_SHIPMENT_BUCKET.COMPLETED,
];

export const SalesShipmentBucketLabel: Record<SalesShipmentBucket, string> = {
  unshipped: '未出运',
  shipped: '已出运',
  completed: '已完成',
};

export type SalesShipmentInput = {
  status?: string | null;
  currentNode?: string | null;
  nodes?: Array<{ code: string; status: string }> | null;
  shipmentDate?: Date | string | null;
  domesticPortArrivalAt?: Date | string | null;
  customerPickedUp?: boolean | null;
  amountFen?: number | null;
  /** N9 收汇对账。已回款只认此账本，不认 N3 hasRemittance / remittedFen。 */
  settlement?: SettlementLedgerInput;
  contract?: {
    shipmentDate?: Date | string | null;
    domesticPortArrivalAt?: Date | string | null;
    customerPickedUp?: boolean | null;
    amountFen?: number | null;
  } | null;
  shipment?: {
    blNo?: string | null;
    blControl?: string | null;
    noBlRef?: string | null;
    noBlReason?: string | null;
    noBlEvidenceStub?: string | null;
  } | null;
};

export function resolveRemittedFen(input: {
  hasRemittance?: boolean | null;
  remittedFen?: number | null;
}): number {
  if (!input.hasRemittance) return 0;
  const n = Number(input.remittedFen);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** 未收汇金额（分）= 合同总额 − 收汇金额，不小于 0。 */
export function unpaidRemittanceFen(amountFen?: number | null, remittedFen?: number | null): number {
  const amount = Math.max(0, Number(amountFen) || 0);
  const remitted = Math.max(0, Number(remittedFen) || 0);
  return Math.max(0, amount - remitted);
}

export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
  },
>(
  row: T,
  settlement?: SettlementLedgerInput,
): T & {
  remittedFen: number;
  unpaidFen: number;
  hasRemittance: boolean;
  cifShippingVisible: boolean;
  fobDomesticVisible: boolean;
  ttVisible: boolean;
  tradeTerm: TradeTerm | null;
  ttTiming: TtTiming | null;
  ttAdvanceFen: number;
};
export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
    ttTiming?: string | null;
    paymentTerms?: string | null;
    ttPercentBps?: number | null;
    ttAdvanceFen?: number | null;
  },
>(
  row: T | null | undefined,
  settlement?: SettlementLedgerInput,
):
  | (T & {
      remittedFen: number;
      unpaidFen: number;
      hasRemittance: boolean;
      cifShippingVisible: boolean;
      fobDomesticVisible: boolean;
      ttVisible: boolean;
      tradeTerm: TradeTerm | null;
      ttTiming: TtTiming | null;
      ttAdvanceFen: number;
    })
  | null;
export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
    ttTiming?: string | null;
    paymentTerms?: string | null;
    ttPercentBps?: number | null;
    ttAdvanceFen?: number | null;
  },
>(
  row: T | null | undefined,
  settlement?: SettlementLedgerInput,
):
  | (T & {
      remittedFen: number;
      unpaidFen: number;
      hasRemittance: boolean;
      cifShippingVisible: boolean;
      fobDomesticVisible: boolean;
      ttVisible: boolean;
      tradeTerm: TradeTerm | null;
      ttTiming: TtTiming | null;
      ttAdvanceFen: number;
    })
  | null {
  if (!row) return null;
  const amountFen = Math.max(0, Number(row.amountFen) || 0);
  const remittedFen = receivedFenOf(settlement, amountFen);
  const hasRemittance = !!(settlement && (settlement.receivedAt || settlement.hasRemittanceMemo));
  const tradeTerm = resolveTradeTerm(row.incoterms);
  const ttTiming = resolveTtTiming(row);
  return {
    ...row,
    hasRemittance,
    remittedFen,
    unpaidFen: unpaidRemittanceFen(amountFen, remittedFen),
    tradeTerm,
    ttTiming,
    cifShippingVisible: tradeTerm === TRADE_TERM.CIF,
    fobDomesticVisible: tradeTerm === TRADE_TERM.FOB,
    ttVisible: tradeTerm === TRADE_TERM.TT,
    ttAdvanceFen: resolveTtAdvanceFen(row),
  };
}

function filledText(v?: string | null): boolean {
  return !!String(v ?? '').trim();
}

function filledDate(v?: Date | string | null): boolean {
  if (v == null || v === '') return false;
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  const s = String(v).trim();
  if (!s) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t) || s.length >= 8;
}

function contractOf(input: SalesShipmentInput) {
  return input.contract || null;
}

/** 已回款：与中信保占用释放同一口径，只认 N9 水单/到账，且未收汇为 0。 */
export function isSalesRemittanceComplete(input: SalesShipmentInput): boolean {
  const amountFen = input.amountFen ?? contractOf(input)?.amountFen ?? 0;
  return isSettlementPaid(input.settlement, amountFen);
}

export function isSalesPickedUp(input: SalesShipmentInput): boolean {
  return (input.customerPickedUp ?? contractOf(input)?.customerPickedUp) === true;
}

/**
 * 已出运：CIF/CIP 以装运日期为准；FOB 等以国内段到达口岸/港口时间为国内交付完成。
 * 任意术语若已填上述日期亦计。否则以 N6 已通过、已过装运节点、提单号或无提单路径为依据。
 */
export function isSalesShipped(input: SalesShipmentInput): boolean {
  const ct = contractOf(input);
  if (filledDate(input.shipmentDate ?? ct?.shipmentDate ?? null)) return true;
  if (filledDate(input.domesticPortArrivalAt ?? ct?.domesticPortArrivalAt ?? null)) return true;
  if (String(input.status || '').toUpperCase() === CaseStatus.COMPLETED) return true;
  const n6 = (input.nodes || []).find((n) => n.code === 'N6');
  if (n6?.status === NodeStatus.PASSED) return true;
  const i = NODE_FLOW.indexOf((input.currentNode || '') as NodeCode);
  const n6i = NODE_FLOW.indexOf('N6');
  if (i > n6i) return true;
  const sh = input.shipment;
  if (filledText(sh?.blNo)) return true;
  const noBl = String(sh?.blControl || '').toUpperCase();
  if (
    (noBl === 'NO_BL' || noBl === 'FOB_NO_BL') &&
    (filledText(sh?.noBlRef) || filledText(sh?.noBlReason) || filledText(sh?.noBlEvidenceStub))
  ) {
    return true;
  }
  return false;
}

export function salesShipmentBucketOf(input: SalesShipmentInput): SalesShipmentBucket {
  if (!isSalesShipped(input)) return SALES_SHIPMENT_BUCKET.UNSHIPPED;
  if (isSalesPickedUp(input) && isSalesRemittanceComplete(input)) return SALES_SHIPMENT_BUCKET.COMPLETED;
  return SALES_SHIPMENT_BUCKET.SHIPPED;
}

export function presentSalesShipmentStatus(input: SalesShipmentInput) {
  const shipmentBucket = salesShipmentBucketOf(input);
  return {
    shipped: isSalesShipped(input),
    pickedUp: isSalesPickedUp(input),
    remittanceComplete: isSalesRemittanceComplete(input),
    shipmentBucket,
    shipmentBucketLabel: SalesShipmentBucketLabel[shipmentBucket],
  };
}

export function groupSalesByShipmentBucket<T extends SalesShipmentInput>(rows: T[]) {
  const bags: Record<SalesShipmentBucket, T[]> = {
    unshipped: [],
    shipped: [],
    completed: [],
  };
  for (const row of rows) {
    bags[salesShipmentBucketOf(row)].push(row);
  }
  return SALES_SHIPMENT_BUCKET_ORDER.map((key) => ({
    key,
    label: SalesShipmentBucketLabel[key],
    items: bags[key],
  }));
}
