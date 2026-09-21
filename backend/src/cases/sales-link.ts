import { CaseStatusLabel, NODE_CATALOG, NODE_FLOW, NodeCode, NodeStatus } from '../common/constants';

export type SalesLinkCaseInput = {
  id: string;
  caseNo: string;
  title: string;
  status: string;
  currentNode: string;
  goodsDesc: string;
  destination: string;
  amountFen: number;
  currency: string;
  contract?: {
    counterparty?: string | null;
    buyerName?: string | null;
    goodsDesc?: string | null;
    amountFen?: number | null;
    currency?: string | null;
    deliveryDate?: Date | string | null;
    deliveryMode?: string | null;
  } | null;
  parties?: Array<{ role: string; name: string }>;
  nodes?: Array<{ code: string; status: string }>;
};

export function formatYmd(v?: Date | string | null): string {
  if (!v) return '';
  return String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
}

/** 延期闸门对照用的关联销售合同交货期：优先当前销售合同，其次采购计划快照。 */
export function salesContractDeliveryOf(input: {
  salesLinkDelivery?: Date | string | null;
  planContractDelivery?: Date | string | null;
  caseContractDelivery?: Date | string | null;
}): string {
  return (
    formatYmd(input.salesLinkDelivery) ||
    formatYmd(input.planContractDelivery) ||
    formatYmd(input.caseContractDelivery)
  );
}

export type SalesLinkView = {
  id: string;
  caseNo: string;
  title: string;
  customer: string;
  contractNo: string;
  amountFen: number | null;
  currency: string;
  status: string;
  statusLabel: string;
  currentNode: string;
  currentNodeLabel: string;
  n3Status: string | null;
  signed: boolean;
  goodsDesc: string;
  destination: string;
  deliveryDate: Date | string | null;
  deliveryMode: string | null;
  deliveryModeLabel: string | null;
};

export function n3StatusOf(nodes?: Array<{ code: string; status: string }> | null): string | null {
  return nodes?.find((n) => n.code === 'N3')?.status ?? null;
}

/**
 * 销售合同是否已签订：须有销售合同记录，且 N3 已通过，或案件已推进到 N3 之后。
 * 仅到达 N3（进行中、尚无合同）不算已签。
 */
export function isSalesContractSigned(input: {
  currentNode?: string | null;
  n3Status?: string | null;
  hasContract?: boolean;
}): boolean {
  if (!input.hasContract) return false;
  if (input.n3Status === NodeStatus.PASSED) return true;
  const i = NODE_FLOW.indexOf((input.currentNode || '') as NodeCode);
  const n3 = NODE_FLOW.indexOf('N3');
  return i > n3;
}

export function isEligibleSalesCase(row: SalesLinkCaseInput): boolean {
  return isSalesContractSigned({
    currentNode: row.currentNode,
    n3Status: n3StatusOf(row.nodes),
    hasContract: !!row.contract,
  });
}

export function salesCustomerOf(row: SalesLinkCaseInput): string {
  const fromContract = row.contract?.counterparty || row.contract?.buyerName;
  if (fromContract?.trim()) return fromContract.trim();
  const buyer = row.parties?.find((p) => p.role === 'BUYER');
  return buyer?.name?.trim() || row.title;
}

export function nodeLabel(code?: string | null): string {
  return NODE_CATALOG.find((n) => n.code === code)?.name || code || '—';
}

export function presentSalesLink(row: SalesLinkCaseInput): SalesLinkView {
  const amountFen = row.contract?.amountFen ?? row.amountFen ?? null;
  const currency = row.contract?.currency || row.currency || 'USD';
  return {
    id: row.id,
    caseNo: row.caseNo,
    title: row.title,
    customer: salesCustomerOf(row),
    contractNo: row.caseNo,
    amountFen,
    currency,
    status: row.status,
    statusLabel: CaseStatusLabel[row.status] || row.status,
    currentNode: row.currentNode,
    currentNodeLabel: nodeLabel(row.currentNode),
    n3Status: n3StatusOf(row.nodes),
    signed: isEligibleSalesCase(row),
    goodsDesc: row.goodsDesc,
    destination: row.destination,
    deliveryDate: row.contract?.deliveryDate ?? null,
    deliveryMode: row.contract?.deliveryMode ?? null,
    deliveryModeLabel:
      row.contract?.deliveryMode === 'OWN_WAREHOUSE'
        ? '自有仓'
        : row.contract?.deliveryMode === 'BONDED'
          ? '保税仓储'
          : row.contract?.deliveryMode === 'DIRECT_PORT'
            ? '港口直出'
            : null,
  };
}

export function signedSalesOptions(rows: SalesLinkCaseInput[], currentCaseId?: string): Array<SalesLinkView & { isCurrent: boolean }> {
  const list = rows.filter(isEligibleSalesCase).map((row) => ({
    ...presentSalesLink(row),
    isCurrent: row.id === currentCaseId,
  }));
  list.sort((a, b) => a.caseNo.localeCompare(b.caseNo, 'zh-CN'));
  return list;
}

