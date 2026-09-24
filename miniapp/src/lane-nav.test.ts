import assert from 'node:assert/strict';
import test from 'node:test';
import { homeEntryBlocks, homeEntriesFor } from './home-entries.ts';
import {
  DOCS_HOME_URL,
  SHIPMENT_HOME_URL,
  batchPickUrl,
  guardedNodeEntryUrl,
  laneAllowsCreate,
  resolveBatchLane,
} from './lane-nav.ts';
import { POST_TT_DAYS_HINT, POST_TT_DAYS_LABEL, POST_TT_DAYS_PLACEHOLDER } from './sales-copy.ts';

const pageFor = (code: string) => `/pages/node/${code}`;

test('后 T/T 付款天数只改界面文案', () => {
  assert.equal(POST_TT_DAYS_LABEL, '到达目的港后付款天数');
  assert.equal(POST_TT_DAYS_LABEL.includes('装运后付款天数'), false);
  assert.match(POST_TT_DAYS_PLACEHOLDER, /到达目的港/);
  assert.match(POST_TT_DAYS_HINT, /到达目的港/);
});

test('首页有出运管理、单证管理与费用管理，收汇不进首页', () => {
  for (const role of ['SALES', 'RISK', 'MANAGER']) {
    const labels = homeEntriesFor(role).map((e) => e.label);
    assert.ok(labels.includes('出运管理'), role);
    assert.ok(labels.includes('单证管理'), role);
    assert.ok(labels.includes('费用管理'), role);
    assert.equal(labels.includes('收汇对账'), false);
    const urls = homeEntriesFor(role).map((e) => e.url).join(' ');
    assert.equal(urls.includes('lane=remit'), false);
    assert.equal(urls.includes('/pages/node/shipment'), false);
    assert.equal(urls.includes('/pages/node/docs'), false);
    const lane = homeEntryBlocks(role).find((b) => b.items.some((i) => i.label === '出运管理'));
    assert.equal(lane?.type, 'pair');
    assert.deepEqual(
      lane?.items.map((i) => i.label),
      ['出运管理', '单证管理', '费用管理'],
    );
    assert.deepEqual(
      lane?.items.map((i) => i.url),
      [SHIPMENT_HOME_URL, DOCS_HOME_URL, '/pages/fee/pick'],
    );
  }
});

test('出运可新建批次，单证与收汇只选已有批次', () => {
  assert.equal(laneAllowsCreate('shipment'), true);
  assert.equal(laneAllowsCreate('docs'), false);
  assert.equal(laneAllowsCreate('remit'), false);
  assert.equal(resolveBatchLane({ lane: 'docs' }), 'docs');
  assert.equal(resolveBatchLane({ code: 'N7' }), 'docs');
  assert.equal(resolveBatchLane({ code: 'N9' }), 'remit');
  assert.equal(resolveBatchLane({}), 'shipment');
  assert.match(batchPickUrl('case-1', 'N6'), /lane=shipment&code=N6/);
  assert.match(batchPickUrl('case-1', 'N7'), /lane=docs&code=N7/);
  assert.match(batchPickUrl('case-1', 'N9'), /lane=remit&code=N9/);
  assert.equal(batchPickUrl('case-1', 'N7').includes('pages/node/docs'), false);
});

test('未选批次的装运与单证走同一批次入口，不打开空白节点页', () => {
  const n6 = guardedNodeEntryUrl('case-1', 'N6', null, pageFor);
  const n7 = guardedNodeEntryUrl('case-1', 'N7', '', pageFor);
  assert.match(n6, /lane=shipment&code=N6/);
  assert.match(n7, /lane=docs&code=N7/);
  assert.equal(n6.includes('/pages/node/N6'), false);
  assert.equal(n7.includes('/pages/node/docs'), false);
  assert.equal(
    guardedNodeEntryUrl('case-1', 'N6', 'batch-9', pageFor),
    '/pages/node/N6?id=case-1&code=N6&batchId=batch-9',
  );
  assert.equal(
    guardedNodeEntryUrl('case-1', 'N7', 'batch-9', pageFor),
    '/pages/node/N7?id=case-1&code=N7&batchId=batch-9',
  );
  const n9 = guardedNodeEntryUrl('case-1', 'N9', null, pageFor);
  assert.match(n9, /lane=remit&code=N9/);
  assert.equal(n9.includes(SHIPMENT_HOME_URL), false);
  assert.equal(n9.includes(DOCS_HOME_URL), false);
  assert.equal(
    guardedNodeEntryUrl('case-1', 'N9', 'batch-9', pageFor),
    '/pages/node/N9?id=case-1&code=N9&batchId=batch-9',
  );
  assert.equal(guardedNodeEntryUrl('case-1', 'N3', null, pageFor), '/pages/node/N3?id=case-1&code=N3');
});
