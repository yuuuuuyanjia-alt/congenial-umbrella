import { BadRequestException } from '@nestjs/common';

/** 销售合同 / 出口案件金额 / 中信保占用：固定美元。 */
export const SALES_CURRENCY = 'USD';

/** 采购合同 / PO 金额：固定人民币。 */
export const PROCUREMENT_CURRENCY = 'CNY';

export function normalizeCurrency(raw?: string | null): string {
  return String(raw ?? '').trim().toUpperCase();
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

export function requireSalesCurrency(raw?: string | null, label = '销售合同'): string {
  return requireLockedCurrency(raw, SALES_CURRENCY, label);
}

export function requireProcurementCurrency(raw?: string | null, label = '采购合同'): string {
  return requireLockedCurrency(raw, PROCUREMENT_CURRENCY, label);
}
