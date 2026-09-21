import { CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP } from '../common/currencies';

/**
 * 中信保占用测算（演示环境以美元计，金额单位为分）。不换汇。
 *
 * 占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款 + 新签订合同金额
 * 仅美元销售计入占用；人民币合同展示原币并提示暂不计入美元占用。
 *
 * 超额分档（美元，左闭右开）：
 *   [10,000, 20,000) 中风险
 *   [20,000, 50,000) 高风险
 *   [50,000, ∞)      超高风险
 * 边界：正好 1 万→中；正好 2 万→高；正好 5 万→超高。
 * 超额不足 1 万美元仍显示超额，按软提示（不阻断）。
 */

export const EXPOSURE_CURRENCY = 'USD';

/** 分（1 USD = 100 分） */
export const EXPOSURE_BAND_FEN = {
  MEDIUM_MIN: 1_000_000, // $10,000
  HIGH_MIN: 2_000_000, // $20,000
  ULTRA_MIN: 5_000_000, // $50,000
} as const;

export const ExposureBand = {
  WITHIN_LIMIT: 'WITHIN_LIMIT',
  BELOW_MEDIUM: 'BELOW_MEDIUM',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  ULTRA_HIGH: 'ULTRA_HIGH',
} as const;

export type ExposureBandCode = (typeof ExposureBand)[keyof typeof ExposureBand];

export const ExposureBandLabel: Record<ExposureBandCode, string> = {
  WITHIN_LIMIT: '额度内',
  BELOW_MEDIUM: '超额（不足1万美元）',
  MEDIUM: '中风险',
  HIGH: '高风险',
  ULTRA_HIGH: '超高风险',
};

export const ExposureGateDecision = {
  PASS: 'PASS',
  SOFT_ALERT: 'SOFT_ALERT',
  REVIEW: 'REVIEW',
  HARD_BLOCK: 'HARD_BLOCK',
} as const;

export type ExposureGateDecisionCode =
  (typeof ExposureGateDecision)[keyof typeof ExposureGateDecision];

export const ExposureGateLabel: Record<ExposureGateDecisionCode, string> = {
  PASS: '可推进',
  SOFT_ALERT: '软提示（可推进）',
  REVIEW: '须审核后推进',
  HARD_BLOCK: '硬拦截（禁止推进）',
};

export const ContractFulfillment = {
  OPEN: 'OPEN',
  FULFILLED: 'FULFILLED',
  NONE: 'NONE',
} as const;

export type ContractFulfillmentCode = (typeof ContractFulfillment)[keyof typeof ContractFulfillment];

export interface ExposureContractInput {
  id: string;
  caseNo?: string | null;
  title?: string | null;
  hasContract: boolean;
  amountFen: number;
  currency: string;
  receivedFen: number;
  status?: string | null;
  currentNode?: string | null;
  nodes?: Array<{ code: string; status: string }>;
}

export interface ExposureLine {
  id: string;
  caseNo?: string | null;
  title?: string | null;
  amountFen: number;
  receivedFen: number;
  unpaidFen: number;
  currency: string;
  fulfillment: ContractFulfillmentCode;
}

export interface SinosureExposure {
  currency: string;
  limitCurrency: string | null;
  insuredLimitFen: number | null;
  openUnpaidFen: number;
  fulfilledUnpaidFen: number;
  newContractFen: number;
  occupancyFen: number;
  remainingFen: number;
  excessFen: number;
  band: ExposureBandCode | null;
  bandLabel: string;
  gateDecision: ExposureGateDecisionCode | null;
  gateLabel: string;
  usdBandsApply: boolean;
  currencyOk: boolean;
  formula: string;
  summary: string;
  notes: string[];
  openContracts: ExposureLine[];
  fulfilledUnpaidContracts: ExposureLine[];
  excludedNonUsd: ExposureLine[];
}

export function isUsd(currency?: string | null): boolean {
  return String(currency || '').trim().toUpperCase() === EXPOSURE_CURRENCY;
}

function nodeStatusOf(
  nodes: Array<{ code: string; status: string }> | null | undefined,
  code: string,
): string | null {
  return (nodes || []).find((n) => n.code === code)?.status ?? null;
}

/**
 * 新签占用只在 N3/N4 尚未通过时计入一次。
 * N3 已 PASSED 后本案改走未履行/已履行未回款，避免与新签金额叠算。
 */
