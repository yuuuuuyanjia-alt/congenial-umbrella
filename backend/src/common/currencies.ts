import { BadRequestException } from '@nestjs/common';

/** 销售合同 / 出口案件金额默认美元；可选人民币。 */
export const SALES_CURRENCY = 'USD';

export const SALES_CURRENCY_OPTIONS = ['CNY', 'USD'] as const;

export type SalesCurrencyCode = (typeof SALES_CURRENCY_OPTIONS)[number];

/** 采购合同 / PO 金额：固定人民币。 */
export const PROCUREMENT_CURRENCY = 'CNY';

/** 中信保占用不换汇；人民币合同展示用。 */
export const CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP = '人民币合同暂不计入美元占用';

export function normalizeCurrency(raw?: string | null): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function isSalesCurrency(raw?: string | null): raw is SalesCurrencyCode {
  const n = normalizeCurrency(raw);
  return n === 'USD' || n === 'CNY';
}

export function isLockedCurrency(raw: string | null | undefined, required: string): boolean {
  const n = normalizeCurrency(raw);
  return !n || n === required.toUpperCase();
}

/**
 * 省略或空串视为采用锁定币种；已填且与锁定值不符则拒绝保存。
 */
export function requireLockedCurrency(
  raw: string | null | undefined,
  required: string,
  label: string,
): string {
  const n = normalizeCurrency(raw);
  if (!n || n === required.toUpperCase()) return required;
  throw new BadRequestException({
    code: 'CURRENCY_LOCKED',
    message: `${label}币种须为 ${required}，已锁定不可改为 ${String(raw).trim()}`,
    required,
    received: String(raw).trim(),
  });
}

/** 销售/出口/报价：可选 CNY 或 USD；省略默认 USD。 */
export function requireSalesCurrency(raw?: string | null, label = '销售合同'): string {
  const n = normalizeCurrency(raw);
  if (!n) return SALES_CURRENCY;
  if (n === 'USD' || n === 'CNY') return n;
  throw new BadRequestException({
    code: 'CURRENCY_UNSUPPORTED',
    message: `${label}币种须为 CNY 或 USD，不能为 ${String(raw).trim()}`,
    allowed: [...SALES_CURRENCY_OPTIONS],
    received: String(raw).trim(),
  });
}

export function requireSinosureLimitCurrency(raw?: string | null, label = '中信保限额'): string {
  return requireLockedCurrency(raw, SALES_CURRENCY, label);
}

export function requireProcurementCurrency(raw?: string | null, label = '采购合同'): string {
  return requireLockedCurrency(raw, PROCUREMENT_CURRENCY, label);
}
