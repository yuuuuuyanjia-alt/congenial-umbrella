import {
  COLOR_RANK,
  RiskColor,
  RiskStatus,
  batchCollected,
  colorForOpen,
  compareRiskQueue,
  diffScreeningMatches,
  dispositionError,
  docMissingLines,
  escalateDisplayColor,
  occupancyRuleColor,
  overdueRuleColor,
  quotaFromLimits,
  receivableDueDate,
  sanctionBucket,
  sanctionFindings,
  syncRiskState,
  type RiskFinding,
  type StoredRisk,
} from './risk-rules';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function stored(partial: Partial<StoredRisk> & Pick<StoredRisk, 'fingerprint' | 'status' | 'color'>): StoredRisk {
  return {
    type: 'SANCTION',
    ruleColor: partial.color,
    title: 't',
    subjectLabel: 's',
    lines: [],
    firstSeenAt: '2026-09-01T00:00:00.000Z',
    lastHitAt: '2026-09-01T00:00:00.000Z',
    escalatedAt: null,
    isSample: false,
    preserveOnRecalc: false,
    ...partial,
  };
}

function finding(partial: Partial<RiskFinding> & Pick<RiskFinding, 'fingerprint' | 'ruleColor'>): RiskFinding {
  return {
    type: 'SANCTION',
    title: 't',
    subjectLabel: 's',
    lines: [{ code: 'L', text: '线' }],
    ...partial,
  };
}

describe('制裁颜色', () => {
  it('确认命中红、高置信疑似橙、新的低置信黄，误报和中置信不产生', () => {
    expect(sanctionBucket({ disposition: 'CONFIRMED_TRUE', confidence: 'LOW' })).toBe('CONFIRMED');
    expect(sanctionBucket({ disposition: 'OPEN', confidence: 'HIGH' })).toBe('HIGH');
    expect(sanctionBucket({ disposition: 'MONITORING', confidence: 'HIGH' })).toBe('HIGH');
    expect(sanctionBucket({ disposition: 'OPEN', confidence: 'LOW' })).toBe('LOW');
    expect(sanctionBucket({ disposition: 'OPEN', confidence: 'MEDIUM' })).toBeNull();
    expect(sanctionBucket({ disposition: 'FALSE_POSITIVE', confidence: 'HIGH' })).toBeNull();
    expect(sanctionBucket({ disposition: 'SUPPLEMENTED', confidence: 'LOW' })).toBeNull();
  });

  it('同一客户同一档只留一条，踩线合并，指纹去重', () => {
    const rows = sanctionFindings([
      {
        customerId: 'c1',
        subjectName: 'Acme',
        listCode: 'OFAC',
        listedName: 'ACME',
        matchedName: 'Acme',
        confidence: 'LOW',
        disposition: 'OPEN',
      },
      {
        customerId: 'c1',
        subjectName: 'Acme',
        listCode: 'EU',
        listedName: 'ACME EU',
        matchedName: 'Acme',
        confidence: 'LOW',
        disposition: 'OPEN',
      },
      {
        customerId: 'c1',
        subjectName: 'Acme',
        listCode: 'UN',
        listedName: 'ACME',
        matchedName: 'Acme',
        confidence: 'HIGH',
        disposition: 'OPEN',
      },
    ]);
    expect(rows.map((r) => r.fingerprint).sort()).toEqual(['SANCTION|C:c1|HIGH', 'SANCTION|C:c1|LOW']);
    const low = rows.find((r) => r.ruleColor === 'YELLOW');
    expect(low?.lines).toHaveLength(2);
    expect(rows.find((r) => r.fingerprint.endsWith('|HIGH'))?.ruleColor).toBe('ORANGE');
  });

  it('没有客户或供应商主数据的命中不进雷达', () => {
    expect(
      sanctionFindings([
        {
          subjectName: 'Loose',
          listCode: 'OFAC',
          listedName: 'Loose',
          matchedName: 'Loose',
          confidence: 'HIGH',
          disposition: 'CONFIRMED_TRUE',
        },
      ]),
    ).toEqual([]);
  });
});

