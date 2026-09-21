import { RemittanceStatus, evaluateRemittance } from './remittance';
import {
  BuyerEvalFacts,
  EvalGrade,
  EvalTag,
  LOW_LIMIT_USD_FEN,
  PROFIT_MISSING_LABEL,
  emptySinosureSlice,
  evaluateBuyer,
  factsFromCases,
  n9ReceivedFen,
} from './buyer-eval';
import { receivedFenOf } from './sinosure-exposure';

const NOW = '2026-09-21';

const BASE_REMIT = {
  onTime: 2,
  overdue: 0,
  notDue: 0,
  noRecord: 0,
  unpaidFen: 0,
  over60Fen: 0,
  over90Fen: 0,
  deduction: 'none' as const,
};

function facts(over: Partial<BuyerEvalFacts> = {}): BuyerEvalFacts {
  const { remittance, sinosure, ...rest } = over;
  return {
    salesFen: 12_800_000,
    costFen: 9_000_000,
    costMissing: false,
    lowLimitReason: null,
    ...rest,
    remittance: { ...BASE_REMIT, ...remittance },
    sinosure: emptySinosureSlice({
      insuredLimitFen: 15_000_000,
      occupancyFen: 2_000_000,
      remainingFen: 13_000_000,
      excessFen: 0,
      band: 'WITHIN_LIMIT',
      bandLabel: '额度内',
      gateDecision: 'PASS',
      currency: 'USD',
      limitCurrency: 'USD',
      ...sinosure,
    }),
  };
}

function richPeer(i: number): BuyerEvalFacts {
  return facts({
    salesFen: 5_000_000 + i * 2_000_000,
    costFen: 3_000_000 + i * 800_000,
    costMissing: false,
  });
}

