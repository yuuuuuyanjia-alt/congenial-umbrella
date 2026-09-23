import { CaseStatus, NodeStatus, pipelineIndex } from '../common/constants';
import { receivedFenOf, SettlementLedgerInput, unpaidFenOf } from '../customers/sinosure-exposure';

export function presentShipmentBatch<T extends {
  amountFen?: number | null;
  currentNode?: string | null;
  shipmentDate?: Date | string | null;
  nodes?: Array<{ code: string; status: string }> | null;
  shipment?: BatchShipmentHint;
  settlement?: SettlementLedgerInput;
}>(batch: T, contractAmountFen: number, sole: boolean) {
  const receivedFen = receivedFenForBatch(batch, { contractAmountFen, sole });
  const amount = batch.amountFen != null ? Number(batch.amountFen) : sole ? contractAmountFen : 0;
  return {
    ...batch,
    nodeLabel: batchNodeLabel(batch.currentNode),
    shipped: batchCountsAsShipped(batch),
    receivedFen,
    unpaidFen: unpaidFenOf(amount, receivedFen),
  };
}

export const BATCH_PIPELINE = ['N6', 'N7', 'N9'] as const;
export const DEFAULT_BATCH_NO = '1';
export const BATCH_NODE_DONE = 'DONE';

export const BATCH_EVIDENCE_NODES = new Set(['N6', 'N7', 'N9']);

export function isBatchPipelineNode(code?: string | null): boolean {
  return (BATCH_PIPELINE as readonly string[]).includes(String(code || '').toUpperCase());
}

export function batchNodeLabel(currentNode?: string | null): string {
  const code = String(currentNode || '').toUpperCase();
  if (code === BATCH_NODE_DONE) return '本批已完成';
  if (code === 'N6') return '装运';
  if (code === 'N7') return '单证';
  if (code === 'N9') return '收汇';
  return code || '装运';
}