describe('中信保额度颜色', () => {
  it('80% 到 90% 黄，超过 90% 橙，超出且无追加为红', () => {
    const base = { usd: true, additionalFen: 0, effectiveLimitFen: 100_00 };
    expect(occupancyRuleColor({ ...base, occupancyFen: 79_99 })).toBeNull();
    expect(occupancyRuleColor({ ...base, occupancyFen: 80_00 })).toBe('YELLOW');
    expect(occupancyRuleColor({ ...base, occupancyFen: 90_00 })).toBe('YELLOW');
    expect(occupancyRuleColor({ ...base, occupancyFen: 90_01 })).toBe('ORANGE');
    expect(occupancyRuleColor({ ...base, occupancyFen: 100_00 })).toBe('ORANGE');
    expect(occupancyRuleColor({ ...base, occupancyFen: 100_01 })).toBe('RED');
  });

  it('有追加额度时超出有效限额也不自动变红', () => {
    expect(
      occupancyRuleColor({
        usd: true,
        occupancyFen: 160_00,
        effectiveLimitFen: 150_00,
        additionalFen: 50_00,
      }),
    ).toBe('ORANGE');
  });

  it('非美元不产生占用风险', () => {
    expect(
      occupancyRuleColor({ usd: false, occupancyFen: 100_00, effectiveLimitFen: 10_00, additionalFen: 0 }),
    ).toBeNull();
  });

  it('追加额度只算后续保单高出第一张的部分', () => {
    expect(quotaFromLimits([100])).toEqual({ effectiveFen: 100, additionalFen: 0 });
    expect(quotaFromLimits([100, 150])).toEqual({ effectiveFen: 150, additionalFen: 50 });
    expect(quotaFromLimits([150, 100])).toEqual({ effectiveFen: 100, additionalFen: 0 });
  });
});

describe('后 T/T 逾期到期日', () => {
  const today = day('2026-09-24');

  it('到港日加付款天数；没填到港日时用 N6 过闸日', () => {
    expect(receivableDueDate({ arrivalDate: day('2026-09-01'), n6PassedAt: day('2026-08-01'), daysAfterArrival: 10 })?.toISOString()).toBe(
      '2026-09-11T00:00:00.000Z',
    );
    expect(receivableDueDate({ arrivalDate: null, n6PassedAt: day('2026-09-01'), daysAfterArrival: 10 })?.toISOString()).toBe(
      '2026-09-11T00:00:00.000Z',
    );
    expect(receivableDueDate({ arrivalDate: null, n6PassedAt: null, daysAfterArrival: 10 })).toBeNull();
  });

  it('过到期日未收齐为黄，超过 7 天宽限期为橙；前 T/T 和已收齐不算', () => {
    expect(overdueRuleColor({ ttTiming: 'AFTER', dueDate: today, today, collected: false })).toBeNull();
    expect(overdueRuleColor({ ttTiming: 'AFTER', dueDate: day('2026-09-23'), today, collected: false })).toBe('YELLOW');
    expect(overdueRuleColor({ ttTiming: 'AFTER', dueDate: day('2026-09-17'), today, collected: false })).toBe('YELLOW');
    expect(overdueRuleColor({ ttTiming: 'AFTER', dueDate: day('2026-09-16'), today, collected: false })).toBe('ORANGE');
    expect(overdueRuleColor({ ttTiming: 'ADVANCE', dueDate: day('2026-09-01'), today, collected: false })).toBeNull();
    expect(overdueRuleColor({ ttTiming: 'AFTER', dueDate: day('2026-09-01'), today, collected: true })).toBeNull();
    expect(overdueRuleColor({ ttTiming: null, dueDate: day('2026-09-01'), today, collected: false })).toBeNull();
  });

  it('收齐只认水单或到账覆盖本批金额', () => {
    expect(batchCollected(null, 100)).toBe(false);
    expect(batchCollected({ receivedAt: today, amountFen: 40 }, 100)).toBe(false);
    expect(batchCollected({ receivedAt: today, amountFen: 100 }, 100)).toBe(true);
  });
});

describe('单证缺失', () => {
  it('N7 未过闸不报；过闸后缺项和非 FOB 缺原产地证为黄', () => {
    expect(docMissingLines({ n7Passed: false, originRequired: true, presentKinds: [] })).toEqual([]);
    const cif = docMissingLines({
      n7Passed: true,
      originRequired: true,
      presentKinds: [
        'N7_SALES_CONTRACT',
        'N7_COMMERCIAL_INVOICE',
        'N7_PACKING',
        'N7_PURCHASE_CONTRACT',
        'N7_INVOICE',
        'N7_CUSTOMS',
      ],
    });
    expect(cif.map((l) => l.code)).toEqual(['N7_ORIGIN_CERT']);
    const fob = docMissingLines({
      n7Passed: true,
      originRequired: false,
      presentKinds: ['N7_SALES_CONTRACT', 'N7_COMMERCIAL_INVOICE', 'N7_PACKING', 'N7_PURCHASE_CONTRACT', 'N7_INVOICE'],
    });
    expect(fob.map((l) => l.code)).toEqual(['N7_CUSTOMS']);
    expect(fob.some((l) => l.code === 'N7_ORIGIN_CERT')).toBe(false);
  });
});

