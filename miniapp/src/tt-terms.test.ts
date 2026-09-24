import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdvanceVoucherSave, isAdvanceTt, ttTermsSummary } from './tt-terms.ts';

test('收汇页只读展示前/后 T/T 条款', () => {
  assert.equal(
    ttTermsSummary({ ttTiming: 'ADVANCE', ttPercentBps: 3000, ttAdvanceFen: 240_000, currency: 'USD' }),
    '前 T/T · 约定比例 30% · 约定金额 USD 2,400.00',
  );
  assert.equal(
    ttTermsSummary({ ttTiming: 'AFTER', ttDaysAfterShipment: 30, currency: 'USD' }),
    '后 T/T · 到达目的港后付款天数 30 天',
  );
  assert.equal(ttTermsSummary({ paymentTerms: 'L/C' }), '结算方式 L/C');
  assert.equal(isAdvanceTt({ paymentTerms: '前 T/T' }), true);
  assert.equal(isAdvanceTt({ ttTiming: 'AFTER' }), false);
});

test('合同前收汇只保存凭证，不回写比例和约定金额', () => {
  const body = buildAdvanceVoucherSave(
    {
      contract: {
        ttTiming: 'ADVANCE',
        ttPercentBps: 3000,
        ttAdvanceFen: 240_000,
        paymentTerms: '前 T/T',
      },
    },
    [{ ref: 'TT-1', fileName: '水单.png' }],
  );
  assert.deepEqual(body, { ttVouchers: [{ ref: 'TT-1', fileName: '水单.png' }] });
  assert.equal(body && 'ttPercentBps' in body, false);
  assert.equal(body && 'ttAdvanceFen' in body, false);
  assert.equal(body && 'ttTiming' in body, false);
  assert.equal(body && 'ttDaysAfterShipment' in body, false);
  assert.equal(
    buildAdvanceVoucherSave({ contract: { ttTiming: 'AFTER', ttDaysAfterShipment: 30 } }, []),
    null,
  );
});