describe('客户评估 evaluateBuyer（内部口径，非中信保官方）', () => {
  it('Cedar / 限额未登记 → 建议级别 D，且不得看起来优质', () => {
    const cedar = facts({
      salesFen: 0,
      costFen: null,
      costMissing: false,
      remittance: { onTime: 0, overdue: 0, notDue: 0, noRecord: 1, unpaidFen: 0, over60Fen: 0, over90Fen: 0, deduction: 'none' },
      sinosure: emptySinosureSlice({ insuredLimitFen: null, summary: '尚未登记投保限额。' }),
    });
    const r = evaluateBuyer(cedar, [cedar, ...[0, 1, 2].map(richPeer)]);
    expect(r.suggestedGrade).toBe(EvalGrade.D);
    expect(r.scores.credit).toBe(0);
    expect(r.tags).toContain(EvalTag.NO_LIMIT);
    expect(r.tags).not.toContain(EvalTag.GOOD_REMIT);
    expect(r.tags.join('')).not.toMatch(/优质/);
  });

  it('即使其它分数很高，限额未登记仍硬门到 D', () => {
    const unregistered = facts({
      salesFen: 80_000_000,
      costFen: 40_000_000,
      remittance: { onTime: 8, overdue: 0, notDue: 0, noRecord: 0, unpaidFen: 0, over60Fen: 0, over90Fen: 0, deduction: 'none' },
      sinosure: emptySinosureSlice({ insuredLimitFen: 0 }),
    });
    const r = evaluateBuyer(unregistered, [unregistered, facts({ salesFen: 1_000_000, costFen: 800_000 })]);
    expect(r.suggestedGrade).toBe(EvalGrade.D);
    expect(r.tags).toContain(EvalTag.NO_LIMIT);
  });

  it('限额 ≤ 100,000 USD → 标签「限额偏低·须核原因」，且不得为 S', () => {
    expect(LOW_LIMIT_USD_FEN).toBe(10_000_000);
    const low = facts({
      salesFen: 80_000_000,
      costFen: 30_000_000,
      remittance: { onTime: 6, overdue: 0, notDue: 0, noRecord: 0, unpaidFen: 0, over60Fen: 0, over90Fen: 0, deduction: 'none' },
      sinosure: emptySinosureSlice({
        insuredLimitFen: 8_000_000,
        occupancyFen: 500_000,
        remainingFen: 7_500_000,
        band: 'WITHIN_LIMIT',
        currency: 'USD',
        limitCurrency: 'USD',
      }),
    });
    const peers = [low, facts({ salesFen: 1_000_000, costFen: 400_000, sinosure: emptySinosureSlice({ insuredLimitFen: 3_000_000 }) })];
    const r = evaluateBuyer(low, peers);
    expect(r.tags).toContain(EvalTag.LOW_LIMIT);
    expect(r.suggestedGrade).not.toBe(EvalGrade.S);
    expect(r.scores.credit).toBeGreaterThan(0);
  });

  it('限额偏低无「小单/额度约束」原因时不得进 A（有原因才可 A，仍非 S）', () => {
    const base = {
      salesFen: 90_000_000,
      costFen: 20_000_000,
      remittance: {
        onTime: 10,
        overdue: 0,
        notDue: 0,
        noRecord: 0,
        unpaidFen: 0,
        over60Fen: 0,
        over90Fen: 0,
        deduction: 'none' as const,
      },
      sinosure: emptySinosureSlice({
        insuredLimitFen: 10_000_000,
        occupancyFen: 100_000,
        remainingFen: 9_900_000,
        band: 'WITHIN_LIMIT',
        currency: 'USD',
        limitCurrency: 'USD',
      }),
    };
    const without = evaluateBuyer(facts({ ...base, lowLimitReason: null }), [facts(base), facts({ salesFen: 1_000_000, costFen: 900_000 })]);
    expect(without.suggestedGrade).not.toBe(EvalGrade.S);
    expect(without.suggestedGrade).not.toBe(EvalGrade.A);

    const withReason = evaluateBuyer(
      facts({ ...base, lowLimitReason: '小单品种，限额与订单规模匹配' }),
      [facts(base), facts({ salesFen: 1_000_000, costFen: 900_000 })],
    );
    expect(withReason.suggestedGrade).not.toBe(EvalGrade.S);
    expect(withReason.suggestedGrade).toBe(EvalGrade.A);
  });

  it('采购成本缺失 → costMissing，展示「待合同毛利率表」，不编造成本', () => {
    const missing = facts({
      salesFen: 12_800_000,
      costFen: null,
      costMissing: true,
    });
    const r = evaluateBuyer(missing, [missing, facts()]);
    expect(r.profit.costMissing).toBe(true);
    expect(r.profit.costFen).toBeNull();
    expect(r.profit.grossFen).toBeNull();
    expect(r.profit.marginPct).toBeNull();
    expect(r.profit.label).toBe(PROFIT_MISSING_LABEL);
    expect(r.profit.label).toContain('毛利率表');
  });

  it('factsFromCases：CNY 采购相对 USD 销售视为成本暂缺（无汇率不换算）', () => {
    const f = factsFromCases(
      [
        {
          amountFen: 12_800_000,
          currency: 'USD',
          receivedFen: 12_800_000,
          unpaidFen: 0,
          remittanceCode: RemittanceStatus.ON_TIME,
          procurement: [{ amountFen: 82_000_000, currency: 'CNY' }],
        },
      ],
      emptySinosureSlice({ insuredLimitFen: 15_000_000 }),
    );
    expect(f.costMissing).toBe(true);
    expect(f.costFen).toBeNull();
    const r = evaluateBuyer(f);
    expect(r.profit.label).toBe(PROFIT_MISSING_LABEL);
  });

  it('回款与 N9 水单/到账一致，不用 N3 是否收汇假装已收齐', () => {
    const amountFen = 4_500_000;
    const n3PretendPaid = true;
    const settlement = { receivedAt: '2026-05-20', amountFen: 2_000_000, hasRemittanceMemo: true };
    const receivedFen = n9ReceivedFen(settlement, amountFen);
    expect(receivedFen).toBe(receivedFenOf(settlement, amountFen));
    expect(receivedFen).toBe(2_000_000);
    expect(receivedFen).not.toBe(amountFen);
    expect(n3PretendPaid).toBe(true);

    const unpaidFen = Math.max(0, amountFen - receivedFen);
    const rem = evaluateRemittance({
      kind: 'collection',
      paymentDueAt: '2026-04-14',
      receivedAt: settlement.receivedAt,
      remainingFen: unpaidFen,
      now: NOW,
    });
    expect(rem.code).toBe(RemittanceStatus.OVERDUE);

    const f = factsFromCases(
      [
        {
          amountFen,
          currency: 'USD',
          receivedFen,
          unpaidFen,
          remittanceCode: rem.code,
          paymentDueAt: '2026-04-14',
          procurement: [{ amountFen: 3_000_000, currency: 'USD' }],
        },
      ],
      emptySinosureSlice({ insuredLimitFen: 15_000_000, occupancyFen: 2_500_000, remainingFen: 12_500_000, band: 'WITHIN_LIMIT' }),
      { now: NOW },
    );
    expect(f.remittance.unpaidFen).toBe(2_500_000);
    expect(f.remittance.overdue).toBe(1);
    expect(f.remittance.onTime).toBe(0);
    expect(f.remittance.over60Fen).toBe(2_500_000);
    expect(f.remittance.over90Fen).toBe(2_500_000);

    const r = evaluateBuyer(f);
    expect(r.remittance.unpaidFen).toBe(2_500_000);
    expect(r.remittance.onTimeRate).toBe(0);
    expect(r.remittance.over90Fen).toBe(2_500_000);
    expect(r.tags).toContain(EvalTag.LONG_AR);
    expect(r.tags).not.toContain(EvalTag.GOOD_REMIT);
  });

  it('毛利百分位低于 40 不得进 S/A；规模大利润薄打标', () => {
    const thin = facts({ salesFen: 50_000_000, costFen: 49_000_000 });
    const fatSmall = facts({ salesFen: 2_000_000, costFen: 200_000 });
    const fatMid = facts({ salesFen: 8_000_000, costFen: 1_000_000 });
    const r = evaluateBuyer(thin, [thin, fatSmall, fatMid]);
    expect(r.suggestedGrade).not.toBe(EvalGrade.S);
    expect(r.suggestedGrade).not.toBe(EvalGrade.A);
    expect(r.tags).toContain(EvalTag.THIN_MARGIN);
  });

  it('有扣款金额时打「有扣款」；无字段时为 none', () => {
    const withDeduction = evaluateBuyer(
      facts({ remittance: { onTime: 1, overdue: 0, notDue: 0, noRecord: 0, unpaidFen: 0, over60Fen: 0, over90Fen: 0, deduction: 120_000 } }),
    );
    expect(withDeduction.remittance.deduction).toBe(120_000);
    expect(withDeduction.tags).toContain(EvalTag.DEDUCTION);

    const none = evaluateBuyer(facts());
    expect(none.remittance.deduction).toBe('none');
    expect(none.tags).not.toContain(EvalTag.DEDUCTION);
  });

  it('价值权重大于销售额：高毛利低规模的价值分高于高规模低毛利', () => {
    const peers = [
      facts({ salesFen: 2_000_000, costFen: 200_000 }),
      facts({ salesFen: 40_000_000, costFen: 39_500_000 }),
      facts({ salesFen: 10_000_000, costFen: 6_000_000 }),
    ];
    const highGp = evaluateBuyer(peers[0], peers);
    const highVol = evaluateBuyer(peers[1], peers);
    expect(highGp.scores.value).toBeGreaterThan(highVol.scores.value);
  });

  it('权重合计 50/30/20，总分不超过 100', () => {
    const r = evaluateBuyer(facts(), [facts(), facts({ salesFen: 1_000_000, costFen: 100_000 })]);
    expect(r.scores.value).toBeLessThanOrEqual(50);
    expect(r.scores.risk).toBeLessThanOrEqual(30);
    expect(r.scores.credit).toBeLessThanOrEqual(20);
    expect(r.scores.total).toBe(r.scores.value + r.scores.risk + r.scores.credit);
    expect(r.scores.total).toBeLessThanOrEqual(100);
  });
});