describe('补件逾期升橙', () => {
  const now = day('2026-09-24');

  it('黄色升橙，橙色保持橙，任何情况都不自动变红', () => {
    expect(escalateDisplayColor('YELLOW')).toBe('ORANGE');
    expect(escalateDisplayColor('ORANGE')).toBe('ORANGE');
    expect(escalateDisplayColor('RED')).toBe('RED');
    expect(escalateDisplayColor('GRAY')).toBe('GRAY');
    expect(colorForOpen('YELLOW', '2026-09-20T00:00:00.000Z')).toBe('ORANGE');
    expect(colorForOpen('RED', '2026-09-20T00:00:00.000Z')).toBe('RED');
  });

  it('有条件放行且补件逾期：黄色变橙并回到待处置，排到同色最前', () => {
    const fp = 'OVERDUE_RECEIVABLE|b1';
    const [row] = syncRiskState({
      now,
      overdueFingerprints: new Set([fp]),
      stored: [
        stored({
          fingerprint: fp,
          type: 'OVERDUE_RECEIVABLE',
          status: RiskStatus.CONDITIONAL_RELEASE,
          color: 'YELLOW',
          ruleColor: 'YELLOW',
          firstSeenAt: '2026-09-01T00:00:00.000Z',
        }),
      ],
      findings: [finding({ fingerprint: fp, type: 'OVERDUE_RECEIVABLE', ruleColor: 'YELLOW' })],
    });
    expect(row.color).toBe('ORANGE');
    expect(row.status).toBe(RiskStatus.PENDING);
    expect(row.escalatedAt).toBe(now.toISOString());
    expect(row.ruleColor).toBe('YELLOW');
  });

  it('本来就是橙色的有条件放行，逾期后仍是橙色并重新排队', () => {
    const fp = 'SANCTION|C:c|HIGH';
    const [row] = syncRiskState({
      now,
      overdueFingerprints: new Set([fp]),
      stored: [
        stored({
          fingerprint: fp,
          status: RiskStatus.CONDITIONAL_RELEASE,
          color: 'ORANGE',
          ruleColor: 'ORANGE',
        }),
      ],
      findings: [finding({ fingerprint: fp, ruleColor: 'ORANGE' })],
    });
    expect(row.color).toBe('ORANGE');
    expect(row.status).toBe(RiskStatus.PENDING);
    expect(row.escalatedAt).toBe(now.toISOString());
  });

  it('红色不会因为补件逾期被改色', () => {
    const fp = 'SANCTION|C:c|CONFIRMED';
    const [row] = syncRiskState({
      now,
      overdueFingerprints: new Set([fp]),
      stored: [
        stored({
          fingerprint: fp,
          status: RiskStatus.CONDITIONAL_RELEASE,
          color: 'RED',
          ruleColor: 'RED',
        }),
      ],
      findings: [finding({ fingerprint: fp, ruleColor: 'RED' })],
    });
    expect(row.color).toBe('RED');
  });
});

