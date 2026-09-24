/** 出运 / 单证 / 收汇共用的入口。收汇与单证一样：先选销售合同，再选已有批次。 */

export const BATCH_PICK_PAGE = '/pages/node/batches';
export const SHIPMENT_HOME_URL = '/pages/export/pick?lane=shipment';
export const DOCS_HOME_URL = '/pages/export/pick?lane=docs';
export const REMIT_HOME_URL = '/pages/export/pick?lane=remit';

export type ExportLane = 'shipment' | 'docs' | 'remit';
export type BatchLane = ExportLane;

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

/** 已选定销售合同后的批次页。N6 可新建；N7 与 N9 只选已有批次。 */
export function batchPickUrl(caseId: string, openCode?: string | null): string {
  const lane = laneForNode(openCode) || 'shipment';
  const code = nodeCodeForLane(lane);
  return `${BATCH_PICK_PAGE}?id=${caseId}&lane=${lane}&code=${code}`;
}

export function exportHomeUrl(lane: ExportLane): string {
  if (lane === 'docs') return DOCS_HOME_URL;
  if (lane === 'remit') return REMIT_HOME_URL;
  return SHIPMENT_HOME_URL;
}

/** 过闸后的连续性按钮。下一步是收汇时用「去收汇」，并带上当前批次。 */
export function continuityCtaLabel(code?: string | null, fallback = '进入下一步') {
  const c = String(code || '').toUpperCase();
  if (c === 'N8' || c === 'N9') return '去收汇';
  return fallback;
}

/**
 * 销售列表「下一步」为收汇时与首页收汇管理同一条链。
 * 只有一个已有批次则直接打开该批 N9（URL 带 batchId）；
 * 没有批次或多个批次进入批次选择，不打开空白收汇页。
 */
export function remittanceListEntryUrl(
  caseId: string,
  batches: Array<{ id?: string | null }> | null | undefined,
  pageFor: (code: string) => string,
): string {
  const ids = (batches || []).map((b) => String(b?.id || '').trim()).filter(Boolean);
  const batchId = ids.length === 1 ? ids[0] : null;
  return guardedNodeEntryUrl(caseId, 'N9', batchId, pageFor);
}

/**
 * 未带 batchId 的 N6/N7/N9 先进入批次选择，避免打开空白装运、单证或收汇页。
 * 已带 batchId 才进入该批次节点。N9 与单证一样只选已有批次。N2–N5 不受影响。
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
