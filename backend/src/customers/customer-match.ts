import { NODE_FLOW, NodeStatus } from '../common/constants';
import { normalizeName } from '../screening/matcher';

export type CustomerMatchInput = {
  name: string;
  country?: string | null;
  registrationNo?: string | null;
};

export type CustomerMatchRow = CustomerMatchInput & {
  id: string;
  nameKey?: string | null;
  countryKey?: string | null;
  registrationKey?: string | null;
};

/** 规范化客户名称：忽略大小写/标点，去掉 GmbH、Ltd、有限公司 等法律后缀。 */
export function nameKey(raw: string): string {
  const stripped = normalizeName(raw || '');
  if (stripped) return stripped;
  return (raw || '').toUpperCase().replace(/[.,'"()`/\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 国家/地区码：去空白并大写。空则视为未填。 */
export function countryKey(raw?: string | null): string {
  return (raw || '').trim().toUpperCase();
}

/** 注册号/税号：去空白、连字符与点，并大写。空则视为未填。 */
export function registrationKey(raw?: string | null): string | null {
  const v = (raw || '').trim().toUpperCase().replace(/[\s.\-_/]/g, '');
  return v || null;
}

export function keysOf(input: CustomerMatchInput) {
  return {
    nameKey: nameKey(input.name),
    countryKey: countryKey(input.country),
    registrationKey: registrationKey(input.registrationNo),
  };
}

/**
 * 客户合并匹配：
 * 1. 若填写了注册号/税号，按规范化号码精确匹配（优先）。
 * 2. 否则按「规范化名称 + 国家」匹配。
 * 3. 未填国家时，仅当该规范化名称全局唯一才合并。
 * 4. 名称+国家命中但双方税号均已填且不一致 → 不合并（视为不同主体）。
 */
export function pickMatchingCustomer<T extends CustomerMatchRow>(
  rows: T[],
  input: CustomerMatchInput,
): T | null {
  const name = (input.name || '').trim();
  if (!name) return null;
  const incoming = keysOf(input);

  if (incoming.registrationKey) {
    const byReg = rows.find((r) => rowRegistrationKey(r) === incoming.registrationKey);
    if (byReg) return byReg;
  }

  const nameMatches = rows.filter((r) => rowNameKey(r) === incoming.nameKey);
  if (!nameMatches.length) return null;

  if (incoming.countryKey) {
    const byCountry = nameMatches.find((r) => rowCountryKey(r) === incoming.countryKey);
    if (byCountry && registrationConflict(byCountry, incoming.registrationKey)) return null;
    if (byCountry) return byCountry;
    return null;
  }

  if (nameMatches.length === 1) {
    if (registrationConflict(nameMatches[0], incoming.registrationKey)) return null;
    return nameMatches[0];
  }
  return null;
}

function rowNameKey(row: CustomerMatchRow): string {
  return (row.nameKey && row.nameKey.trim()) || nameKey(row.name);
}

function rowCountryKey(row: CustomerMatchRow): string {
  if (row.countryKey != null && row.countryKey !== '') return row.countryKey;
  return countryKey(row.country);
}

function rowRegistrationKey(row: CustomerMatchRow): string | null {
  if (row.registrationKey) return row.registrationKey;
  return registrationKey(row.registrationNo);
}

function registrationConflict(row: CustomerMatchRow, incomingReg: string | null): boolean {
  const existing = rowRegistrationKey(row);
  return !!(incomingReg && existing && incomingReg !== existing);
}

/** 案件是否已到达合同/订单确认（N3）或之后。 */
export function hasReachedN3(currentNode?: string | null, n3Status?: string | null): boolean {
  const i = NODE_FLOW.indexOf((currentNode || '') as (typeof NODE_FLOW)[number]);
  const n3 = NODE_FLOW.indexOf('N3');
  if (i >= n3 && n3 >= 0) return true;
  return !!n3Status && n3Status !== NodeStatus.NOT_STARTED && n3Status !== NodeStatus.STUB_TODO;
}

export function fillBlank(existing?: string | null, incoming?: string | null): string | null {
  const e = (existing || '').trim();
  if (e) return existing ?? e;
  const v = (incoming || '').trim();
  return v || null;
}