/**
 * 采购关联对象必须由用户选定，或沿用已保存值。
 * 不得因「本案已签销售合同」而自动填入当前案件 id。
 */
export function explicitSalesCaseId(
  requested?: string | null,
  existing?: string | null,
): string {
  if (requested !== undefined && requested !== null) return String(requested).trim();
  return (existing || '').trim();
}

export function filterSalesOptions<
  T extends {
    customer?: string | null;
    contractNo?: string | null;
    caseNo?: string | null;
    goodsDesc?: string | null;
    title?: string | null;
  },
>(rows: T[], query?: string | null): T[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    [row.customer, row.contractNo, row.caseNo, row.goodsDesc, row.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

export type ContractListKind = 'sales' | 'procurement';

export function parseContractListKind(raw?: string | null): ContractListKind | undefined {
  if (raw === 'sales' || raw === 'procurement') return raw;
  return undefined;
}

/** 案件当前节点是否已到达（含）目标节点。 */
export function hasReachedNode(currentNode: string | null | undefined, target: NodeCode): boolean {
  const i = NODE_FLOW.indexOf((currentNode || '') as NodeCode);
  const t = NODE_FLOW.indexOf(target);
  return i >= 0 && t >= 0 && i >= t;
}

/**
 * 销售合同列表：已到达 N3（可填销售合同）或已有销售合同记录。
 * 不含仅停在询盘/报价、从未进入销售合同节点的案件。
 */
export function isSalesContractListItem(row: {
  currentNode?: string | null;
  contract?: unknown | null;
}): boolean {
  return hasReachedNode(row.currentNode, 'N3') || !!row.contract;
}

/**
 * 采购合同列表：已到达 N5（可填采购合同/PO）或已登记采购计划。
 * 与销售列表分开，不以采购 PO 作为销售合同条目。
 */
export function isProcurementContractListItem(row: {
  currentNode?: string | null;
  procurementPlan?: unknown | null;
}): boolean {
  return hasReachedNode(row.currentNode, 'N5') || !!row.procurementPlan;
}

export function supplierNameOf(row: { parties?: Array<{ role: string; name: string }> | null }): string {
  return row.parties?.find((p) => p.role === 'SUPPLIER')?.name?.trim() || '';
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    const t = (v || '').trim();
    if (t) return t;
  }
  return '';
}

export type ProcurementTitleInput = {
  supplierName?: string | null;
  goodsDesc?: string | null;
  customer?: string | null;
  parties?: Array<{ role: string; name: string }> | null;
  contract?: { goodsDesc?: string | null; counterparty?: string | null; buyerName?: string | null } | null;
  customs?: { productName?: string | null } | null;
  salesLink?: { customer?: string | null; goodsDesc?: string | null } | null;
  procurementPlan?: {
    salesLink?: { customer?: string | null; goodsDesc?: string | null } | null;
    salesCase?: SalesLinkCaseInput | null;
  } | null;
};

/**
 * 采购合同品名：优先关联销售合同货物描述（出口品名），
 * 其次本案 goodsDesc、销售合同 goodsDesc、报关品名。
 */
export function procurementProductOf(row: ProcurementTitleInput): string {
  const linked = row.salesLink || row.procurementPlan?.salesLink;
  const salesCase = row.procurementPlan?.salesCase;
  return firstNonEmpty(
    linked?.goodsDesc,
    salesCase?.goodsDesc,
    salesCase?.contract?.goodsDesc,
    row.goodsDesc,
    row.contract?.goodsDesc,
    row.customs?.productName,
  );
}

/** 出口客户：优先关联销售合同买方，其次本案买方/合同相对方。 */
export function procurementExportCustomerOf(row: ProcurementTitleInput): string {
  const linked = row.salesLink || row.procurementPlan?.salesLink;
  const salesCase = row.procurementPlan?.salesCase;
  return firstNonEmpty(
    linked?.customer,
    salesCase ? salesCustomerOf(salesCase) : '',
    row.customer,
    row.contract?.counterparty,
    row.contract?.buyerName,
    row.parties?.find((p) => p.role === 'BUYER')?.name,
  );
}

/**
 * 采购合同主标题：`{供应商名称}采购{产品}出口{客户公司}`。
 * 缺供应商/客户用中文占位，缺品名回退为「货物」，避免空标题。
 */
export function procurementContractTitle(row: ProcurementTitleInput): string {
  const supplier = firstNonEmpty(row.supplierName, supplierNameOf(row)) || '供应商待登记';
  const product = procurementProductOf(row) || '货物';
  const customer = procurementExportCustomerOf(row) || '客户待关联';
  return `${supplier}采购${product}出口${customer}`;
}
