/**
 * N2 价格比对用的底价 / 历史参考价。
 * 与 gate.service 快照同一套映射：按品名归一后查到的 CostFloor.floorFen、HistoricalPrice.unitPriceFen。
 * 两张表都没有命中时，闸门不会做价格比对。
 */
export type PriceBenchmark = {
  costFloorFen: number | null;
  historyUnitPrices: number[];
};

export function priceBenchmarkFromRows(
  floor: { floorFen: number } | null | undefined,
  history: readonly { unitPriceFen: number }[] | null | undefined,
): PriceBenchmark {
  return {
    costFloorFen: floor?.floorFen ?? null,
    historyUnitPrices: (history ?? []).map((row) => row.unitPriceFen),
  };
}

/** 底价与参考价都查不到时为 true。任一有配置（含底价为 0）则为 false。 */
export function isPriceCheckSkipped(bench: {
  costFloorFen?: number | null;
  historyUnitPrices?: readonly number[] | null;
}): boolean {
  const hasFloor = bench.costFloorFen != null;
  const hasHistory = (bench.historyUnitPrices?.length ?? 0) > 0;
  return !hasFloor && !hasHistory;
}
