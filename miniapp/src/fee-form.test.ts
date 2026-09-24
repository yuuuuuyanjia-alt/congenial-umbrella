import assert from 'node:assert/strict';
import test from 'node:test';
import { feeSaveBody, optionalYuanToFen, yuanInputFromFen } from './fee-form.ts';

test('费用金额可留空，0 与空不同', () => {
  assert.equal(optionalYuanToFen(''), null);
  assert.equal(optionalYuanToFen('   '), null);
  assert.equal(optionalYuanToFen(null), null);
  assert.equal(optionalYuanToFen('0'), 0);
  assert.equal(optionalYuanToFen('12.5'), 1250);
  assert.equal(optionalYuanToFen('1,200.00'), 120000);
  assert.equal(yuanInputFromFen(null), '');
  assert.equal(yuanInputFromFen(0), '0.00');
  assert.equal(yuanInputFromFen(1250), '12.50');
});

test('整单可空、可部分、可含自定义行', () => {
  assert.deepEqual(feeSaveBody({ oceanYuan: '', inlandYuan: '', portYuan: '', insuranceYuan: '' }, []), {
    currency: 'CNY',
    oceanFreightFen: null,
    inlandFreightFen: null,
    portChargesFen: null,
    insuranceFen: null,
    custom: [],
  });
  assert.deepEqual(
    feeSaveBody(
      { oceanYuan: '100', inlandYuan: '', portYuan: '0', insuranceYuan: '' },
      [
        { name: '文件费', amountYuan: '8' },
        { name: '', amountYuan: '' },
      ],
    ),
    {
      currency: 'CNY',
      oceanFreightFen: 10000,
      inlandFreightFen: null,
      portChargesFen: 0,
      insuranceFen: null,
      custom: [
        { name: '文件费', amountFen: 800 },
        { name: '', amountFen: null },
      ],
    },
  );
});

test('非数字金额不提交', () => {
  assert.throws(() => optionalYuanToFen('-1'), /非负/);
  assert.throws(() => optionalYuanToFen('abc'), /非负/);
});