export function shouldTreatAsNewContract(input: {
  currentNode?: string | null;
  nodes?: Array<{ code: string; status: string }> | null;
}): boolean {
  const current = String(input.currentNode || '').toUpperCase();
  if (current === 'N4') return nodeStatusOf(input.nodes, 'N4') !== 'PASSED';
  if (current === 'N3') return nodeStatusOf(input.nodes, 'N3') !== 'PASSED';
  return false;
}

/** 该节点已通过则新签金额为 0，防止闸门把本案再加一遍。 */
export function newContractFenForNode(input: {
  nodeCode: string;
  nodes?: Array<{ code: string; status: string }> | null;
  totalFen?: number | null;
}): number {
  if (nodeStatusOf(input.nodes, input.nodeCode) === 'PASSED') return 0;
  return Math.max(0, Number(input.totalFen) || 0);
}

export function occupancyNewContractOpts(
  self: {
    id: string;
    currentNode?: string | null;
    nodes?: Array<{ code: string; status: string }> | null;
    contract?: { amountFen?: number | null; currency?: string | null } | null;
    amountFen?: number | null;
    currency?: string | null;
  },
  override?: { newAmountFen?: number | null; newCurrency?: string | null },
): {
  newCaseId: string | null;
  newAmountFen: number;
  newCurrency: string;
} {
  const treatAsNew = shouldTreatAsNewContract(self);
  const amountFen =
    override?.newAmountFen != null
      ? override.newAmountFen
      : self.contract?.amountFen ?? self.amountFen ?? 0;
  const currency = override?.newCurrency || self.contract?.currency || self.currency || EXPOSURE_CURRENCY;
  return {
    newCaseId: treatAsNew ? self.id : null,
    newAmountFen: treatAsNew ? Math.max(0, Number(amountFen) || 0) : 0,
    newCurrency: currency,
  };
}

/** 已装运（N6 已过）或案件已完成 → 出口合同已履行完毕 */
export function isExportFulfilled(input: {
  status?: string | null;
  currentNode?: string | null;
  nodes?: Array<{ code: string; status: string }>;
}): boolean {
  if (String(input.status || '').toUpperCase() === 'COMPLETED') return true;
  const n6 = (input.nodes || []).find((n) => n.code === 'N6');
  if (n6?.status === 'PASSED') return true;
  const node = String(input.currentNode || '').toUpperCase();
  return node === 'N7' || node === 'N8' || node === 'N9';
}

export function unpaidFenOf(amountFen: number, receivedFen: number): number {
  return Math.max(0, (Number(amountFen) || 0) - (Number(receivedFen) || 0));
}

/** N9 收汇对账（水单/到账）是已回款唯一事实源；N3 合同上的是否收汇不计入。 */
export type SettlementLedgerInput = {
  receivedAt?: Date | string | null;
  hasRemittanceMemo?: boolean | null;
  amountFen?: number | null;
} | null | undefined;

export function receivedFenOf(settlement: SettlementLedgerInput, amountFen: number): number {
  if (!settlement) return 0;
  if (settlement.receivedAt || settlement.hasRemittanceMemo) {
    if (settlement.amountFen != null && Number.isFinite(Number(settlement.amountFen))) {
      return Math.max(0, Number(settlement.amountFen));
    }
    return settlement.receivedAt ? Math.max(0, amountFen) : 0;
  }
  return 0;
}

/** 占用「已回款」与销售列表已完成共用：N9 已登记水单或到账，且未收汇为 0。 */
export function isSettlementPaid(settlement: SettlementLedgerInput, amountFen: number): boolean {
  const receivedFen = receivedFenOf(settlement, amountFen);
  const recorded = !!(settlement && (settlement.receivedAt || settlement.hasRemittanceMemo));
  return recorded && unpaidFenOf(amountFen, receivedFen) === 0;
}

export function bandOfExcessFen(excessFen: number): ExposureBandCode {
  const excess = Math.max(0, Number(excessFen) || 0);
  if (excess <= 0) return ExposureBand.WITHIN_LIMIT;
  if (excess < EXPOSURE_BAND_FEN.MEDIUM_MIN) return ExposureBand.BELOW_MEDIUM;
  if (excess < EXPOSURE_BAND_FEN.HIGH_MIN) return ExposureBand.MEDIUM;
  if (excess < EXPOSURE_BAND_FEN.ULTRA_MIN) return ExposureBand.HIGH;
  return ExposureBand.ULTRA_HIGH;
}

