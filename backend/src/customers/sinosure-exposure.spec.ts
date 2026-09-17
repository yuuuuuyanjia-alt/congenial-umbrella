import {
  ContractFulfillment,
  EXPOSURE_BAND_FEN,
  ExposureBand,
  ExposureGateDecision,
  bandOfExcessFen,
  evaluateBuyerOccupancy,
  evaluateOccupancy,
  isExportFulfilled,
  unpaidFenOf,
} from './sinosure-exposure';

describe('中信保占用公式与超额分档', () => {
  it('占用 = 未履行完毕未回款 + 已履行完毕未回款 + 新签合同', () => {
    const r = evaluateOccupancy({
      openUnpaidFen: 800_000,
      fulfilledUnpaidFen: 2_000_000,
      newContractFen: 2_500_000,
      insuredLimitFen: 4_000_000,
      currency: 'USD',
      limitCurrency: 'USD',
    });
    expect(r.occupancyFen).toBe(5_300_000);
    expect(r.excessFen).toBe(1_300_000);
    expect(r.remainingFen).toBe(0);
    expect(r.band).toBe(ExposureBand.MEDIUM);
    expect(r.bandLabel).toBe('中风险');
    expect(r.gateDecision).toBe(ExposureGateDecision.SOFT_ALERT);
    expect(r.formula).toContain('未履行完毕合同未回款');
  });

  it('额度内显示剩余额度', () => {
    const r = evaluateOccupancy({
      openUnpaidFen: 1_800_000,
      fulfilledUnpaidFen: 9_700_000,
      newContractFen: 0,
      insuredLimitFen: 15_000_000,
      currency: 'USD',
    });
    expect(r.occupancyFen).toBe(11_500_000);
    expect(r.excessFen).toBe(0);
    expect(r.remainingFen).toBe(3_500_000);
    expect(r.band).toBe(ExposureBand.WITHIN_LIMIT);
    expect(r.gateDecision).toBe(ExposureGateDecision.PASS);
    expect(r.summary).toContain('剩余额度');
  });

  it('超额边界：1万中、2万高、5万超高（左闭右开）', () => {
    expect(bandOfExcessFen(0)).toBe(ExposureBand.WITHIN_LIMIT);
    expect(bandOfExcessFen(EXPOSURE_BAND_FEN.MEDIUM_MIN - 1)).toBe(ExposureBand.BELOW_MEDIUM);
    expect(bandOfExcessFen(EXPOSURE_BAND_FEN.MEDIUM_MIN)).toBe(ExposureBand.MEDIUM);
    expect(bandOfExcessFen(EXPOSURE_BAND_FEN.HIGH_MIN - 1)).toBe(ExposureBand.MEDIUM);
    expect(bandOfExcessFen(EXPOSURE_BAND_FEN.HIGH_MIN)).toBe(ExposureBand.HIGH);
    expect(bandOfExcessFen(EXPOSURE_BAND_FEN.ULTRA_MIN - 1)).toBe(ExposureBand.HIGH);
    expect(bandOfExcessFen(EXPOSURE_BAND_FEN.ULTRA_MIN)).toBe(ExposureBand.ULTRA_HIGH);
    expect(bandOfExcessFen(EXPOSURE_BAND_FEN.ULTRA_MIN + 1)).toBe(ExposureBand.ULTRA_HIGH);
  });

  it('分档对应闸门：中软提示、高审核、超高硬拦截', () => {
    expect(evaluateOccupancy({ newContractFen: 6_200_000, insuredLimitFen: 5_000_000 }).gateDecision).toBe(
      ExposureGateDecision.SOFT_ALERT,
    );
    expect(evaluateOccupancy({ newContractFen: 7_500_000, insuredLimitFen: 5_000_000 }).gateDecision).toBe(
      ExposureGateDecision.REVIEW,
    );
    expect(evaluateOccupancy({ newContractFen: 8_000_000, insuredLimitFen: 3_000_000 }).gateDecision).toBe(
      ExposureGateDecision.HARD_BLOCK,
    );
    expect(evaluateOccupancy({ newContractFen: 8_000_000, insuredLimitFen: 3_000_000 }).excessFen).toBe(5_000_000);
    expect(evaluateOccupancy({ newContractFen: 8_000_000, insuredLimitFen: 3_000_000 }).band).toBe(
      ExposureBand.ULTRA_HIGH,
    );
  });

  it('超额不足 1 万美元仍显示超额，按软提示', () => {
    const r = evaluateOccupancy({
      newContractFen: 12_800_000,
      insuredLimitFen: 12_000_000,
    });
    expect(r.excessFen).toBe(800_000);
    expect(r.band).toBe(ExposureBand.BELOW_MEDIUM);
    expect(r.gateDecision).toBe(ExposureGateDecision.SOFT_ALERT);
    expect(r.summary).toContain('超额');
  });

  it('按买方合同拆分未履行 / 已履行未回款，新签不重复计入', () => {
    const r = evaluateBuyerOccupancy(
      [
        {
          id: 'done',
          caseNo: 'DONE',
          hasContract: true,
          amountFen: 2_500_000,
          receivedFen: 500_000,
          currency: 'USD',
          status: 'COMPLETED',
          currentNode: 'N9',
          nodes: [{ code: 'N6', status: 'PASSED' }],
        },
        {
          id: 'open',
          caseNo: 'WIP',
          hasContract: true,
          amountFen: 800_000,
          receivedFen: 0,
          currency: 'USD',
          status: 'IN_PROGRESS',
          currentNode: 'N5',
          nodes: [{ code: 'N6', status: 'NOT_STARTED' }],
        },
        {
          id: 'new',
          caseNo: 'NEW',
          hasContract: true,
          amountFen: 9_999_999,
          receivedFen: 0,
          currency: 'USD',
          status: 'IN_PROGRESS',
          currentNode: 'N3',
          nodes: [{ code: 'N6', status: 'NOT_STARTED' }],
        },
      ],
      {
        insuredLimitFen: 4_000_000,
        limitCurrency: 'USD',
        newCaseId: 'new',
        newAmountFen: 2_500_000,
        newCurrency: 'USD',
      },
    );
    expect(r.openUnpaidFen).toBe(800_000);
    expect(r.fulfilledUnpaidFen).toBe(2_000_000);
    expect(r.newContractFen).toBe(2_500_000);
    expect(r.occupancyFen).toBe(5_300_000);
    expect(r.openContracts).toHaveLength(1);
    expect(r.fulfilledUnpaidContracts).toHaveLength(1);
    expect(r.openContracts[0].fulfillment).toBe(ContractFulfillment.OPEN);
    expect(r.fulfilledUnpaidContracts[0].fulfillment).toBe(ContractFulfillment.FULFILLED);
  });

  it('已收齐的已履行合同不占用额度', () => {
    expect(unpaidFenOf(12_800_000, 12_800_000)).toBe(0);
    const r = evaluateBuyerOccupancy(
      [
        {
          id: 'paid',
          hasContract: true,
          amountFen: 12_800_000,
          receivedFen: 12_800_000,
          currency: 'USD',
          status: 'COMPLETED',
          currentNode: 'N9',
          nodes: [{ code: 'N6', status: 'PASSED' }],
        },
      ],
      { insuredLimitFen: 15_000_000, limitCurrency: 'USD' },
    );
    expect(r.occupancyFen).toBe(0);
    expect(r.fulfilledUnpaidFen).toBe(0);
    expect(r.remainingFen).toBe(15_000_000);
  });

  it('N6 已过视为履行完毕；停在采购视为未履行完毕', () => {
    expect(isExportFulfilled({ currentNode: 'N5', nodes: [{ code: 'N6', status: 'NOT_STARTED' }] })).toBe(false);
    expect(isExportFulfilled({ currentNode: 'N6', nodes: [{ code: 'N6', status: 'IN_PROGRESS' }] })).toBe(false);
    expect(isExportFulfilled({ currentNode: 'N7', nodes: [{ code: 'N6', status: 'PASSED' }] })).toBe(true);
    expect(isExportFulfilled({ status: 'COMPLETED' })).toBe(true);
  });

  it('非美元不换算：超额按超高风险硬拦截', () => {
    const r = evaluateOccupancy({
      newContractFen: 200_000,
      insuredLimitFen: 100_000,
      currency: 'CNY',
      limitCurrency: 'CNY',
      contractCurrency: 'CNY',
    });
    expect(r.usdBandsApply).toBe(false);
    expect(r.band).toBe(ExposureBand.ULTRA_HIGH);
    expect(r.gateDecision).toBe(ExposureGateDecision.HARD_BLOCK);
  });
});