export type BatchNodeInput = {
  code: string;
  status: string;
  decision?: string | null;
  summary?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export type BatchShipmentHint = {
  blNo?: string | null;
  blControl?: string | null;
  noBlRef?: string | null;
  noBlReason?: string | null;
  noBlEvidenceStub?: string | null;
} | null;

/** 本批次已出运：N6 已过、已进入后续节点，或已有装运日期/提单。 */
export function batchCountsAsShipped(batch: {
  currentNode?: string | null;
  shipmentDate?: Date | string | null;
  nodes?: Array<{ code: string; status: string }> | null;
  shipment?: BatchShipmentHint;
}): boolean {
  const n6 = (batch.nodes || []).find((n) => n.code === 'N6');
  if (n6?.status === NodeStatus.PASSED) return true;
  const node = String(batch.currentNode || '').toUpperCase();
  if (node === 'N7' || node === 'N9' || node === BATCH_NODE_DONE) return true;
  if (batch.shipmentDate) return true;
  const sh = batch.shipment;
  if (sh?.blNo && String(sh.blNo).trim()) return true;
  const noBl = String(sh?.blControl || '').toUpperCase();
  if (
    (noBl === 'NO_BL' || noBl === 'FOB_NO_BL') &&
    (String(sh?.noBlRef || '').trim() || String(sh?.noBlReason || '').trim() || String(sh?.noBlEvidenceStub || '').trim())
  ) {
    return true;
  }
  return false;
}

export function caseReadyForBatchAdvance(currentNode?: string | null, status?: string | null): boolean {
  if (String(status || '').toUpperCase() === CaseStatus.COMPLETED) return true;
  const i = pipelineIndex(currentNode);
  const n6 = pipelineIndex('N6');
  return i >= 0 && n6 >= 0 && i >= n6;
}

export function selectBatch<T extends { id: string }>(
  batches: T[],
  batchId?: string | null,
): { batch: T | null; error?: 'BATCH_REQUIRED' | 'BATCH_NOT_FOUND' } {
  if (batchId) {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return { batch: null, error: 'BATCH_NOT_FOUND' };
    return { batch };
  }
  if (batches.length <= 1) return { batch: batches[0] ?? null };
  return { batch: null, error: 'BATCH_REQUIRED' };
}

export function nextBatchNode(nodeCode: string): string {
  const code = String(nodeCode || '').toUpperCase();
  if (code === 'N6') return 'N7';
  if (code === 'N7') return 'N9';
  return BATCH_NODE_DONE;
}

export function batchNodeCreates(nodes?: BatchNodeInput[] | null) {
  return BATCH_PIPELINE.map((code) => {
    const found = (nodes || []).find((n) => n.code === code);
    return {
      code,
      status: found?.status || NodeStatus.NOT_STARTED,
      decision: found?.decision ?? null,
      summary: found?.summary ?? null,
      startedAt: found?.startedAt ?? null,
      completedAt: found?.completedAt ?? null,
    };
  });
}

/** 迁移/新建默认批次时的流程位置。未进入装运的案件停在 N6 未开始，不改合同节点。 */
export function describeDefaultBatch(input: {
  status?: string | null;
  currentNode?: string | null;
  nodes?: BatchNodeInput[] | null;
}) {
  const n9 = (input.nodes || []).find((n) => n.code === 'N9');
  const done =
    String(input.status || '').toUpperCase() === CaseStatus.COMPLETED ||
    (String(input.currentNode || '').toUpperCase() === 'N9' && n9?.status === NodeStatus.PASSED);
  const raw = String(input.currentNode || '').toUpperCase();
  let currentNode = 'N6';
  if (done) currentNode = BATCH_NODE_DONE;
  else if (raw === 'N8') currentNode = 'N9';
  else if (raw === 'N6' || raw === 'N7' || raw === 'N9') currentNode = raw;
  const status = done
    ? CaseStatus.COMPLETED
    : raw === 'N6' || raw === 'N7' || raw === 'N8' || raw === 'N9'
      ? 'IN_PROGRESS'
      : NodeStatus.NOT_STARTED;
  return { currentNode, status, nodes: batchNodeCreates(input.nodes) };
}

export function evidencesForBatch<T extends { nodeCode?: string | null; batchId?: string | null }>(
  rows: T[],
  batchId: string,
): T[] {
  return rows.filter((row) => {
    const node = String(row.nodeCode || '').toUpperCase();
    if (!BATCH_EVIDENCE_NODES.has(node)) return true;
    return row.batchId === batchId;
  });
}

export function mergeBatchNodes<T extends { code: string }>(caseNodes: T[], batchNodes: T[]): T[] {
  const rest = caseNodes.filter((n) => !isBatchPipelineNode(n.code));
  const scoped = batchNodes.filter((n) => isBatchPipelineNode(n.code));
  return [...rest, ...scoped];
}

export function receivedFenForBatch(
  batch: { amountFen?: number | null; settlement?: SettlementLedgerInput },
  opts: { contractAmountFen: number; sole: boolean },
): number {
  const base = batch.amountFen != null ? Number(batch.amountFen) : opts.sole ? opts.contractAmountFen : 0;
  return receivedFenOf(batch.settlement, Math.max(0, base));
}

/**
 * 占用 = 各批次未收汇 + 尚未出运的合同余额。
 * 已出运批次的未回款计入已履行未回款；未出运余额计入未履行未回款。
 * 只有一个默认批次且金额等于合同时，与原来的整单口径一致。
 */
export function contractOccupancyPortions(input: {
  amountFen: number;
  batches?: Array<{
    amountFen?: number | null;
    receivedFen: number;
    shipped: boolean;
  }> | null;
  legacy?: { receivedFen: number; fulfilled: boolean } | null;
}): {
  receivedFen: number;
  openUnpaidFen: number;
  fulfilledUnpaidFen: number;
  unpaidRemittanceFen: number;
  unshippedBalanceFen: number;
} {
  if (!input.batches) {
    const received = Math.max(0, Number(input.legacy?.receivedFen) || 0);
    const unpaid = unpaidFenOf(input.amountFen, received);
    if (input.legacy?.fulfilled) {
      return {
        receivedFen: received,
        openUnpaidFen: 0,
        fulfilledUnpaidFen: unpaid,
        unpaidRemittanceFen: unpaid,
        unshippedBalanceFen: 0,
      };
    }
    return {
      receivedFen: received,
      openUnpaidFen: unpaid,
      fulfilledUnpaidFen: 0,
      unpaidRemittanceFen: 0,
      unshippedBalanceFen: unpaid,
    };
  }
  const receivedFen = input.batches.reduce((sum, b) => sum + Math.max(0, Number(b.receivedFen) || 0), 0);
  const occupancy = unpaidFenOf(input.amountFen, receivedFen);
  const unpaidRemittance = input.batches
    .filter((b) => b.shipped)
    .reduce((sum, b) => sum + unpaidFenOf(b.amountFen || 0, b.receivedFen || 0), 0);
  const shippedAmount = input.batches
    .filter((b) => b.shipped)
    .reduce((sum, b) => sum + Math.max(0, Number(b.amountFen) || 0), 0);
  const unshippedBalance = Math.max(0, (Number(input.amountFen) || 0) - shippedAmount);
  const fulfilledUnpaidFen = Math.min(occupancy, Math.max(0, unpaidRemittance));
  const openUnpaidFen = Math.max(0, occupancy - fulfilledUnpaidFen);
  return {
    receivedFen,
    openUnpaidFen,
    fulfilledUnpaidFen,
    unpaidRemittanceFen: fulfilledUnpaidFen,
    unshippedBalanceFen: unshippedBalance,
  };
}

export function aggregateRemittance(
  batches: Array<{ amountFen?: number | null; settlement?: SettlementLedgerInput }>,
  opts?: { contractAmountFen?: number; sole?: boolean },
): {
  receivedAt: Date | null;
  hasRemittanceMemo: boolean;
  amountFen: number;
} | null {
  const sole = opts?.sole ?? batches.length <= 1;
  const contractAmountFen = Math.max(0, Number(opts?.contractAmountFen) || 0);
  let receivedFen = 0;
  let any = false;
  let memo = false;
  let latest: Date | null = null;
  for (const batch of batches) {
    const settlement = batch.settlement;
    if (settlement && (settlement.receivedAt || settlement.hasRemittanceMemo || settlement.amountFen != null)) {
      any = true;
    }
    if (settlement?.hasRemittanceMemo) memo = true;
    const at = settlement?.receivedAt ? new Date(settlement.receivedAt) : null;
    if (at && !Number.isNaN(at.getTime()) && (!latest || at > latest)) latest = at;
    receivedFen += receivedFenForBatch(batch, { contractAmountFen, sole });
  }
  if (!any && receivedFen <= 0) return null;
  return {
    receivedAt: latest,
    hasRemittanceMemo: memo || !!latest,
    amountFen: receivedFen,
  };
}

/** 案件进入装运后，用各批次节点汇总案件级 N6/N7/N9。未进入装运时不改案件指针。 */
export function rollupCaseShipping(input: {
  caseCurrentNode: string;
  caseStatus: string;
  batches: Array<{ currentNode: string; nodes: Array<{ code: string; status: string }> }>;
}): {
  apply: boolean;
  currentNode: string;
  status: string;
  nodes: Array<{ code: string; status: string }>;
} {
  const reached = caseReadyForBatchAdvance(input.caseCurrentNode, input.caseStatus);
  if (!reached || !input.batches.length) {
    return { apply: false, currentNode: input.caseCurrentNode, status: input.caseStatus, nodes: [] };
  }
  const nodes = BATCH_PIPELINE.map((code) => {
    const statuses = input.batches.map(
      (b) => b.nodes.find((n) => n.code === code)?.status || NodeStatus.NOT_STARTED,
    );
    let status: string = NodeStatus.NOT_STARTED;
    if (statuses.every((s) => s === NodeStatus.PASSED)) status = NodeStatus.PASSED;
    else if (statuses.some((s) => s === NodeStatus.BLOCKED)) status = NodeStatus.BLOCKED;
    else if (statuses.some((s) => s === NodeStatus.REVIEW)) status = NodeStatus.REVIEW;
    else if (statuses.some((s) => s !== NodeStatus.NOT_STARTED)) status = NodeStatus.IN_PROGRESS;
    return { code, status };
  });
  const allDone = input.batches.every((b) => {
    if (String(b.currentNode).toUpperCase() === BATCH_NODE_DONE) return true;
    return b.nodes.find((n) => n.code === 'N9')?.status === NodeStatus.PASSED;
  });
  if (allDone) {
    return { apply: true, currentNode: 'N9', status: CaseStatus.COMPLETED, nodes };
  }
  const open = input.batches
    .map((b) => String(b.currentNode || 'N6').toUpperCase())
    .filter((code) => code !== BATCH_NODE_DONE);
  const earliest = open.reduce((min, code) => (pipelineIndex(code) < pipelineIndex(min) ? code : min), open[0] || 'N6');
  return { apply: true, currentNode: earliest || 'N6', status: CaseStatus.IN_PROGRESS, nodes };
}