describe('指纹去重与系统关闭', () => {
  const now = day('2026-09-24');

  it('同一指纹更新原记录，不另建一条', () => {
    const fp = 'DOC_MISSING|b1';
    const rows = syncRiskState({
      now,
      overdueFingerprints: new Set(),
      stored: [stored({ id: 'r1', fingerprint: fp, type: 'DOC_MISSING', status: 'PENDING', color: 'YELLOW' })],
      findings: [finding({ fingerprint: fp, type: 'DOC_MISSING', ruleColor: 'YELLOW', title: '新标题' })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('r1');
    expect(rows[0].op).toBe('update');
    expect(rows[0].title).toBe('新标题');
    expect(rows[0].firstSeenAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('规则不再成立时，待处置改为系统关闭', () => {
    const [row] = syncRiskState({
      now,
      overdueFingerprints: new Set(),
      stored: [stored({ fingerprint: 'SANCTION|C:c|LOW', status: 'PENDING', color: 'YELLOW' })],
      findings: [],
    });
    expect(row.status).toBe(RiskStatus.SYSTEM_CLOSED);
    expect(row.op).toBe('update');
  });

  it('有条件放行、已驳回、已解决不会被重算关掉', () => {
    const rows = syncRiskState({
      now,
      overdueFingerprints: new Set(),
      stored: [
        stored({ fingerprint: 'a', status: RiskStatus.CONDITIONAL_RELEASE, color: 'YELLOW' }),
        stored({ fingerprint: 'b', status: RiskStatus.REJECTED, color: 'RED' }),
        stored({ fingerprint: 'c', status: RiskStatus.RESOLVED, color: 'ORANGE' }),
      ],
      findings: [],
    });
    expect(rows.map((r) => r.status)).toEqual([
      RiskStatus.CONDITIONAL_RELEASE,
      RiskStatus.REJECTED,
      RiskStatus.RESOLVED,
    ]);
    expect(rows.every((r) => r.op === 'unchanged')).toBe(true);
  });

  it('灰色示例提醒没有对应规则，重算不系统关闭', () => {
    const [row] = syncRiskState({
      now,
      overdueFingerprints: new Set(),
      stored: [
        stored({
          fingerprint: 'SAMPLE_NOTICE|case',
          type: 'SAMPLE_NOTICE',
          status: 'PENDING',
          color: 'GRAY',
          ruleColor: 'GRAY',
          isSample: true,
          preserveOnRecalc: true,
        }),
      ],
      findings: [],
    });
    expect(row.status).toBe(RiskStatus.PENDING);
    expect(row.color).toBe('GRAY');
    expect(row.op).toBe('unchanged');
  });

  it('系统关闭后规则再次成立，回到待处置', () => {
    const [row] = syncRiskState({
      now,
      overdueFingerprints: new Set(),
      stored: [stored({ fingerprint: 'DOC_MISSING|b', type: 'DOC_MISSING', status: 'SYSTEM_CLOSED', color: 'YELLOW' })],
      findings: [finding({ fingerprint: 'DOC_MISSING|b', type: 'DOC_MISSING', ruleColor: 'YELLOW' })],
    });
    expect(row.status).toBe(RiskStatus.PENDING);
  });
});

describe('排序与红色处置', () => {
  it('默认红橙黄灰，同色按发现时间；补件逾期升橙的排在同色最前', () => {
    const rows = [
      { color: 'YELLOW', escalatedAt: null, firstSeenAt: '2026-09-01T00:00:00.000Z', id: 'y' },
      { color: 'ORANGE', escalatedAt: null, firstSeenAt: '2026-09-02T00:00:00.000Z', id: 'o' },
      { color: 'RED', escalatedAt: null, firstSeenAt: '2026-09-03T00:00:00.000Z', id: 'r' },
      { color: 'GRAY', escalatedAt: null, firstSeenAt: '2026-09-04T00:00:00.000Z', id: 'g' },
      { color: 'ORANGE', escalatedAt: '2026-09-24T00:00:00.000Z', firstSeenAt: '2026-09-01T00:00:00.000Z', id: 'up' },
    ].sort(compareRiskQueue);
    expect(rows.map((r) => r.id)).toEqual(['r', 'up', 'o', 'y', 'g']);
    expect(COLOR_RANK.RED).toBeLessThan(COLOR_RANK.ORANGE);
  });

  it('红色只能驳回，橙黄可以放行、驳回或解决', () => {
    expect(dispositionError('RED', 'REJECTED')).toBeNull();
    expect(dispositionError('RED', 'RESOLVED')).toMatch(/只能驳回/);
    expect(dispositionError('RED', 'CONDITIONAL_RELEASE')).toMatch(/只能驳回/);
    expect(dispositionError('ORANGE', 'CONDITIONAL_RELEASE')).toBeNull();
    expect(dispositionError('YELLOW', 'RESOLVED')).toBeNull();
    expect(dispositionError('GRAY', 'CONDITIONAL_RELEASE')).toMatch(/橙色和黄色/);
    expect(dispositionError('GRAY', 'RESOLVED')).toBeNull();
  });
});

describe('重新筛查只认新命中和等级变化', () => {
  const match = { listCode: 'OFAC', listedName: 'ACME', matchedName: 'Acme', confidence: 'LOW' };

  it('同一等级不产生新记录', () => {
    const diff = diffScreeningMatches(
      [{ id: 'h1', listCode: 'OFAC', listedName: 'ACME', confidence: 'LOW', disposition: 'OPEN' }],
      [match],
    );
    expect(diff.fresh).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('新名称算新命中，置信度变化算等级变化，已确认的不改写', () => {
    const diff = diffScreeningMatches(
      [
        { id: 'h1', listCode: 'OFAC', listedName: 'ACME', confidence: 'LOW', disposition: 'OPEN' },
        { id: 'h2', listCode: 'UN', listedName: 'KEEP', confidence: 'HIGH', disposition: 'CONFIRMED_TRUE' },
      ],
      [
        { ...match, confidence: 'HIGH' },
        { listCode: 'EU', listedName: 'NEW', matchedName: 'New', confidence: 'LOW' },
        { listCode: 'UN', listedName: 'KEEP', matchedName: 'Keep', confidence: 'LOW' },
      ],
    );
    expect(diff.changed).toEqual([{ hitId: 'h1', match: { ...match, confidence: 'HIGH' } }]);
    expect(diff.fresh.map((m) => m.listedName)).toEqual(['NEW']);
  });
});
