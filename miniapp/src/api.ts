// #ifdef H5
const BASE = import.meta.env.VITE_API_BASE || '/api';
// #endif
// #ifndef H5
const BASE = 'http://127.0.0.1:3000/api';
// #endif

function request<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE + url,
      method: method as any,
      data: data as any,
      header: {
        'Content-Type': 'application/json',
        ...(uni.getStorageSync('actorId') ? { 'x-actor-id': uni.getStorageSync('actorId') } : {}),
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data as T);
        else reject(res.data || { message: '请求失败', statusCode: res.statusCode });
      },
      fail: (err) => reject(err),
    });
  });
}

export const api = {
  health: () => request('GET', '/health'),
  catalog: () => request('GET', '/catalog'),
  users: () => request('GET', '/users'),
  cases: (kind?: string) => request('GET', `/cases${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  case: (id: string) => request('GET', `/cases/${id}`),
  audit: (id: string) => request('GET', `/cases/${id}/audit`),
  createCase: (body: unknown) => request('POST', '/cases', body),
  upsertParty: (id: string, body: unknown) => request('POST', `/cases/${id}/parties`, body),
  screen: (id: string) => request('POST', `/cases/${id}/nodes/N1/screen`),
  screenSupplier: (id: string) => request('POST', `/cases/${id}/nodes/N5/screen`),
  saveContract: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N3/contract`, body),
  saveSinosureN3: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N3/sinosure`, body),
  saveSinosureN4: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N4/sinosure`, body),
  saveQuote: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N2/quotes`, body),
  createChange: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N4/changes`, body),
  ackChange: (id: string, changeId: string, body: unknown) =>
    request('POST', `/cases/${id}/nodes/N4/changes/${changeId}/ack`, body),
  applyChange: (id: string, changeId: string) =>
    request('POST', `/cases/${id}/nodes/N4/changes/${changeId}/apply`),
  savePlan: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N5/plan`, body),
  salesOptions: (id: string) => request('GET', `/cases/${id}/nodes/N5/sales-options`),
  saveShipment: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N6/shipment`, body),
  saveDocument: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N7/documents`, body),
  saveFix: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N7/fixes`, body),
  saveCustoms: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N8/customs`, body),
  syncEport: (id: string) => request('POST', `/cases/${id}/nodes/N8/eport-sync`),
  saveSettlement: (id: string, body: unknown) => request('POST', `/cases/${id}/nodes/N9/settlement`, body),
  gate: (id: string, code: string) => request('GET', `/cases/${id}/nodes/${code}/gate`),
  advance: (id: string, code: string) => request('POST', `/cases/${id}/nodes/${code}/advance`),
  queue: () => request('GET', '/workbench/queue'),
  workbench: (caseId: string, body: unknown) => request('POST', `/workbench/${caseId}/action`, body),
  customers: () => request('GET', '/customers'),
  customer: (id: string) => request('GET', `/customers/${id}`),
  sinosureExposure: (id: string, q?: { newAmountFen?: number; currency?: string }) => {
    const p = new URLSearchParams();
    if (q?.newAmountFen != null) p.set('newAmountFen', String(q.newAmountFen));
    if (q?.currency) p.set('currency', q.currency);
    const qs = p.toString();
    return request('GET', `/cases/${id}/sinosure-exposure${qs ? `?${qs}` : ''}`);
  },
  suppliers: () => request('GET', '/suppliers'),
  supplier: (id: string) => request('GET', `/suppliers/${id}`),
};

export function decisionClass(d?: string | null) {
  if (d === 'HARD_BLOCK' || d === 'BLOCKED' || d === 'HIGH' || d === 'ULTRA_HIGH') return 'badge-block';
  if (d === 'REVIEW' || d === 'MEDIUM' || d === 'CLAIMED' || d === 'OPEN') return 'badge-review';
  if (d === 'APPROVED') return 'badge-pass';
  if (d === 'REJECTED') return 'badge-block';
  if (d === 'SOFT_ALERT' || d === 'LOW' || d === 'BELOW_MEDIUM') return 'badge-soft';
  if (d === 'PASS' || d === 'PASSED' || d === 'COMPLETED' || d === 'WITHIN_LIMIT') return 'badge-pass';
  if (d === 'STUB_TODO') return 'badge-stub';
  return 'badge-stub';
}

export function decisionText(d?: string | null) {
  const map: Record<string, string> = {
    PASS: '通过',
    SOFT_ALERT: '软提示',
    REVIEW: '审核队列',
    HARD_BLOCK: '硬拦截',
    PASSED: '已通过',
    BLOCKED: '已拦截',
    IN_PROGRESS: '进行中',
    NOT_STARTED: '未开始',
    STUB_TODO: '后续版本',
    COMPLETED: '已完成',
    LOW: '低风险',
    MEDIUM: '中风险',
    HIGH: '高风险',
    OPEN: '待处置',
    CLAIMED: '已领取',
    APPROVED: '已放行',
    REJECTED: '已驳回',
    CLAIM: '领取',
    APPROVE: '放行',
    REJECT: '驳回',
    SUPERSEDED: '已失效',
    FALSE_POSITIVE: '误报排除',
    CONFIRMED_TRUE: '确认真实',
    SUPPLEMENTED: '已补充',
    MONITORING: '持续监控',
    OVERDUE_SETTLEMENT: '逾期收汇',
    OPEN_SETTLEMENT: '收汇未到期',
    WITHIN_LIMIT: '额度内',
    BELOW_MEDIUM: '超额（不足1万）',
    MEDIUM: '中风险',
    HIGH: '高风险',
    ULTRA_HIGH: '超高风险',
  };
  return (d && map[d]) || d || '-';
}

const NODE_FLOW = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];

/** 与后端 N6_PLUS_PENDING_CHANGE_REASON 一致 */
export const N6_PLUS_PENDING_CHANGE_REASON =
  '存在未生效变更单，禁止装运及后续节点；须先完成变更管理并应用新版本';

export function pendingChangesOf(c: any) {
  return (c?.changeOrders || []).filter(
    (co: any) => co && co.status !== 'APPLIED' && co.status !== 'SUPERSEDED',
  );
}

/** 与后端 NODE_CATALOG / pipeline-nav 中文名对齐。 */
export const NODE_LABELS: Record<string, string> = {
  N1: '询盘/客户KYC',
  N2: '报价环节',
  N3: '销售合同/订单确认',
  N4: '变更管理',
  N5: '采购合同/国内备货',
  N6: '装运/提单指示',
  N7: '单证一致性',
  N8: '报关放行',
  N9: '收汇对账',
};

export function pipelineNodeName(code?: string | null) {
  return (code && NODE_LABELS[code]) || code || '';
}

/** 与闸门 nextNode 一致：N3 无变更单则跳过 N4。 */
export function nextPipelineNode(current: string, hasChangeOrders = false): string | null {
  const i = NODE_FLOW.indexOf(current);
  if (i < 0 || i === NODE_FLOW.length - 1) return null;
  if (current === 'N3' && !hasChangeOrders) return 'N5';
  return NODE_FLOW[i + 1];
}

export type PipelineNodeTarget = { code: string; name: string };

/**
 * 合同管理表单（销售 N3 / 采购 N5）离开后应打开的九节点页面。
 * 案件已离开本表单时跟 currentNode；否则为保存/过闸后的下一步。
 */
export function nextWorkNodeFromForm(
  formNode: string,
  input: {
    currentNode?: string | null;
    changeOrders?: unknown[] | null;
    changeOrderCount?: number;
    overrideNext?: string | null;
  } = {},
): PipelineNodeTarget | null {
  const override = input.overrideNext;
  if (override) return { code: override, name: pipelineNodeName(override) };

  const current = input.currentNode || '';
  const fi = NODE_FLOW.indexOf(formNode);
  const ci = NODE_FLOW.indexOf(current);
  if (fi >= 0 && ci > fi) return { code: current, name: pipelineNodeName(current) };

  const hasChangeOrders = (input.changeOrderCount ?? input.changeOrders?.length ?? 0) > 0;
  const next = nextPipelineNode(formNode, hasChangeOrders);
  if (!next) return null;
  return { code: next, name: pipelineNodeName(next) };
}

/** 列表卡片：本案已离开本表单节点时才给出「进入下一节点」。 */
export function listShowsNextNodeButton(formNode: string, currentNode?: string | null) {
  const fi = NODE_FLOW.indexOf(formNode);
  const ci = NODE_FLOW.indexOf(currentNode || '');
  return fi >= 0 && ci > fi;
}

export function goToNode(caseId: string, code: string) {
  uni.navigateTo({ url: `${nodePage(code)}?id=${caseId}&code=${code}` });
}

export function hasReachedNode(currentNode?: string | null, target = 'N3') {
  const i = NODE_FLOW.indexOf(currentNode || '');
  const t = NODE_FLOW.indexOf(target);
  return i >= 0 && t >= 0 && i >= t;
}

/** 销售合同列表：已到 N3 或已有销售合同；不含采购 PO 条目。 */
export function isSalesListCase(c: any) {
  return hasReachedNode(c?.currentNode, 'N3') || !!c?.contract;
}

/** 采购合同列表：已到 N5 或已有采购计划/PO。 */
export function isProcurementListCase(c: any) {
  return hasReachedNode(c?.currentNode, 'N5') || !!c?.procurementPlan || !!c?.poNo;
}

export const SALES_SHIPMENT_BUCKETS = [
  { key: 'unshipped', label: '未出运', hint: '尚未装运：无装运日期，且装运/提单节点未完成。' },
  { key: 'shipped', label: '已出运', hint: '已装运，但客户尚未提货或尚未回款。' },
  { key: 'completed', label: '已完成', hint: '已出运，客户已提货，且收汇对账已回款（水单/到账，未收汇为 0）。与占用释放同一口径。' },
] as const;

export type SalesShipmentBucketKey = (typeof SALES_SHIPMENT_BUCKETS)[number]['key'];

function filledListDate(v: unknown) {
  if (v == null || v === '') return false;
  const s = String(v).trim();
  return s.length >= 8;
}

function filledListText(v: unknown) {
  return !!String(v ?? '').trim();
}

/** 与后端一致的回退分组：优先用接口 shipmentBucket。 */
export function salesShipmentBucketOf(c: any): SalesShipmentBucketKey {
  const given = c?.shipmentBucket;
  if (given === 'unshipped' || given === 'shipped' || given === 'completed') return given;
  const ct = c?.contract || {};
  const sh = c?.shipment || {};
  const shipped =
    filledListDate(ct.shipmentDate) ||
    filledListDate(ct.domesticPortArrivalAt) ||
    filledListDate(c?.domesticPortArrivalAt) ||
    String(c?.status || '').toUpperCase() === 'COMPLETED' ||
    (c?.nodes || []).some((n: any) => n.code === 'N6' && n.status === 'PASSED') ||
    hasReachedNode(c?.currentNode, 'N7') ||
    filledListText(sh.blNo) ||
    ((String(sh.blControl || '').toUpperCase() === 'NO_BL' ||
      String(sh.blControl || '').toUpperCase() === 'FOB_NO_BL') &&
      (filledListText(sh.noBlRef) || filledListText(sh.noBlReason) || filledListText(sh.noBlEvidenceStub)));
  if (!shipped) return 'unshipped';
  const pickedUp = (ct.customerPickedUp ?? c?.customerPickedUp) === true;
  const st = c?.settlement || {};
  const amount = Number(ct.amountFen ?? c?.amountFen) || 0;
  const recorded = !!(st.receivedAt || st.hasRemittanceMemo);
  let remitted = 0;
  if (recorded) {
    if (st.amountFen != null && Number.isFinite(Number(st.amountFen))) remitted = Math.max(0, Number(st.amountFen));
    else if (st.receivedAt) remitted = Math.max(0, amount);
  }
  const unpaid = Math.max(0, amount - remitted);
  if (pickedUp && recorded && unpaid === 0) return 'completed';
  return 'shipped';
}

export function salesShipmentBucketLabel(c: any) {
  const key = salesShipmentBucketOf(c);
  return SALES_SHIPMENT_BUCKETS.find((b) => b.key === key)?.label || '未出运';
}

export function salesShipmentBadgeClass(c: any) {
  const key = salesShipmentBucketOf(c);
  if (key === 'completed') return 'badge-pass';
  if (key === 'shipped') return 'badge-review';
  return 'badge-soft';
}

export function groupSalesListByShipment(rows: any[]) {
  const bags: Record<SalesShipmentBucketKey, any[]> = { unshipped: [], shipped: [], completed: [] };
  for (const row of rows) bags[salesShipmentBucketOf(row)].push(row);
  return SALES_SHIPMENT_BUCKETS.map((b) => ({ ...b, items: bags[b.key] }));
}

function firstNonEmpty(...vals: Array<string | null | undefined>) {
  for (const v of vals) {
    const t = String(v ?? '').trim();
    if (t) return t;
  }
  return '';
}

/**
 * 采购合同主标题：`{供应商名称}采购{产品}出口{客户公司}`。
 * 品名回退：关联销售合同 goodsDesc → 本案 goodsDesc → 合同货物 → 报关品名。
 */
export function procurementContractTitle(c: any, live?: { supplierName?: string; productName?: string; customerName?: string }) {
  const link = c?.salesLink || c?.procurementPlan?.salesLink;
  const supplier =
    firstNonEmpty(
      live?.supplierName,
      c?.supplierName,
      (c?.parties || []).find((p: any) => p.role === 'SUPPLIER')?.name,
    ) || '供应商待登记';
  const product =
    firstNonEmpty(
      live?.productName,
      link?.goodsDesc,
      c?.procurementPlan?.salesCase?.goodsDesc,
      c?.goodsDesc,
      c?.contract?.goodsDesc,
      c?.customs?.productName,
    ) || '货物';
  const customer =
    firstNonEmpty(
      live?.customerName,
      link?.customer,
      c?.customer,
      c?.contract?.counterparty,
      c?.contract?.buyerName,
      (c?.parties || []).find((p: any) => p.role === 'BUYER')?.name,
    ) || '客户待关联';
  return `${supplier}采购${product}出口${customer}`;
}

export function nodePage(code: string) {
  if (code === 'N1') return '/pages/node/kyc';
  if (code === 'N2') return '/pages/node/quote';
  if (code === 'N3') return '/pages/node/contract';
  if (code === 'N4') return '/pages/node/change';
  if (code === 'N5') return '/pages/node/procurement';
  if (code === 'N6') return '/pages/node/shipment';
  if (code === 'N7') return '/pages/node/docs';
  if (code === 'N8') return '/pages/node/customs';
  if (code === 'N9') return '/pages/node/settlement';
  return '/pages/node/stub';
}

export function remittanceClass(code?: string | null) {
  if (code === 'OVERDUE') return 'badge-block';
  if (code === 'ON_TIME' || code === 'PAID') return 'badge-pass';
  if (code === 'NOT_DUE') return 'badge-soft';
  return 'badge-stub';
}

export function remittanceText(code?: string | null) {
  const map: Record<string, string> = {
    ON_TIME: '按期',
    OVERDUE: '逾期',
    NOT_DUE: '未到期',
    NO_RECORD: '无记录',
    PAID: '已付清',
  };
  return (code && map[code]) || '无记录';
}

export function money(fen?: number | null, currency = 'USD') {
  if (fen == null || !Number.isFinite(Number(fen))) return '未登记';
  return `${currency} ${(Number(fen) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toastErr(e: any) {
  const msg = e?.message || e?.reasons?.join('；') || '操作失败';
  uni.showToast({ title: String(msg).slice(0, 40), icon: 'none', duration: 2800 });
}

export function yuanToFen(v: string | number | null | undefined) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fenToYuan(fen?: number | null) {
  if (fen == null || !Number.isFinite(Number(fen))) return '';
  return (Number(fen) / 100).toFixed(2);
}

export function latestSinosure(list: any[] | undefined, nodeCode: string) {
  const rows = (list || []).filter((p) => p.nodeCode === nodeCode);
  return rows.length ? rows[rows.length - 1] : null;
}

export function exposureClass(band?: string | null) {
  if (band === 'ULTRA_HIGH') return 'badge-block';
  if (band === 'HIGH') return 'badge-review';
  if (band === 'MEDIUM' || band === 'BELOW_MEDIUM') return 'badge-soft';
  if (band === 'WITHIN_LIMIT') return 'badge-pass';
  return 'badge-stub';
}

const BAND_FEN = { MEDIUM_MIN: 1_000_000, HIGH_MIN: 2_000_000, ULTRA_MIN: 5_000_000 };

export function bandOfExcessFen(excessFen: number) {
  const excess = Math.max(0, Number(excessFen) || 0);
  if (excess <= 0) return 'WITHIN_LIMIT';
  if (excess < BAND_FEN.MEDIUM_MIN) return 'BELOW_MEDIUM';
  if (excess < BAND_FEN.HIGH_MIN) return 'MEDIUM';
  if (excess < BAND_FEN.ULTRA_MIN) return 'HIGH';
  return 'ULTRA_HIGH';
}

export function previewExposure(base: any, newAmountFen: number) {
  if (!base) return null;
  const openUnpaidFen = Number(base.openUnpaidFen) || 0;
  const fulfilledUnpaidFen = Number(base.fulfilledUnpaidFen) || 0;
  const newFen = Math.max(0, Number(newAmountFen) || 0);
  const occupancyFen = openUnpaidFen + fulfilledUnpaidFen + newFen;
  const insuredLimitFen = base.insuredLimitFen != null ? Number(base.insuredLimitFen) : null;
  const remainingFen = insuredLimitFen != null ? Math.max(0, insuredLimitFen - occupancyFen) : 0;
  const excessFen = insuredLimitFen != null ? Math.max(0, occupancyFen - insuredLimitFen) : 0;
  const band = insuredLimitFen == null ? null : bandOfExcessFen(excessFen);
  const bandLabel =
    band === 'WITHIN_LIMIT'
      ? '额度内'
      : band === 'BELOW_MEDIUM'
        ? '超额（不足1万美元）'
        : band === 'MEDIUM'
          ? '中风险'
          : band === 'HIGH'
            ? '高风险'
            : band === 'ULTRA_HIGH'
              ? '超高风险'
              : '未测算';
  const gateDecision =
    band === 'WITHIN_LIMIT'
      ? 'PASS'
      : band === 'HIGH'
        ? 'REVIEW'
        : band === 'ULTRA_HIGH'
          ? 'HARD_BLOCK'
          : band
            ? 'SOFT_ALERT'
            : null;
  const currency = base.currency || 'USD';
  return {
    ...base,
    newContractFen: newFen,
    occupancyFen,
    remainingFen,
    excessFen,
    band,
    bandLabel,
    gateDecision,
    currency,
    summary:
      insuredLimitFen == null
        ? '尚未登记投保限额。'
        : excessFen > 0
          ? `占用 ${money(occupancyFen, currency)}，限额 ${money(insuredLimitFen, currency)}，超额 ${money(excessFen, currency)}（${bandLabel}）`
          : `占用 ${money(occupancyFen, currency)}，限额 ${money(insuredLimitFen, currency)}，剩余额度 ${money(remainingFen, currency)}`,
  };
}
