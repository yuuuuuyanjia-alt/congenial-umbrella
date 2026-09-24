import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdvanceReceiptSave, isAdvanceTt, ttTermsSummary } from './tt-terms.ts';

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

test('合同前收汇只改凭证和比例，并保留运输术语', () => {
  const body = buildAdvanceReceiptSave(
    {
      customer: 'Nordlicht',
      contract: {
        counterparty: 'Nordlicht GmbH',
        buyerName: 'Nordlicht GmbH',
        incoterms: 'CIF',
        paymentTerms: '前 T/T',
        ttTiming: 'ADVANCE',
        ttPercentBps: 3000,
        ttAdvanceFen: 100,
        ttDaysAfterShipment: null,
        currency: 'USD',
        amountFen: 800_000,
        quantity: 10,
        unit: 'TON',
        deliveryMode: 'OWN_WAREHOUSE',
        loadingPort: 'Shanghai',
      },
    },
    { percent: '40', amountYuan: '3200.00', vouchers: [{ ref: 'TT-1', fileName: '水单.png' }] },
  );
  assert.equal(body?.incoterms, 'CIF');
  assert.equal(body?.ttTiming, 'ADVANCE');
  assert.equal(body?.ttPercentBps, 4000);
  assert.equal(body?.ttAdvanceFen, 320_000);
  assert.equal(body?.loadingPort, 'Shanghai');
  assert.equal(body?.deliveryMode, 'OWN_WAREHOUSE');
  assert.deepEqual(body?.ttVouchers, [{ ref: 'TT-1', fileName: '水单.png' }]);
  assert.equal(buildAdvanceReceiptSave({ contract: { ttTiming: 'AFTER', ttDaysAfterShipment: 30 } }, {
    percent: '30',
    amountYuan: '1',
    vouchers: [],
  }), null);
});
