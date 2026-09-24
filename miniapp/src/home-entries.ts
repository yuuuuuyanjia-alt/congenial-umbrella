/** 与 lane-nav 的首页地址保持一致；这里写字面量，避免小程序构建去解析 .ts 后缀。 */
const SHIPMENT_HOME_URL = '/pages/export/pick?lane=shipment';
const DOCS_HOME_URL = '/pages/export/pick?lane=docs';
const REMIT_HOME_URL = '/pages/export/pick?lane=remit';
const FEE_HOME_URL = '/pages/fee/pick';

export type HomeEntry = { url: string; label: string };

export const HOME_ENTRIES: Record<string, HomeEntry[]> = {
  SALES: [
    { url: '/pages/case/list?kind=sales', label: '销售合同' },
    { url: '/pages/case/list?kind=procurement', label: '采购合同' },
    { url: SHIPMENT_HOME_URL, label: '出运管理' },
    { url: DOCS_HOME_URL, label: '单证管理' },
    { url: REMIT_HOME_URL, label: '收汇管理' },
    { url: FEE_HOME_URL, label: '费用管理' },
    { url: '/pages/supplier/list', label: '供应商管理' },
    { url: '/pages/customer/list', label: '客户管理' },
    { url: '/pages/risk/mine', label: '我的风险和补件' },
  ],
  RISK: [
    { url: '/pages/case/list?kind=sales', label: '销售合同' },
    { url: '/pages/case/list?kind=procurement', label: '采购合同' },
    { url: SHIPMENT_HOME_URL, label: '出运管理' },
    { url: DOCS_HOME_URL, label: '单证管理' },
    { url: REMIT_HOME_URL, label: '收汇管理' },
    { url: FEE_HOME_URL, label: '费用管理' },
    { url: '/pages/customer/list', label: '客户管理' },
    { url: '/pages/supplier/list', label: '供应商管理' },
  ],
  MANAGER: [
    { url: '/pages/customer/list', label: '客户管理' },
    { url: '/pages/case/list?kind=sales', label: '销售合同' },
    { url: '/pages/case/list?kind=procurement', label: '采购合同' },
    { url: SHIPMENT_HOME_URL, label: '出运管理' },
    { url: DOCS_HOME_URL, label: '单证管理' },
    { url: REMIT_HOME_URL, label: '收汇管理' },
    { url: FEE_HOME_URL, label: '费用管理' },
    { url: '/pages/supplier/list', label: '供应商管理' },
  ],
};

export function isContractHomeEntry(e: { url: string }) {
  return /\/pages\/case\/list\?kind=(sales|procurement)/.test(e.url);
}

export function isLaneHomeEntry(e: { url: string }) {
  return (
    e.url === SHIPMENT_HOME_URL ||
    e.url === DOCS_HOME_URL ||
    e.url === REMIT_HOME_URL ||
    e.url === FEE_HOME_URL
  );
}

function pairKey(e: HomeEntry): string | null {
  if (isContractHomeEntry(e)) return 'contracts';
  if (isLaneHomeEntry(e)) return 'lanes';
  return null;
}

export type HomeEntryBlock = { type: 'pair' | 'btn'; items: HomeEntry[] };

export function homeEntriesFor(role?: string | null) {
  return HOME_ENTRIES[role || 'SALES'] || HOME_ENTRIES.SALES;
}

/** 连续的销售/采购、出运/单证/收汇/费用各自排成一行，其余入口单独成行。 */
export function homeEntryBlocks(role?: string | null): HomeEntryBlock[] {
  const blocks: HomeEntryBlock[] = [];
  let key: string | null = null;
  let pair: HomeEntry[] = [];
  const flush = () => {
    if (!pair.length) return;
    blocks.push({ type: 'pair', items: pair });
    pair = [];
    key = null;
  };
  for (const e of homeEntriesFor(role)) {
    const next = pairKey(e);
    if (next && next === key) {
      pair.push(e);
      continue;
    }
    if (next) {
      flush();
      key = next;
      pair = [e];
      continue;
    }
    flush();
    blocks.push({ type: 'btn', items: [e] });
  }
  flush();
  return blocks;
}
