import { BadRequestException } from '@nestjs/common';
import {
  CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP,
  PROCUREMENT_CURRENCY,
  SALES_CURRENCY,
  isLockedCurrency,
  isSalesCurrency,
  normalizeCurrency,
  requireLockedCurrency,
  requireProcurementCurrency,
  requireSalesCurrency,
  requireSinosureLimitCurrency,
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
      required?: string;
      received: string;
      allowed?: string[];
    };
  }
}

describe('销售可选币种 / 采购锁定人民币 / 中信保限额美元', () => {
  it('normalize 去空白并大写', () => {
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(normalizeCurrency('cny')).toBe('CNY');
    expect(normalizeCurrency(null)).toBe('');
  });

  it('销售允许 CNY / USD，省略默认 USD', () => {
    expect(isSalesCurrency('cny')).toBe(true);
    expect(isSalesCurrency('USD')).toBe(true);
    expect(isSalesCurrency('EUR')).toBe(false);
    expect(requireSalesCurrency(undefined)).toBe('USD');
    expect(requireSalesCurrency('')).toBe('USD');
    expect(requireSalesCurrency('cny')).toBe('CNY');
    expect(requireSalesCurrency('usd', '出口案件')).toBe('USD');
    const r = lockedResponse(() => requireSalesCurrency('EUR'));
    expect(r.code).toBe('CURRENCY_UNSUPPORTED');
    expect(r.allowed).toEqual(['CNY', 'USD']);
    expect(r.received).toBe('EUR');
    expect(r.message).toContain('销售合同');
  });

  it('中信保限额仍锁定美元', () => {
    expect(requireSinosureLimitCurrency(undefined)).toBe('USD');
    expect(requireSinosureLimitCurrency('usd')).toBe('USD');
    const sino = lockedResponse(() => requireSinosureLimitCurrency('CNY'));
    expect(sino.code).toBe('CURRENCY_LOCKED');
    expect(sino.required).toBe(SALES_CURRENCY);
    expect(sino.received).toBe('CNY');
    expect(sino.message).toContain('中信保限额');
  });

  it('采购合同 / PO：省略则写 CNY，非 CNY 拒绝保存', () => {
    expect(isLockedCurrency('cny', PROCUREMENT_CURRENCY)).toBe(true);
    expect(isLockedCurrency('USD', PROCUREMENT_CURRENCY)).toBe(false);
    expect(requireProcurementCurrency(undefined)).toBe('CNY');
    expect(requireProcurementCurrency('cny')).toBe('CNY');
    const r = lockedResponse(() => requireProcurementCurrency('USD'));
    expect(r.code).toBe('CURRENCY_LOCKED');
    expect(r.required).toBe('CNY');
    expect(r.received).toBe('USD');
    expect(r.message).toContain('采购合同');
  });

  it('人民币占用提示文案固定', () => {
    expect(CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP).toBe('人民币合同暂不计入美元占用');
  });
});