export function gateDecisionOfBand(band: ExposureBandCode | null): ExposureGateDecisionCode | null {
  if (!band) return null;
  if (band === ExposureBand.WITHIN_LIMIT) return ExposureGateDecision.PASS;
  if (band === ExposureBand.HIGH) return ExposureGateDecision.REVIEW;
  if (band === ExposureBand.ULTRA_HIGH) return ExposureGateDecision.HARD_BLOCK;
  return ExposureGateDecision.SOFT_ALERT;
}

export function moneyLabel(fen: number, currency = EXPOSURE_CURRENCY): string {
  const n = (Number(fen) || 0) / 100;
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lineOf(row: ExposureContractInput, fulfillment: ContractFulfillmentCode): ExposureLine {
  const amountFen = Math.max(0, Number(row.amountFen) || 0);
  const receivedFen = Math.max(0, Number(row.receivedFen) || 0);
  return {
    id: row.id,
    caseNo: row.caseNo ?? null,
    title: row.title ?? null,
    amountFen,
    receivedFen,
    unpaidFen: unpaidFenOf(amountFen, receivedFen),
    currency: row.currency || EXPOSURE_CURRENCY,
    fulfillment,
  };
}

export function splitOccupancy(
  rows: ExposureContractInput[],
  opts?: { newCaseId?: string | null; newAmountFen?: number | null },
): {
  openUnpaidFen: number;
  fulfilledUnpaidFen: number;
  newContractFen: number;
  openContracts: ExposureLine[];
  fulfilledUnpaidContracts: ExposureLine[];
  skippedNonUsd: ExposureLine[];
} {
  const newCaseId = opts?.newCaseId || null;
  const newAmountFen = Math.max(0, Number(opts?.newAmountFen) || 0);
  const openContracts: ExposureLine[] = [];
  const fulfilledUnpaidContracts: ExposureLine[] = [];
  const skippedNonUsd: ExposureLine[] = [];
  let openUnpaidFen = 0;
  let fulfilledUnpaidFen = 0;

  for (const row of rows) {
    if (newCaseId && row.id === newCaseId) continue;
    if (!row.hasContract) continue;
    const fulfillment = isExportFulfilled(row) ? ContractFulfillment.FULFILLED : ContractFulfillment.OPEN;
    const line = lineOf(row, fulfillment);
    if (!isUsd(line.currency)) {
      skippedNonUsd.push(line);
      continue;
    }
    if (fulfillment === ContractFulfillment.FULFILLED) {
      if (line.unpaidFen > 0) {
        fulfilledUnpaidContracts.push(line);
        fulfilledUnpaidFen += line.unpaidFen;
      }
    } else if (line.unpaidFen > 0) {
      openContracts.push(line);
      openUnpaidFen += line.unpaidFen;
    }
  }

  return {
    openUnpaidFen,
    fulfilledUnpaidFen,
    newContractFen: newAmountFen,
    openContracts,
    fulfilledUnpaidContracts,
    skippedNonUsd,
  };
}

export function evaluateOccupancy(input: {
  openUnpaidFen?: number;
  fulfilledUnpaidFen?: number;
  newContractFen?: number;
  insuredLimitFen?: number | null;
  currency?: string | null;
  limitCurrency?: string | null;
  contractCurrency?: string | null;
  openContracts?: ExposureLine[];
  fulfilledUnpaidContracts?: ExposureLine[];
  excludedNonUsd?: ExposureLine[];
  notes?: string[];
}): SinosureExposure {
  const limitCurrency = input.limitCurrency ? String(input.limitCurrency).toUpperCase() : null;
  const contractCurrency = input.contractCurrency ? String(input.contractCurrency).toUpperCase() : null;
  const currency = EXPOSURE_CURRENCY;
  const openUnpaidFen = Math.max(0, Number(input.openUnpaidFen) || 0);
  const fulfilledUnpaidFen = Math.max(0, Number(input.fulfilledUnpaidFen) || 0);
  const countNew = !contractCurrency || isUsd(contractCurrency);
  const newContractFen = countNew ? Math.max(0, Number(input.newContractFen) || 0) : 0;
  const occupancyFen = openUnpaidFen + fulfilledUnpaidFen + newContractFen;
  const insuredLimitFen =
    input.insuredLimitFen != null && Number(input.insuredLimitFen) > 0 ? Number(input.insuredLimitFen) : null;

  const currencyOk = !limitCurrency || isUsd(limitCurrency);
  const usdBandsApply = currencyOk;

  const notes = [...(input.notes || [])];
  if (!countNew && Number(input.newContractFen) > 0) {
    notes.push(
      `${CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP}（原币 ${moneyLabel(Number(input.newContractFen) || 0, contractCurrency || 'CNY')}）`,
    );
  }
  if (!currencyOk) {
    notes.push(
      `限额币种（${limitCurrency || '未填'}）须为美元；未换算，占用分档仅支持美元。`,
    );
  }

  let remainingFen = 0;
  let excessFen = 0;
  let band: ExposureBandCode | null = null;
  if (insuredLimitFen != null) {
    remainingFen = Math.max(0, insuredLimitFen - occupancyFen);
    excessFen = Math.max(0, occupancyFen - insuredLimitFen);
    if (!currencyOk) {
      band = null;
    } else if (!usdBandsApply) {
      band = excessFen > 0 ? ExposureBand.ULTRA_HIGH : ExposureBand.WITHIN_LIMIT;
    } else {
      band = bandOfExcessFen(excessFen);
    }
  }

  const gateDecision = gateDecisionOfBand(band);
  const formula = '占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款 + 新签订合同金额';
  const parts = [
    `未履行完毕未回款 ${moneyLabel(openUnpaidFen, currency)}`,
    `已履行完毕未回款 ${moneyLabel(fulfilledUnpaidFen, currency)}`,
    `新签合同 ${moneyLabel(newContractFen, currency)}`,
  ];
  let summary = `${formula}。本次 ${parts.join(' + ')} = ${moneyLabel(occupancyFen, currency)}`;
  if (insuredLimitFen == null) {
    summary += '。尚未登记投保限额。';
  } else if (excessFen > 0) {
    summary += `。限额 ${moneyLabel(insuredLimitFen, limitCurrency || currency)}，超额 ${moneyLabel(excessFen, currency)}（${band ? ExposureBandLabel[band] : '超额'}）。`;
  } else {
    summary += `。限额 ${moneyLabel(insuredLimitFen, limitCurrency || currency)}，剩余额度 ${moneyLabel(remainingFen, currency)}。`;
  }

  return {
    currency,
    limitCurrency,
    insuredLimitFen,
    openUnpaidFen,
    fulfilledUnpaidFen,
    newContractFen,
    occupancyFen,
    remainingFen,
    excessFen,
    band,
    bandLabel: band ? ExposureBandLabel[band] : '未测算',
    gateDecision,
    gateLabel: gateDecision ? ExposureGateLabel[gateDecision] : '未测算',
    usdBandsApply,
    currencyOk,
    formula,
    summary,
    notes,
    openContracts: input.openContracts || [],
    fulfilledUnpaidContracts: input.fulfilledUnpaidContracts || [],
    excludedNonUsd: input.excludedNonUsd || [],
  };
}

export function evaluateBuyerOccupancy(
  rows: ExposureContractInput[],
  opts: {
    insuredLimitFen?: number | null;
    limitCurrency?: string | null;
    newCaseId?: string | null;
    newAmountFen?: number | null;
    newCurrency?: string | null;
  },
): SinosureExposure {
  const newUsd = !opts.newCurrency || isUsd(opts.newCurrency);
  const countedNew = newUsd ? Math.max(0, Number(opts.newAmountFen) || 0) : 0;
  const split = splitOccupancy(rows, {
    newCaseId: opts.newCaseId,
    newAmountFen: countedNew,
  });
  const notes: string[] = [];
  if (!newUsd && Number(opts.newAmountFen) > 0) {
    notes.push(
      `${CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP}（原币 ${moneyLabel(Number(opts.newAmountFen) || 0, opts.newCurrency || 'CNY')}）`,
    );
  }
  if (split.skippedNonUsd.length) {
    notes.push(
      `${CNY_EXCLUDED_FROM_USD_OCCUPANCY_TIP}：${split.skippedNonUsd
        .map((l) => `${l.caseNo || l.id} ${moneyLabel(l.amountFen, l.currency)}`)
        .join('、')}`,
    );
  }
  return evaluateOccupancy({
    openUnpaidFen: split.openUnpaidFen,
    fulfilledUnpaidFen: split.fulfilledUnpaidFen,
    newContractFen: countedNew,
    insuredLimitFen: opts.insuredLimitFen,
    currency: EXPOSURE_CURRENCY,
    limitCurrency: opts.limitCurrency,
    contractCurrency: newUsd ? EXPOSURE_CURRENCY : opts.newCurrency || 'CNY',
    openContracts: split.openContracts,
    fulfilledUnpaidContracts: split.fulfilledUnpaidContracts,
    excludedNonUsd: split.skippedNonUsd,
    notes,
  });
}
