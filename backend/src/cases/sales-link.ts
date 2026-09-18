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
    amountFen?: number | null;
    currency?: string | null;
    deliveryDate?: Date | string | null;
  } | null;
  parties?: Array<{ role: string; name: string }>;
  nodes?: Array<{ code: string; status: string }>;
};

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
  };
}

export function signedSalesOptions(rows: SalesLinkCaseInput[], currentCaseId?: string): Array<SalesLinkView & { isCurrent: boolean }> {
  const list = rows.filter(isEligibleSalesCase).map((row) => ({
    ...presentSalesLink(row),
    isCurrent: row.id === currentCaseId,
  }));
  list.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.caseNo.localeCompare(b.caseNo, 'zh-CN');
  });
  return list;
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
