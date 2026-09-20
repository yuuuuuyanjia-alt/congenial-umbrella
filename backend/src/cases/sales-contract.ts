import { CaseStatus, NODE_FLOW, NodeCode, NodeStatus } from '../common/constants';
import { isCifFamilyIncoterms } from '../gates/gate.engine';

export { isCifFamilyIncoterms };

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
  customerPickedUp?: boolean | null;
  hasRemittance?: boolean | null;
  remittedFen?: number | null;
  amountFen?: number | null;
  unpaidFen?: number | null;
  contract?: {
    shipmentDate?: Date | string | null;
    customerPickedUp?: boolean | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
    amountFen?: number | null;
    unpaidFen?: number | null;
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
>(row: T): T & { remittedFen: number; unpaidFen: number; cifShippingVisible: boolean };
export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
  },
>(
  row: T | null | undefined,
): (T & { remittedFen: number; unpaidFen: number; cifShippingVisible: boolean }) | null;
export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
  },
>(
  row: T | null | undefined,
): (T & { remittedFen: number; unpaidFen: number; cifShippingVisible: boolean }) | null {
  if (!row) return null;
  const remittedFen = resolveRemittedFen(row);
  return {
    ...row,
    remittedFen,
    unpaidFen: unpaidRemittanceFen(row.amountFen, remittedFen),
    cifShippingVisible: isCifFamilyIncoterms(row.incoterms),
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

/** 已回款：是否收汇为是，且未收汇金额为 0。 */
export function isSalesRemittanceComplete(input: SalesShipmentInput): boolean {
  const ct = contractOf(input);
  const hasRemittance = input.hasRemittance ?? ct?.hasRemittance;
  const amountFen = input.amountFen ?? ct?.amountFen;
  const remittedFen = resolveRemittedFen({
    hasRemittance,
    remittedFen: input.remittedFen ?? ct?.remittedFen,
  });
  const unpaid =
    input.unpaidFen != null && Number.isFinite(Number(input.unpaidFen))
      ? Math.max(0, Number(input.unpaidFen))
      : unpaidRemittanceFen(amountFen, remittedFen);
  return !!hasRemittance && unpaid === 0;
}

export function isSalesPickedUp(input: SalesShipmentInput): boolean {
  return (input.customerPickedUp ?? contractOf(input)?.customerPickedUp) === true;
}

/**
 * 已出运：CIF/CIP 以装运日期为准；任意术语若已填装运日期亦计。
 * 非 CIF（如 FOB）无装运日期时，以 N6 已通过、已过装运节点、提单号或无提单路径为依据。
 */
export function isSalesShipped(input: SalesShipmentInput): boolean {
  const ct = contractOf(input);
  if (filledDate(input.shipmentDate ?? ct?.shipmentDate ?? null)) return true;
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
