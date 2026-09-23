import { RemittanceStatus } from '../customers/remittance';
import {
  InstallmentStatus,
  PaymentMode,
  agreedPaymentTime,
  buildInstallmentRecords,
  evaluateInstallment,
  presentPlanPayment,
  resolveSchedule,
  scheduleWording,
  toPercentBps,
  validateStagedInstallments,
} from './payment-schedule';

describe('采购货款分期', () => {
  it('90/10 按采购总额拆出到货与尾款金额', () => {
    const rows = resolveSchedule(28000000, [
      { percent: 90, conditionText: '货物到达交付地点之后支付' },
      { percent: 10, conditionText: '验收合格后支付' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].percentBps).toBe(9000);
    expect(rows[0].amountFen).toBe(25200000);
    expect(rows[0].label).toBe('到货付款');
    expect(rows[1].percentBps).toBe(1000);
    expect(rows[1].amountFen).toBe(2800000);
    expect(rows[1].label).toBe('尾款');
    expect(rows[0].amountFen + rows[1].amountFen).toBe(28000000);
  });

  it('尾款吃剩余，避免分位舍入后对不齐', () => {
    const rows = resolveSchedule(10000, [
      { percentBps: 3333 },
      { percentBps: 3333 },
      { percentBps: 3334 },
    ]);
    expect(rows.map((r) => r.amountFen)).toEqual([3333, 3333, 3334]);
    expect(rows.reduce((s, r) => s + r.amountFen, 0)).toBe(10000);
  });

  it('只填金额时按金额入账，最后一期仍轧差', () => {
    const rows = resolveSchedule(150000, [{ amountFen: 100000 }, { amountFen: 999 }]);
    expect(rows[0].amountFen).toBe(100000);
    expect(rows[1].amountFen).toBe(50000);
  });

  it('百分比与基点换算', () => {
    expect(toPercentBps(90)).toBe(9000);
    expect(toPercentBps(10.5)).toBe(1050);
    expect(toPercentBps(undefined, 9000)).toBe(9000);
  });

  it('一次性付清为单期 100%', () => {
    const rows = resolveSchedule(82000000, [
      { percentBps: 10000, label: '一次性付清', conditionText: '一次性付清', paidFen: 82000000 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountFen).toBe(82000000);
    expect(rows[0].label).toBe('一次性付清');
    const evaled = evaluateInstallment(rows[0], '2026-09-16');
    expect(evaled.status).toBe(InstallmentStatus.PAID);
    expect(evaled.statusLabel).toBe('已付清');
    expect(evaled.unpaidFen).toBe(0);
  });

  it('各期独立判断逾期：到货款按期、尾款逾期', () => {
    const rows = resolveSchedule(1000000, [
      {
        percent: 90,
        dueAt: '2026-03-25',
        paidFen: 900000,
        paidAt: '2026-03-20',
      },
      {
        percent: 10,
        dueAt: '2026-04-30',
        paidFen: 0,
      },
    ]);
    const first = evaluateInstallment(rows[0], '2026-09-16');
    const residual = evaluateInstallment(rows[1], '2026-09-16');
    expect(first.status).toBe(InstallmentStatus.PAID);
    expect(first.timing.code).toBe(RemittanceStatus.ON_TIME);
    expect(first.duePassed).toBe(false);
    expect(residual.status).toBe(InstallmentStatus.OVERDUE);
    expect(residual.statusLabel).toBe('逾期');
    expect(residual.duePassed).toBe(true);
    expect(residual.unpaidFen).toBe(100000);
    expect(residual.timing.code).toBe(RemittanceStatus.OVERDUE);
  });

  it('未到约定付款日的未付期为未到期', () => {
    const rows = resolveSchedule(46000000, [
      { percent: 90, dueAt: '2026-12-20', paidFen: 0 },
      { percent: 10, dueAt: '2027-01-31', paidFen: 0, conditionText: '质保期满后支付' },
    ]);
    const first = evaluateInstallment(rows[0], '2026-09-16');
    expect(first.status).toBe(InstallmentStatus.NOT_DUE);
    expect(first.statusLabel).toBe('未到期');
    expect(first.duePassed).toBe(false);
  });

  it('已付清但付款日晚于约定日：状态已付清，时点逾期', () => {
    const row = resolveSchedule(10000, [
      { percent: 100, dueAt: '2026-04-01', paidFen: 10000, paidAt: '2026-05-10' },
    ])[0];
    const evaled = evaluateInstallment(row, '2026-09-16');
    expect(evaled.status).toBe(InstallmentStatus.PAID);
    expect(evaled.timing.code).toBe(RemittanceStatus.OVERDUE);
    expect(evaled.duePassed).toBe(false);
  });

  it('采购单汇总：任一期逾期则总体逾期', () => {
    const presented = presentPlanPayment(
      {
        amountFen: 28000000,
        currency: 'CNY',
        paymentMode: PaymentMode.STAGED,
        installments: [
          { percent: 90, dueAt: '2026-03-25', paidFen: 25200000, paidAt: '2026-05-10' },
          { percent: 10, dueAt: '2026-04-30', paidFen: 0, conditionText: '验收合格后支付' },
        ],
      },
      '2026-09-16',
    );
    expect(presented.paymentModeLabel).toBe('分期支付');
    expect(presented.paidFen).toBe(25200000);
    expect(presented.unpaidFen).toBe(2800000);
    expect(presented.payment.code).toBe(RemittanceStatus.OVERDUE);
    expect(presented.installments[0].statusLabel).toBe('已付清');
    expect(presented.installments[1].statusLabel).toBe('逾期');
    expect(presented.wording).toContain('货物到达交付地点之后支付（90）%货款');
    expect(presented.wording).toContain('验收合格后支付');
  });

  it('示例措辞填入比例、尾款金额与条件', () => {
    const rows = resolveSchedule(1000000, [
      { percent: 90 },
      { percent: 10, amountFen: 100000, conditionText: '验收合格后支付' },
    ]).map((r) => evaluateInstallment(r, '2026-09-16'));
    expect(scheduleWording(rows, 'CNY')).toBe(
      '货物到达交付地点之后支付（90）%货款，剩余尾款（CNY 1,000.00）于（验收合格后支付）支付',
    );
  });

  it('一次性付清不要求已付货款与付款日期，省略时保留原账', () => {
    const fresh = buildInstallmentRecords({
      paymentMode: PaymentMode.FULL,
      amountFen: 21000000,
      paymentDueAt: '2026-12-01',
    });
    expect(fresh.paymentMode).toBe(PaymentMode.FULL);
    expect(fresh.resolved).toHaveLength(1);
    expect(fresh.rollup.paidFen).toBe(0);
    expect(fresh.rollup.paidAt).toBeNull();

    const kept = buildInstallmentRecords(
      {
        paymentMode: PaymentMode.FULL,
        amountFen: 21000000,
        paymentDueAt: '2026-12-01',
      },
      {
        paymentMode: PaymentMode.FULL,
        amountFen: 21000000,
        paidFen: 500,
        paidAt: '2026-08-01',
        paymentDueAt: '2026-12-01',
      },
    );
    expect(kept.rollup.paidFen).toBe(500);
    expect(kept.resolved[0].paidAt).toBe('2026-08-01');
  });

  it('保存一次性付清时合成单期并回写已付总额', () => {
    const built = buildInstallmentRecords({
      paymentMode: PaymentMode.FULL,
      amountFen: 21000000,
      paidFen: 21000000,
      paymentDueAt: '2026-12-01',
      paidAt: '2026-09-01',
    });
    expect(built.paymentMode).toBe(PaymentMode.FULL);
    expect(built.resolved).toHaveLength(1);
    expect(built.rollup.paidFen).toBe(21000000);
  });

  it('分期支付缺少付款比例、金额或约定付款时间则列出缺口', () => {
    expect(validateStagedInstallments([{ percent: 90 }])).toEqual([
      '分期支付至少两期，每一期须填写约定付款时间、付款比例、金额',
    ]);
    expect(
      validateStagedInstallments([
        { percent: 90, amountFen: 9000, dueAt: '2026-11-01' },
        { amountFen: 1000, conditionText: '验收后支付' },
      ]),
    ).toContain('第2期须填写付款比例');
    expect(
      validateStagedInstallments([
        { percent: 90, dueAt: '2026-11-01' },
        { percent: 10, amountFen: 1000, conditionText: '验收后支付' },
      ]),
    ).toContain('第1期须填写金额');
    expect(
      validateStagedInstallments([
        { percent: 90, amountFen: 9000 },
        { percent: 10, amountFen: 1000, dueAt: '2026-12-01' },
      ]),
    ).toContain('第1期须填写约定付款时间（约定日期或触发时间）');
    expect(
      validateStagedInstallments([
        { percent: 90, amountFen: 9000, conditionText: '货物到达交付地点之后支付' },
        { percent: 10, amountFen: 1000, dueAt: '2026-12-01' },
      ]),
    ).toEqual([]);
  });

  it('约定付款时间可只填日期、只填触发，或两者', () => {
    expect(agreedPaymentTime({ dueAt: '2026-11-28', conditionText: '货物到达交付地点之后支付' })).toBe(
      '2026-11-28（货物到达交付地点之后支付）',
    );
    expect(agreedPaymentTime({ dueAt: '2026-11-28' })).toBe('2026-11-28');
    expect(agreedPaymentTime({ conditionText: '验收合格后支付' })).toBe('验收合格后支付');
  });
});
