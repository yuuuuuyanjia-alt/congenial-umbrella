import {
  DEMO_SINOSURE_FILE_NAME,
  DEMO_SINOSURE_SAMPLE_URL,
  demoSinosurePdfBytes,
  isPdfBytes,
} from './demo-sinosure-sample';

// #ifdef H5
const BASE = import.meta.env.VITE_API_BASE || '/api';
// #endif
// #ifndef H5
const BASE = 'http://127.0.0.1:3000/api';
// #endif

function demoHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const actor = uni.getStorageSync('actorId');
  const role = uni.getStorageSync('demoRole');
  if (actor) headers['x-actor-id'] = actor;
  if (role) headers['x-demo-role'] = role;
  return headers;
}

export const SINOSURE_UPLOAD_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx'];
export const SINOSURE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

export type SinosureUploadResult = {
  evidenceId: string;
  evidenceRef: string;
  fileName: string;
  mime: string;
  size: number;
  sha256: string;
  storageKey: string;
};

export function sinosureFileError(name: string, size: number): string | null {
  const base = String(name || '').split(/[/\\]/).pop() || '';
  const i = base.lastIndexOf('.');
  const ext = i >= 0 ? base.slice(i).toLowerCase() : '';
  if (!SINOSURE_UPLOAD_EXTS.includes(ext)) return '中信保保单仅支持 PDF、Word、Excel 或常见图片';
  if (!size) return '上传文件为空';
  if (size > SINOSURE_UPLOAD_MAX_BYTES) return '保单文件不能超过 15MB';
  return null;
}

export function evidenceFileUrl(caseId: string, evidenceId: string) {
  return `${BASE}/cases/${caseId}/evidences/${encodeURIComponent(evidenceId)}/file`;
}

export { DEMO_SINOSURE_FILE_NAME };

export function chooseAndUploadSinosure(caseId: string): Promise<SinosureUploadResult> {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return chooseAndUploadSinosureH5(caseId);
  }
  return chooseAndUploadSinosureMini(caseId);
}

/** Same multipart POST as the file picker. Does not open a picker. */
export async function postSinosureUpload(
  caseId: string,
  file: Blob,
  fileName: string,
): Promise<SinosureUploadResult> {
  const problem = sinosureFileError(fileName, file.size);
  if (problem) return Promise.reject({ message: problem });
  if (typeof fetch !== 'function' || typeof FormData !== 'function') {
    return Promise.reject({ message: '当前环境不支持上传保单' });
  }
  const fd = new FormData();
  fd.append('file', file, fileName);
  fd.append('fileName', fileName);
  const res = await fetch(`${BASE}/cases/${caseId}/nodes/N3/sinosure/upload`, {
    method: 'POST',
    headers: demoHeaders(false),
    body: fd,
  });
  const data = await res.json().catch(() => ({ message: '保单上传失败' }));
  if (!res.ok) throw data;
  return data as SinosureUploadResult;
}

async function loadDemoSinosurePdf(): Promise<Blob> {
  const fallback = () => new Blob([demoSinosurePdfBytes()], { type: 'application/pdf' });
  if (typeof fetch !== 'function') return fallback();
  try {
    const res = await fetch(DEMO_SINOSURE_SAMPLE_URL);
    if (!res.ok) return fallback();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!isPdfBytes(buf)) return fallback();
    return new Blob([buf], { type: 'application/pdf' });
  } catch {
    return fallback();
  }
}

/** One-click demo policy: built-in PDF, existing N3 upload API, no file picker. */
export async function uploadDemoSinosure(caseId: string): Promise<SinosureUploadResult> {
  const blob = await loadDemoSinosurePdf();
  return postSinosureUpload(caseId, blob, DEMO_SINOSURE_FILE_NAME);
}

export type TradeDocNode = 'N6' | 'N7';

export type TradeDocSlot = {
  slot: string;
  kind: string;
  label: string;
  demoName: string;
  hint?: string;
};

/** N6：上传商业发票、上传箱单。槽位键仍为 invoice。与 N7 的商业发票/发票/箱单不是同一份证据。 */
export const N6_DOC_SLOTS: TradeDocSlot[] = [
  { slot: 'invoice', kind: 'N6_INVOICE', label: '商业发票', demoName: '演示商业发票.pdf' },
  { slot: 'packing', kind: 'N6_PACKING', label: '箱单', demoName: '演示箱单.pdf' },
];

