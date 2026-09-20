import { CaseStatus, N6_MISSING_TRANSPORT_FALLBACK, NODE_FLOW, NodeCode, NodeStatus } from '../common/constants';
import {
  isBuyerArrangedFreight,
  isCifFamilyIncoterms,
  isSettlementOnlyIncoterms,
  parseIncotermsCode,
} from '../gates/gate.engine';
import {
  isSettlementPaid,
  receivedFenOf,
  type SettlementLedgerInput,
} from '../customers/sinosure-exposure';

export { isBuyerArrangedFreight, isCifFamilyIncoterms };

/** 运输术语（Incoterms）。T/T 不是运输术语。 */
export const TRADE_TERM = {
  FOB: 'FOB',
  CIF: 'CIF',
} as const;

export type TradeTerm = (typeof TRADE_TERM)[keyof typeof TRADE_TERM];

export const TRADE_TERM_OPTIONS: TradeTerm[] = [TRADE_TERM.FOB, TRADE_TERM.CIF];

export const TT_TIMING = {
  ADVANCE: 'ADVANCE',
  AFTER: 'AFTER',
} as const;

export type TtTiming = (typeof TT_TIMING)[keyof typeof TT_TIMING];

export const TtTimingLabel: Record<TtTiming, string> = {
  ADVANCE: '前 T/T',
  AFTER: '后 T/T',
};

/** CIP 归 CIF 族展示；EXW/FAS/FCA 归 FOB 族。T/T 不从 incoterms 解析。 */
export function resolveTradeTerm(raw?: string | null): TradeTerm | null {
  const code = parseIncotermsCode(raw);
  if (code === 'CIF' || code === 'CIP') return TRADE_TERM.CIF;
  if (code === 'FOB' || code === 'EXW' || code === 'FAS' || code === 'FCA') return TRADE_TERM.FOB;
  return null;
}

export function resolveTtTiming(input: {
  ttTiming?: string | null;
  paymentTerms?: string | null;
  incoterms?: string | null;
  contract?: { ttTiming?: string | null; paymentTerms?: string | null; incoterms?: string | null } | null;
}): TtTiming | null {
  const raw = String(input.ttTiming || input.contract?.ttTiming || '').trim().toUpperCase();
  if (raw === TT_TIMING.ADVANCE || raw === '前' || raw === '前T/T') return TT_TIMING.ADVANCE;
  if (raw === TT_TIMING.AFTER || raw === '后' || raw === '后T/T') return TT_TIMING.AFTER;
  const terms = String(input.paymentTerms || input.contract?.paymentTerms || '');
  if (/前\s*T\s*\/\s*T|in\s*advance|预付/i.test(terms)) return TT_TIMING.ADVANCE;
  if (/后\s*T\s*\/\s*T|after\s*shipment|装运后/i.test(terms)) return TT_TIMING.AFTER;
  if (isSettlementOnlyIncoterms(input.incoterms || input.contract?.incoterms)) return TT_TIMING.ADVANCE;
  return null;
}

/** 是否电汇结算（前/后 T/T）。与运输术语独立。 */
export function isTtSettlement(input: {
  ttTiming?: string | null;
  paymentTerms?: string | null;
  incoterms?: string | null;
}): boolean {
  return !!resolveTtTiming(input);
}

/**
 * 保存时规范化运输术语：T/T 等结算原文不得写入 incoterms，回退为 FOB。
 */
export function normalizeTransportIncoterms(raw?: string | null): string | undefined {
  const s = String(raw || '').trim();
  if (parseIncotermsCode(s)) return s;
  if (isSettlementOnlyIncoterms(s)) return N6_MISSING_TRANSPORT_FALLBACK;
  return s || undefined;
}

export function composeTtPaymentTerms(timing?: string | null, daysAfterShipment?: number | null): string {
  if (timing === TT_TIMING.ADVANCE) return '前 T/T';
  if (timing === TT_TIMING.AFTER) {
    const days = Number(daysAfterShipment);
    return Number.isFinite(days) && days > 0 ? `后 T/T ${Math.round(days)} days` : '后 T/T';
  }
  return 'T/T';
}

/** 付款条件是否仍是电汇文案（切换走后应清空，避免脏数据回填前/后 T/T）。 */
export function isTtPaymentTermsText(raw?: string | null): boolean {
  return /T\s*\/\s*T|电汇/i.test(String(raw || ''));
}

/** 显式取消结算方式：null / 空串不得再从 paymentTerms 推断前/后 T/T。省略字段则仍可推断。 */
export function resolveTtTimingForSave(input: {
  ttTiming?: string | null;
  paymentTerms?: string | null;
  incoterms?: string | null;
}): TtTiming | null {
  if (input.ttTiming === null || input.ttTiming === '') return null;
  return resolveTtTiming(input);
}

