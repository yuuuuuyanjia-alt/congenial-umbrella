import { BadRequestException } from '@nestjs/common';
import {
  PROCUREMENT_CURRENCY,
  SALES_CURRENCY,
  isLockedCurrency,
  normalizeCurrency,
  requireLockedCurrency,
  requireProcurementCurrency,
  requireSalesCurrency,
} from './currencies';

function lockedResponse(fn: () => unknown) {
  try {
    fn();
    throw new Error('expected CURRENCY_LOCKED');
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return (e as BadRequestException).getResponse() as {
      code: string;
      message: string;
      required: string;
      received: string;
    };
  }
}

describe('锁定合同币种', () => {
  it('normalize 去空白并大写', () => {
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(normalizeCurrency('cny')).toBe('CNY');
    expect(normalizeCurrency(null)).toBe('');
  });

  it('省略或同值视为符合锁定币种', () => {
    expect(isLockedCurrency(undefined, SALES_CURRENCY)).toBe(true);
    expect(isLockedCurrency('', SALES_CURRENCY)).toBe(true);
    expect(isLockedCurrency('usd', SALES_CURRENCY)).toBe(true);
    expect(isLockedCurrency('CNY', SALES_CURRENCY)).toBe(false);
    expect(isLockedCurrency('cny', PROCUREMENT_CURRENCY)).toBe(true);
    expect(isLockedCurrency('USD', PROCUREMENT_CURRENCY)).toBe(false);
  });

  it('销售 / 出口 / 中信保：省略则写 USD，非 USD 拒绝保存', () => {
    expect(requireSalesCurrency(undefined)).toBe('USD');
    expect(requireSalesCurrency('')).toBe('USD');
    expect(requireSalesCurrency('usd')).toBe('USD');
    expect(requireSalesCurrency('USD', '出口案件')).toBe('USD');
    const r = lockedResponse(() => requireSalesCurrency('CNY'));
    expect(r.code).toBe('CURRENCY_LOCKED');
    expect(r.required).toBe('USD');
    expect(r.received).toBe('CNY');
    expect(r.message).toContain('销售合同');
    expect(r.message).toContain('USD');
    const sino = lockedResponse(() => requireLockedCurrency('EUR', SALES_CURRENCY, '中信保限额'));
    expect(sino.message).toContain('中信保限额');
    expect(sino.received).toBe('EUR');
  });

  it('采购合同 / PO：省略则写 CNY，非 CNY 拒绝保存', () => {
    expect(requireProcurementCurrency(undefined)).toBe('CNY');
    expect(requireProcurementCurrency('cny')).toBe('CNY');
    const r = lockedResponse(() => requireProcurementCurrency('USD'));
    expect(r.code).toBe('CURRENCY_LOCKED');
    expect(r.required).toBe('CNY');
    expect(r.received).toBe('USD');
    expect(r.message).toContain('采购合同');
  });
});
