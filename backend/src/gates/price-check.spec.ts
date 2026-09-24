import { isPriceCheckSkipped, priceBenchmarkFromRows } from './price-check';

describe('N2 价格比对是否跳过', () => {
  it('底价和参考价都没有时跳过', () => {
    const bench = priceBenchmarkFromRows(null, []);
    expect(bench).toEqual({ costFloorFen: null, historyUnitPrices: [] });
    expect(isPriceCheckSkipped(bench)).toBe(true);
  });

  it('只有底价时不跳过', () => {
    expect(isPriceCheckSkipped(priceBenchmarkFromRows({ floorFen: 400000 }, []))).toBe(false);
  });

  it('只有参考价时不跳过', () => {
    expect(isPriceCheckSkipped(priceBenchmarkFromRows(null, [{ unitPriceFen: 520000 }]))).toBe(false);
  });

  it('两者都有时不跳过', () => {
    expect(
      isPriceCheckSkipped(priceBenchmarkFromRows({ floorFen: 1000000 }, [{ unitPriceFen: 1200000 }])),
    ).toBe(false);
  });

  it('底价为 0 仍视为已配置，不提示跳过', () => {
    expect(isPriceCheckSkipped(priceBenchmarkFromRows({ floorFen: 0 }, []))).toBe(false);
  });

  it('缺省历史价视为没有参考价', () => {
    expect(isPriceCheckSkipped({ costFloorFen: null, historyUnitPrices: null })).toBe(true);
    expect(isPriceCheckSkipped({})).toBe(true);
  });
});