export type SalesContractModeFields = {
  incoterms?: string | null;
  ttTiming?: string | null;
  paymentTerms?: string | null;
  shipmentPort?: string | null;
  shipmentDate?: Date | string | null;
  etaDate?: Date | string | null;
  arrivalPort?: string | null;
  domesticPortArrivalAt?: Date | string | null;
  ttPercentBps?: number | null;
  ttAdvanceFen?: number | null;
  ttDaysAfterShipment?: number | null;
};

function blankToNull(v?: string | null): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function keepValue<T>(applies: boolean, value: T | null | undefined): T | null {
  if (!applies) return null;
  if (value == null || value === ('' as unknown)) return null;
  return value;
}

function keepNumber(applies: boolean, value: number | null | undefined): number | null {
  if (!applies) return null;
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return null;
  return value;
}

/**
 * 按当前运输术语 / 电汇时点丢掉上一选项专属字段，避免 CIF↔FOB、前/后 T/T 脏数据串台。
 * 装运日期：CIF 装运块或非 CIF 的电汇节点仍适用则保留。金额、提货、收汇不在此处理。
 */
export function sanitizeSalesContractModeFields<T extends SalesContractModeFields>(input: T): T & {
  incoterms: string | null;
  ttTiming: TtTiming | null;
  paymentTerms: string | null;
  shipmentPort: string | null;
  shipmentDate: Date | string | null;
  etaDate: Date | string | null;
  arrivalPort: string | null;
  domesticPortArrivalAt: Date | string | null;
  ttPercentBps: number | null;
  ttAdvanceFen: number | null;
  ttDaysAfterShipment: number | null;
} {
  const incoterms = blankToNull(normalizeTransportIncoterms(input.incoterms) || input.incoterms);
  const parsedTerm = resolveTradeTerm(incoterms);
  const ttTiming = resolveTtTimingForSave({
    ttTiming: input.ttTiming,
    paymentTerms: input.paymentTerms,
    incoterms,
  });
  const tradeTerm = parsedTerm || (ttTiming ? TRADE_TERM.FOB : parsedTerm);
  const cif = tradeTerm === TRADE_TERM.CIF;
  const fob = tradeTerm === TRADE_TERM.FOB;
  const shipmentDateApplies = cif || !!ttTiming;
  const paymentTerms = ttTiming
    ? composeTtPaymentTerms(ttTiming, ttTiming === TT_TIMING.AFTER ? input.ttDaysAfterShipment : null)
    : isTtPaymentTermsText(input.paymentTerms)
      ? null
      : blankToNull(input.paymentTerms);
  return {
    ...input,
    incoterms,
    ttTiming,
    paymentTerms,
    shipmentPort: cif ? blankToNull(input.shipmentPort) : null,
    shipmentDate: keepValue(shipmentDateApplies, input.shipmentDate),
    etaDate: keepValue(cif, input.etaDate),
    arrivalPort: cif ? blankToNull(input.arrivalPort) : null,
    domesticPortArrivalAt: keepValue(fob, input.domesticPortArrivalAt),
    ttPercentBps: keepNumber(ttTiming === TT_TIMING.ADVANCE, input.ttPercentBps),
    ttAdvanceFen: keepNumber(ttTiming === TT_TIMING.ADVANCE, input.ttAdvanceFen),
    ttDaysAfterShipment: keepNumber(ttTiming === TT_TIMING.AFTER, input.ttDaysAfterShipment),
  };
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
  transportFallbackApplied: boolean;
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
      transportFallbackApplied: boolean;
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
      transportFallbackApplied: boolean;
    })
  | null {
  if (!row) return null;
  const amountFen = Math.max(0, Number(row.amountFen) || 0);
  const remittedFen = receivedFenOf(settlement, amountFen);
  const hasRemittance = !!(settlement && (settlement.receivedAt || settlement.hasRemittanceMemo));
  const parsedTerm = resolveTradeTerm(row.incoterms);
  const ttTiming = resolveTtTiming(row);
  const ttVisible = !!ttTiming;
  const transportFallbackApplied = !parsedTerm && ttVisible;
  const tradeTerm = parsedTerm || (transportFallbackApplied ? TRADE_TERM.FOB : null);
  return {
    ...row,
    hasRemittance,
    remittedFen,
    unpaidFen: unpaidRemittanceFen(amountFen, remittedFen),
    tradeTerm,
    ttTiming,
    cifShippingVisible: tradeTerm === TRADE_TERM.CIF,
    fobDomesticVisible: tradeTerm === TRADE_TERM.FOB,
    ttVisible,
    ttAdvanceFen: resolveTtAdvanceFen(row),
    transportFallbackApplied,
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
