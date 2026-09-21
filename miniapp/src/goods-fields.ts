/** 与后端 goods-fields 对齐：展示回填剔除默认「机械」。 */
export const FORBIDDEN_GOODS_NAME_DEFAULTS = ['机械'];

export function displayGoodsName(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (FORBIDDEN_GOODS_NAME_DEFAULTS.includes(s)) return '';
  return s;
}

export function displayGoodsSpec(raw?: string | null): string {
  return String(raw ?? '').trim();
}

export function resolveCarriedGoods(input: {
  contract?: { goodsDesc?: string | null; goodsSpec?: string | null } | null;
  quote?: {
    goodsDesc?: string | null;
    goodsSpec?: string | null;
    snapshot?: { goodsDesc?: string | null; goodsSpec?: string | null } | null;
  } | null;
  caseGoodsDesc?: string | null;
  caseGoodsSpec?: string | null;
}): { goodsDesc: string; goodsSpec: string } {
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

export const CONTRACT_UNIT_LABEL: Record<string, string> = { TON: '吨', KG: '千克' };

export function parseContractUnit(raw?: string | null): 'TON' | 'KG' | '' {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const n = s.replace(/\s+/g, '').toUpperCase();
  if (n === 'KG' || s === '千克' || s === '公斤') return 'KG';
  if (n === 'TON' || s === '吨' || /套|台|件|箱/.test(s)) return 'TON';
  return '';
}
