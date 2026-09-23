/** 出运 / 单证 / 收汇共用的入口。收汇不放首页，只沿批次主链进入。 */

export const BATCH_PICK_PAGE = '/pages/node/batches';
export const SHIPMENT_HOME_URL = '/pages/export/pick?lane=shipment';
export const DOCS_HOME_URL = '/pages/export/pick?lane=docs';

export type ExportLane = 'shipment' | 'docs';
export type BatchLane = ExportLane | 'remit';

export function laneForNode(code?: string | null): BatchLane | null {
  const c = String(code || '').toUpperCase();
  if (c === 'N6') return 'shipment';
  if (c === 'N7') return 'docs';
  if (c === 'N8' || c === 'N9') return 'remit';
  return null;
}

export function nodeCodeForLane(lane: BatchLane): 'N6' | 'N7' | 'N9' {
  if (lane === 'docs') return 'N7';
  if (lane === 'remit') return 'N9';
  return 'N6';
}

/** 只有出运可以新建批次。单证与收汇只选已有批次。 */
export function laneAllowsCreate(lane: BatchLane): boolean {
  return lane === 'shipment';
}

export function resolveBatchLane(query?: { lane?: string | null; code?: string | null } | null): BatchLane {
  const lane = String(query?.lane || '').toLowerCase();
  if (lane === 'shipment' || lane === 'docs' || lane === 'remit') return lane;
  return laneForNode(query?.code) || 'shipment';
}

/** 已选定销售合同后的批次页。N6 可新建；N7 只选已有批次；N9 留在批次主链。 */
export function batchPickUrl(caseId: string, openCode?: string | null): string {
  const lane = laneForNode(openCode) || 'shipment';
  const code = nodeCodeForLane(lane);
  return `${BATCH_PICK_PAGE}?id=${caseId}&lane=${lane}&code=${code}`;
}

export function exportHomeUrl(lane: ExportLane): string {
  return lane === 'docs' ? DOCS_HOME_URL : SHIPMENT_HOME_URL;
}

/**
 * 未带 batchId 的 N6/N7/N9 先进入批次选择，避免打开空白装运、单证或收汇页。
 * 已带 batchId 才进入该批次节点。N2–N5 不受影响。
 */
export function guardedNodeEntryUrl(
  caseId: string,
  activeCode: string,
  batchId: string | null | undefined,
  pageFor: (code: string) => string,
): string {
  const raw = String(activeCode || '').toUpperCase();
  const active = raw === 'N8' ? 'N9' : raw;
  if (!batchId && laneForNode(active)) return batchPickUrl(caseId, active);
  const batch = batchId ? `&batchId=${encodeURIComponent(batchId)}` : '';
  return `${pageFor(active)}?id=${caseId}&code=${active}${batch}`;
}
