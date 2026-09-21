import {
  QuoteIncludedItem,
  QuoteIncludedItemLabel,
  QuotePriceUnit,
  QUOTE_INCLUDED_ITEM_CODES,
  QUOTE_PRICE_UNIT_CODES,
} from '../common/constants';

const ITEM_ALIAS: Record<string, string> = {
  OCEAN_FREIGHT: QuoteIncludedItem.OCEAN_FREIGHT,
  INLAND_FREIGHT: QuoteIncludedItem.INLAND_FREIGHT,
  PORT_CHARGES: QuoteIncludedItem.PORT_CHARGES,
  海运费: QuoteIncludedItem.OCEAN_FREIGHT,
  海运: QuoteIncludedItem.OCEAN_FREIGHT,
  陆运费: QuoteIncludedItem.INLAND_FREIGHT,
  陆运: QuoteIncludedItem.INLAND_FREIGHT,
  港杂: QuoteIncludedItem.PORT_CHARGES,
  港杂费: QuoteIncludedItem.PORT_CHARGES,
};

const UNIT_ALIAS: Record<string, string> = {
  TON: QuotePriceUnit.TON,
  KG: QuotePriceUnit.KG,
  吨: QuotePriceUnit.TON,
  千克: QuotePriceUnit.KG,
  公斤: QuotePriceUnit.KG,
};

function normKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function itemFromToken(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const direct = ITEM_ALIAS[s] || ITEM_ALIAS[normKey(s)];
  if (direct) return direct;
  for (const [alias, code] of Object.entries(ITEM_ALIAS)) {
    if (alias && s.includes(alias)) return code;
  }
  return null;
}

function collectCodes(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const code = itemFromToken(v);
    if (code && QUOTE_INCLUDED_ITEM_CODES.includes(code as (typeof QUOTE_INCLUDED_ITEM_CODES)[number]) && !out.includes(code)) {
      out.push(code);
    }
  }
  return out;
}

/**
 * 所含项目：新数据为 JSON 数组（OCEAN_FREIGHT / INLAND_FREIGHT / PORT_CHARGES），
 * 旧自由文本（如「海运费、出口报关费」）按关键字迁移。
 */
export function parseQuoteIncludedItems(raw?: string | string[] | null): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return collectCodes(raw);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return collectCodes(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)) {
      return collectCodes((parsed as { items: unknown[] }).items);
    }
  } catch {
    /* 旧字符串 */
  }
  return collectCodes(s.split(/[,，、;；/|]+/));
}

export function serializeQuoteIncludedItems(codes: string[]): string {
  return JSON.stringify(collectCodes(codes));
}

export function quoteIncludedItemLabels(codes: string[]): string {
  return codes.map((c) => QuoteIncludedItemLabel[c] || c).join('、');
}

export function parseQuotePriceUnit(raw?: string | null): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const code = UNIT_ALIAS[s] || UNIT_ALIAS[normKey(s)] || null;
  if (code && QUOTE_PRICE_UNIT_CODES.includes(code as (typeof QUOTE_PRICE_UNIT_CODES)[number])) return code;
  return null;
}

export function isQuotePriceUnit(raw?: string | null): boolean {
  return parseQuotePriceUnit(raw) != null;
}