/** N7：前六份必填；原产地证在非 FOB 时必填。商业发票与发票分别必填。 */
export const N7_DOC_SLOTS: TradeDocSlot[] = [
  { slot: 'sales-contract', kind: 'N7_SALES_CONTRACT', label: '销售合同', demoName: '演示销售合同.pdf' },
  { slot: 'commercial-invoice', kind: 'N7_COMMERCIAL_INVOICE', label: '商业发票', demoName: '演示商业发票.pdf' },
  { slot: 'packing', kind: 'N7_PACKING', label: '箱单', demoName: '演示箱单.pdf' },
  { slot: 'purchase-contract', kind: 'N7_PURCHASE_CONTRACT', label: '采购合同', demoName: '演示采购合同.pdf' },
  { slot: 'invoice', kind: 'N7_INVOICE', label: '发票', demoName: '演示发票.pdf' },
  { slot: 'customs', kind: 'N7_CUSTOMS', label: '报关单', demoName: '演示报关单.pdf' },
  {
    slot: 'origin-cert',
    kind: 'N7_ORIGIN_CERT',
    label: '原产地证',
    demoName: '演示原产地证.pdf',
    hint: '运输术语为 FOB 时可以不传；CIF 等非 FOB 必须上传，否则不能进入收汇。',
  },
];

export type TradeDocUploadResult = SinosureUploadResult & {
  slot: string;
  kind: string;
  label: string;
};

export function tradeDocFileError(name: string, size: number): string | null {
  const base = String(name || '').split(/[/\\]/).pop() || '';
  const i = base.lastIndexOf('.');
  const ext = i >= 0 ? base.slice(i).toLowerCase() : '';
  if (!SINOSURE_UPLOAD_EXTS.includes(ext)) return '单证仅支持 PDF、Word、Excel 或常见图片';
  if (!size) return '上传文件为空';
  if (size > SINOSURE_UPLOAD_MAX_BYTES) return '单证文件不能超过 15MB';
  return null;
}

