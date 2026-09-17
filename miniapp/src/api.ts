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
  cases: () => request('GET', '/cases'),
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
  suppliers: () => request('GET', '/suppliers'),
  supplier: (id: string) => request('GET', `/suppliers/${id}`),
};

export function decisionClass(d?: string | null) {
  if (d === 'HARD_BLOCK' || d === 'BLOCKED' || d === 'HIGH') return 'badge-block';
  if (d === 'REVIEW' || d === 'MEDIUM') return 'badge-review';
  if (d === 'SOFT_ALERT' || d === 'LOW') return 'badge-soft';
  if (d === 'PASS' || d === 'PASSED' || d === 'COMPLETED') return 'badge-pass';
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
    FALSE_POSITIVE: '误报排除',
    CONFIRMED_TRUE: '确认真实',
    SUPPLEMENTED: '已补充',
    MONITORING: '持续监控',
    OVERDUE_SETTLEMENT: '逾期收汇',
    OPEN_SETTLEMENT: '收汇未到期',
  };
  return (d && map[d]) || d || '-';
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
