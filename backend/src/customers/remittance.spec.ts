import {
  RemittanceStatus,
  derivePaymentDueAt,
  evaluateRemittance,
  parsePaymentTermDays,
  summarizeRemittance,
} from './remittance';

describe('收汇按期判断', () => {
  it('从 T/T 30 days 解析账期并由交货期推算到期日', () => {
    expect(parsePaymentTermDays('T/T 30 days')).toBe(30);
    expect(parsePaymentTermDays('OA 60天')).toBe(60);
    expect(parsePaymentTermDays('即期')).toBeNull();
    const due = derivePaymentDueAt('2026-03-15T00:00:00.000Z', 'T/T 30 days');
    expect(due?.toISOString().slice(0, 10)).toBe('2026-04-14');
  });

  it('已到账且不晚于到期日为按期', () => {
    const r = evaluateRemittance({
      paymentDueAt: '2026-12-30',
      receivedAt: '2026-09-10',
      now: '2026-09-16',
    });
    expect(r.code).toBe(RemittanceStatus.ON_TIME);
    expect(r.label).toBe('按期');
    expect(r.settledOnTime).toBe(true);
  });

  it('到账日晚于到期日为逾期', () => {
    const r = evaluateRemittance({
      paymentDueAt: '2026-04-14',
      receivedAt: '2026-05-20',
      now: '2026-09-16',
    });
    expect(r.code).toBe(RemittanceStatus.OVERDUE);
    expect(r.label).toBe('逾期');
    expect(r.settledOnTime).toBe(false);
  });

  it('未到账且到期日未过为未到期', () => {
    const r = evaluateRemittance({
      paymentDueAt: '2026-12-31',
      receivedAt: null,
      now: '2026-09-16',
    });
    expect(r.code).toBe(RemittanceStatus.NOT_DUE);
    expect(r.label).toBe('未到期');
    expect(r.settledOnTime).toBeNull();
  });

  it('未到账且到期日已过为逾期', () => {
    const r = evaluateRemittance({
      paymentDueAt: '2026-06-01',
      receivedAt: null,
      now: '2026-09-16',
    });
    expect(r.code).toBe(RemittanceStatus.OVERDUE);
    expect(r.settledOnTime).toBe(false);
  });

  it('无到期日且无到账为无收汇记录', () => {
    const r = evaluateRemittance({ now: '2026-09-16' });
    expect(r.code).toBe(RemittanceStatus.NO_RECORD);
    expect(r.label).toBe('无收汇记录');
  });

  it('尚有余额且到期日已过为逾期（即使已有部分到账）', () => {
    const r = evaluateRemittance({
      paymentDueAt: '2026-04-14',
      receivedAt: '2026-04-01',
      remainingFen: 2500000,
      now: '2026-09-16',
      kind: 'collection',
    });
    expect(r.code).toBe(RemittanceStatus.OVERDUE);
    expect(r.label).toBe('逾期');
  });

  it('客户汇总：任一逾期则总体为逾期', () => {
    const s = summarizeRemittance([
      { code: RemittanceStatus.ON_TIME },
      { code: RemittanceStatus.OVERDUE },
      { code: RemittanceStatus.NOT_DUE },
    ]);
    expect(s.code).toBe(RemittanceStatus.OVERDUE);
    expect(s.label).toBe('逾期');
    expect(s.settledOnTime).toBe(false);
    expect(s.counts).toEqual({ onTime: 1, overdue: 1, notDue: 1, noRecord: 0 });
  });

  it('交货：实际到货晚于计划为逾期', () => {
    const r = evaluateRemittance({
      kind: 'delivery',
      paymentDueAt: '2026-03-10',
      receivedAt: '2026-03-22',
      now: '2026-09-16',
    });
    expect(r.code).toBe(RemittanceStatus.OVERDUE);
    expect(r.note).toContain('实际到货');
  });
});