export function latestTradeDoc(evidences: any[] | null | undefined, kind: string, batchId?: string) {
  const rows = (evidences || []).filter((row) => {
    if (row?.kind !== kind) return false;
    if (typeof row?.payload?.storageKey !== 'string' || !row.payload.storageKey) return false;
    if (batchId && row.batchId !== batchId) return false;
    return true;
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function withBatch(url: string, batchId?: string | null) {
  if (!batchId) return url;
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}batchId=${encodeURIComponent(batchId)}`;
}

export async function postTradeDocUpload(
  caseId: string,
  node: TradeDocNode,
  slot: string,
  file: Blob,
  fileName: string,
  batchId?: string,
): Promise<TradeDocUploadResult> {
  const problem = tradeDocFileError(fileName, file.size);
  if (problem) return Promise.reject({ message: problem });
  if (typeof fetch !== 'function' || typeof FormData !== 'function') {
    return Promise.reject({ message: '当前环境不支持上传单证' });
  }
  const fd = new FormData();
  fd.append('file', file, fileName);
  fd.append('fileName', fileName);
  const res = await fetch(withBatch(`${BASE}/cases/${caseId}/nodes/${node}/docs/${encodeURIComponent(slot)}/upload`, batchId), {
    method: 'POST',
    headers: demoHeaders(false),
    body: fd,
  });
  const data = await res.json().catch(() => ({ message: '单证上传失败' }));
  if (!res.ok) throw data;
  return data as TradeDocUploadResult;
}

/** One-click sample: same built-in PDF as the Sinosure demo, no file picker. */
export async function uploadDemoTradeDoc(
  caseId: string,
  node: TradeDocNode,
  slot: TradeDocSlot,
  batchId?: string,
): Promise<TradeDocUploadResult> {
  const blob = await loadDemoSinosurePdf();
  return postTradeDocUpload(caseId, node, slot.slot, blob, slot.demoName, batchId);
}

export function chooseAndUploadTradeDoc(
  caseId: string,
  node: TradeDocNode,
  slot: string,
  batchId?: string,
): Promise<TradeDocUploadResult> {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return chooseAndUploadTradeDocH5(caseId, node, slot, batchId);
  }
  return chooseAndUploadTradeDocMini(caseId, node, slot, batchId);
}

function chooseAndUploadTradeDocH5(
  caseId: string,
  node: TradeDocNode,
  slot: string,
  batchId?: string,
): Promise<TradeDocUploadResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject({ message: '未选择文件' });
        return;
      }
      postTradeDocUpload(caseId, node, slot, file, file.name, batchId).then(resolve, reject);
    };
    input.click();
  });
}

function chooseAndUploadTradeDocMini(
  caseId: string,
  node: TradeDocNode,
  slot: string,
  batchId?: string,
): Promise<TradeDocUploadResult> {
  return new Promise((resolve, reject) => {
    const uniAny = uni as any;
    const chooser = uniAny.chooseFile || uniAny.chooseMessageFile;
    if (!chooser) {
      reject({ message: '当前环境不支持选择文件' });
      return;
    }
    chooser({
      count: 1,
      type: 'all',
      extension: SINOSURE_UPLOAD_EXTS,
      success: (res: any) => {
        const f = res.tempFiles?.[0];
        const filePath = f?.path || f?.tempFilePath || res.tempFilePaths?.[0];
        const fileName = f?.name || 'document.pdf';
        const size = Number(f?.size || 0);
        if (!filePath) {
          reject({ message: '未选择文件' });
          return;
        }
        const problem = tradeDocFileError(fileName, size || 1);
        if (problem) {
          reject({ message: problem });
          return;
        }
        uni.uploadFile({
          url: withBatch(BASE + `/cases/${caseId}/nodes/${node}/docs/${encodeURIComponent(slot)}/upload`, batchId),
          filePath,
          name: 'file',
          formData: { fileName },
          header: demoHeaders(false),
          success: (up) => {
            let data: any = up.data;
            try {
              if (typeof data === 'string') data = JSON.parse(data);
            } catch {
              /* 保留原文 */
            }
            if (up.statusCode >= 200 && up.statusCode < 300) resolve(data as TradeDocUploadResult);
            else reject(data || { message: '单证上传失败' });
          },
          fail: (err) => reject(err),
        });
      },
      fail: (err: any) => reject(err?.errMsg ? { message: '未选择文件' } : err),
    });
  });
}

function chooseAndUploadSinosureH5(caseId: string): Promise<SinosureUploadResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject({ message: '未选择文件' });
        return;
      }
      postSinosureUpload(caseId, file, file.name).then(resolve, reject);
    };
    input.click();
  });
}

function chooseAndUploadSinosureMini(caseId: string): Promise<SinosureUploadResult> {
  return new Promise((resolve, reject) => {
    const uniAny = uni as any;
    const chooser = uniAny.chooseFile || uniAny.chooseMessageFile;
    if (!chooser) {
      reject({ message: '当前环境不支持选择文件' });
      return;
    }
    chooser({
      count: 1,
      type: 'all',
      extension: SINOSURE_UPLOAD_EXTS,
      success: (res: any) => {
        const f = res.tempFiles?.[0];
        const filePath = f?.path || f?.tempFilePath || res.tempFilePaths?.[0];
        const fileName = f?.name || 'sinosure-policy.pdf';
        const size = Number(f?.size || 0);
        if (!filePath) {
          reject({ message: '未选择文件' });
          return;
        }
        const problem = sinosureFileError(fileName, size || 1);
        if (problem) {
          reject({ message: problem });
          return;
        }
        uni.uploadFile({
          url: BASE + `/cases/${caseId}/nodes/N3/sinosure/upload`,
          filePath,
          name: 'file',
          formData: { fileName },
          header: demoHeaders(false),
          success: (up) => {
            let data: any = up.data;
            try {
              if (typeof data === 'string') data = JSON.parse(data);
            } catch {
              /* 保留原文 */
            }
            if (up.statusCode >= 200 && up.statusCode < 300) resolve(data as SinosureUploadResult);
            else reject(data || { message: '保单上传失败' });
          },
          fail: (err) => reject(err),
        });
      },
      fail: (err: any) => reject(err?.errMsg ? { message: '未选择文件' } : err),
    });
  });
}

function request<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE + url,
      method: method as any,
      data: data as any,
      header: demoHeaders(true),
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
  screen: (id: string) => request('POST', `/cases/${id}/nodes/N3/screen`),
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
  saveShipment: (id: string, body: unknown, batchId?: string) =>
    request('POST', withBatch(`/cases/${id}/nodes/N6/shipment`, batchId), body),
  saveDocument: (id: string, body: unknown, batchId?: string) =>
    request('POST', withBatch(`/cases/${id}/nodes/N7/documents`, batchId), body),
  saveFix: (id: string, body: unknown, batchId?: string) =>
    request('POST', withBatch(`/cases/${id}/nodes/N7/fixes`, batchId), body),
  saveSettlement: (id: string, body: unknown, batchId?: string) =>
    request('POST', withBatch(`/cases/${id}/nodes/N9/settlement`, batchId), body),
  createBatch: (id: string, body: unknown) => request('POST', `/cases/${id}/batches`, body),
  saveTaxRebate: (id: string, body: unknown) => request('POST', `/cases/${id}/tax-rebate`, body),
  declareTaxRebate: (id: string) => request('POST', `/cases/${id}/tax-rebate/declare`),
  gate: (id: string, code: string, batchId?: string) =>
    request('GET', withBatch(`/cases/${id}/nodes/${code}/gate`, batchId)),
  advance: (id: string, code: string, batchId?: string) =>
    request('POST', withBatch(`/cases/${id}/nodes/${code}/advance`, batchId)),
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

const NODE_FLOW = ['N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N9'];

/** 已退出的 N8 排在 N7 与 N9 之间，避免历史 currentNode 从列表和跳转里消失。 */
function flowIndex(code?: string | null): number {
  const c = String(code || '').toUpperCase();
  if (c === 'N8') {
    const n7 = NODE_FLOW.indexOf('N7');
    return n7 < 0 ? -1 : n7 + 0.5;
  }
  return NODE_FLOW.indexOf(c);
}

/** 历史报关放行改指向收汇。 */
export function activePipelineNode(code?: string | null): string {
  const c = String(code || '').toUpperCase();
  return c === 'N8' ? 'N9' : c;
}

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
  N2: '报价环节',
  N3: '销售合同/订单确认',
  N4: '变更管理',
  N5: '采购合同/国内备货',
  N6: '装运/提单指示',
  N7: '单证一致性',
  N9: '收汇对账',
};

export function pipelineNodeName(code?: string | null) {
  const active = activePipelineNode(code);
  return (active && NODE_LABELS[active]) || active || '';
}

/** 与闸门 nextNode 一致：N3 无变更单则跳过 N4；N7 下一步是 N9。 */
export function nextPipelineNode(current: string, hasChangeOrders = false): string | null {
  const code = String(current || '').toUpperCase();
  if (code === 'N8') return 'N9';
  const i = NODE_FLOW.indexOf(code);
  if (i < 0 || i === NODE_FLOW.length - 1) return null;
  if (code === 'N3' && !hasChangeOrders) return 'N5';
  return NODE_FLOW[i + 1];
}

export type PipelineNodeTarget = { code: string; name: string };

/**
 * 合同管理表单（销售 N3 / 采购 N5）离开后应打开的下一业务节点。
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
  const shown = activePipelineNode(current);
  const fi = flowIndex(formNode);
  const ci = flowIndex(current);
  if (fi >= 0 && ci > fi) return { code: shown, name: pipelineNodeName(shown) };

  const hasChangeOrders = (input.changeOrderCount ?? input.changeOrders?.length ?? 0) > 0;
  const next = nextPipelineNode(formNode, hasChangeOrders);
  if (!next) return null;
  return { code: next, name: pipelineNodeName(next) };
}

/** 列表卡片：本案已离开本表单节点时才给出跳转按钮。 */
export function listShowsNextNodeButton(formNode: string, currentNode?: string | null) {
  const fi = flowIndex(formNode);
  const ci = flowIndex(currentNode);
  return fi >= 0 && ci > fi;
}

/** 装运及后续（N6–N9）属于出口案，不在采购合同入口办理。 */
export function isN6PlusNode(code?: string | null) {
  const i = flowIndex(code);
  return i >= 0 && i >= flowIndex('N6');
}

const N6_PLUS_SHORT: Record<string, string> = {
  N6: '装运',
  N7: '单证',
  N9: '收汇',
};

export function exportCaseShortAction(code?: string | null) {
  if (!code) return '装运';
  return N6_PLUS_SHORT[code] || pipelineNodeName(code) || '装运';
}

/**
 * 合同管理跳转按钮文案。
 * 销售入口保持「进入下一节点」；采购入口若下一跳是 N6+，改为出口案办理，避免把装运后续当成采购合同步骤。
 */
export function formNextNodeButtonLabel(
  formNode: string,
  target?: { code: string; name: string } | null,
) {
  if (!target) return '';
  if (formNode === 'N5' && isN6PlusNode(target.code)) {
    return `去办${exportCaseShortAction(target.code)}（出口案）`;
  }
  return `进入下一节点 · ${target.code} ${target.name}`;
}

export function formNextNodeHeading(formNode: string) {
  if (formNode === 'N5') return '出口案后续（不属于本采购合同）';
  return '';
}

export const BATCH_PICK_PAGE = '/pages/node/batches';

/** 进入装运前的批次选择页。code 为 N7/N9 时，选定批次后打开该节点（未到达则仍从装运进入）。 */
export function batchPickUrl(caseId: string, openCode?: string | null) {
  const code = String(openCode || '').toUpperCase();
  const extra = code === 'N7' || code === 'N9' ? `&code=${code}` : '';
  return `${BATCH_PICK_PAGE}?id=${caseId}${extra}`;
}

const BATCH_NODE_ORDER = ['N6', 'N7', 'N9'];

/** 选定批次后要打开的节点。默认进入该批 N6；若指定了更后的节点且本批尚未到达，则停在本批当前节点。 */
export function batchOpenCode(batch: { currentNode?: string | null } | null | undefined, requested?: string | null) {
  const raw = String(batch?.currentNode || 'N6').toUpperCase();
  const current = raw === 'DONE' ? 'N9' : BATCH_NODE_ORDER.includes(raw) ? raw : 'N6';
  const wanted = String(requested || 'N6').toUpperCase();
  const target = BATCH_NODE_ORDER.includes(wanted) ? wanted : 'N6';
  if (BATCH_NODE_ORDER.indexOf(target) > BATCH_NODE_ORDER.indexOf(current)) return current;
  return target;
}

/**
 * 未带 batchId 的装运（N6）先进入批次选择/新建页，避免打开空白装运页。
 * 已选定批次后才进入该批的 N6，再由此到 N7、N9。
 */
export function nodeEntryUrl(caseId: string, code: string, batchId?: string | null) {
  const active = activePipelineNode(code);
  if (active === 'N6' && !batchId) return batchPickUrl(caseId);
  const batch = batchId ? `&batchId=${encodeURIComponent(batchId)}` : '';
  return `${nodePage(active)}?id=${caseId}&code=${active}${batch}`;
}

export function goToNode(caseId: string, code: string, batchId?: string) {
  uni.navigateTo({ url: nodeEntryUrl(caseId, code, batchId) });
}

export function hasReachedNode(currentNode?: string | null, target = 'N3') {
  const i = flowIndex(currentNode);
  const t = flowIndex(target);
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
  if (code === 'N1' || code === 'N2') return '/pages/node/quote';
  if (code === 'N3') return '/pages/node/contract';
  if (code === 'N4') return '/pages/node/change';
  if (code === 'N5') return '/pages/node/procurement';
  if (code === 'N6') return '/pages/node/shipment';
  if (code === 'N7') return '/pages/node/docs';
  if (code === 'N8' || code === 'N9') return '/pages/node/settlement';
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

export const SALES_CURRENCY = 'USD';
export const SALES_CURRENCY_OPTIONS = ['CNY', 'USD'] as const;
export const PROCUREMENT_CURRENCY = 'CNY';
export const CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP = '人民币合同暂不计入美元占用';

export function money(fen?: number | null, currency = SALES_CURRENCY) {
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

export function gradeClass(g?: string | null) {
  if (g === 'S' || g === 'A') return 'badge-pass';
  if (g === 'B') return 'badge-soft';
  if (g === 'C') return 'badge-review';
  if (g === 'D') return 'badge-block';
  return 'badge-stub';
}

export function pctText(v?: number | null) {
  if (v == null || !Number.isFinite(Number(v))) return '暂缺';
  return `${Math.round(Number(v) * 1000) / 10}%`;
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

export function previewExposure(base: any, newAmountFen: number, newCurrency?: string | null) {
  if (!base) return null;
  const openUnpaidFen = Number(base.openUnpaidFen) || 0;
  const fulfilledUnpaidFen = Number(base.fulfilledUnpaidFen) || 0;
  const ccy = String(newCurrency || SALES_CURRENCY).toUpperCase();
  const countNew = ccy === 'USD';
  const rawNew = Math.max(0, Number(newAmountFen) || 0);
  const newFen = countNew ? rawNew : 0;
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
  const currency = 'USD';
  const notes = [...(base.notes || [])];
  if (!countNew && rawNew > 0 && !notes.includes(CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP)) {
    notes.push(`${CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP}（原币 ${money(rawNew, ccy)}）`);
  }
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
    notes,
    summary:
      insuredLimitFen == null
        ? '尚未登记投保限额。'
        : excessFen > 0
          ? `占用 ${money(occupancyFen, currency)}，限额 ${money(insuredLimitFen, currency)}，超额 ${money(excessFen, currency)}（${bandLabel}）`
          : `占用 ${money(occupancyFen, currency)}，限额 ${money(insuredLimitFen, currency)}，剩余额度 ${money(remainingFen, currency)}`,
  };
}
