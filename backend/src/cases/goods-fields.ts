import { parseQuotePriceUnit } from './quote-fields';

/** 询盘/报价/合同共用的货物名称禁止占位默认值。 */
export const FORBIDDEN_GOODS_NAME_DEFAULTS = ['机械'] as const;

export function displayGoodsName(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if ((FORBIDDEN_GOODS_NAME_DEFAULTS as readonly string[]).includes(s)) return '';
  return s;
}

export function displayGoodsSpec(raw?: string | null): string {
  return String(raw ?? '').trim();
}

export type GoodsCarryInput = {
  contract?: { goodsDesc?: string | null; goodsSpec?: string | null } | null;
  quote?: {
    goodsDesc?: string | null;
    goodsSpec?: string | null;
    snapshot?: { goodsDesc?: string | null; goodsSpec?: string | null } | null;
  } | null;
  caseGoodsDesc?: string | null;
  caseGoodsSpec?: string | null;
};

/**
 * 贯通顺序：合同 → 报价 → 报价快照 → 案件。
 * 「机械」只在展示回填时剔除，保存原文仍照收。
 */
/**
 * N3 与 N5 各自保存货物名称/规格。
 * own 字段为 null/undefined 时才用 fallback（报价带入 N3、销售合同暂作 N5 默认）。
 * 已写入的值（含空字符串）不再被另一侧覆盖。
 */
export function resolveIndependentGoods(
  own: { goodsDesc?: string | null; goodsSpec?: string | null } | null | undefined,
  fallback?: { goodsDesc?: string | null; goodsSpec?: string | null } | null,
): { goodsDesc: string; goodsSpec: string } {
  const descOwned = !!own && own.goodsDesc != null;
  const specOwned = !!own && own.goodsSpec != null;
  return {
    goodsDesc: displayGoodsName(descOwned ? own!.goodsDesc : fallback?.goodsDesc),
    goodsSpec: displayGoodsSpec(specOwned ? own!.goodsSpec : fallback?.goodsSpec),
  };
}

export function resolveCarriedGoods(input: GoodsCarryInput): { goodsDesc: string; goodsSpec: string } {
  const quote = input.quote;
  return {
    goodsDesc: displayGoodsName(
      input.contract?.goodsDesc ||
        quote?.goodsDesc ||
        quote?.snapshot?.goodsDesc ||
        input.caseGoodsDesc,
    ),
    goodsSpec: displayGoodsSpec(
      input.contract?.goodsSpec ||
        quote?.goodsSpec ||
        quote?.snapshot?.goodsSpec ||
        input.caseGoodsSpec,
    ),
  };
}

export type TtVoucher = { ref?: string | null; fileName?: string | null };

export function parseTtVouchers(raw?: string | null | TtVoucher[]): TtVoucher[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => ({
        ref: String(v?.ref || '').trim(),
        fileName: String(v?.fileName || '').trim() || null,
      }))
      .filter((v) => v.ref || v.fileName);
  }
  try {
    const parsed = JSON.parse(raw);
    return parseTtVouchers(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function stringifyTtVouchers(rows?: TtVoucher[] | null): string | null {
  const list = parseTtVouchers(rows || []);
  return list.length ? JSON.stringify(list) : null;
}

/** 合同数量单位与报价一致：吨 / 千克。套/台等旧值回退为吨。 */
export function parseContractUnit(raw?: string | null): string | null {
  const parsed = parseQuotePriceUnit(raw);
  if (parsed) return parsed;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/套|台|件|箱/.test(s)) return 'TON';
  return null;
}
