import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const selection = readFileSync(new URL('./h5-selection.ts', import.meta.url), 'utf8');

test('the document scrolls; body is not a nested height-locked scrollport', () => {
  assert.match(app, /height:\s*auto !important/);
  assert.match(app, /overflow-x:\s*clip !important/);
  assert.match(app, /overflow-y:\s*visible !important/);
  assert.match(app, /\.uni-page-head\s*\{[^}]*transition:\s*none !important/s);
});

test('scrolling does not restyle every node to drop selection', () => {
  assert.equal(/html\.h5-scrolling\s*,\s*html\.h5-scrolling\s*\*/.test(app), false);
  assert.match(app, /html\.h5-scrolling uni-page-body/);
  assert.equal(/uni-view,\s*uni-text\s*\{[^}]*user-select:\s*text/s.test(app), false);
});

test('selection pause is not a per-frame scroll listener', () => {
  assert.equal(/addEventListener\(\s*['"]scroll['"]/.test(selection), false);
  assert.match(selection, /addEventListener\(\s*['"]scrollend['"]/);
  assert.equal(/setTimeout\(\s*\(\)\s*=>\s*\{[^}]*h5-scrolling[^}]*\}\s*,\s*160\s*\)/s.test(selection), false);
});

test('long forms are split into skippable sections', () => {
  const procurement = readFileSync(new URL('./pages/node/procurement.vue', import.meta.url), 'utf8');
  const contract = readFileSync(new URL('./pages/node/contract.vue', import.meta.url), 'utf8');
  assert.ok((procurement.match(/scroll-section/g) || []).length >= 4);
  assert.ok((contract.match(/scroll-section/g) || []).length >= 3);
  assert.match(app, /\.scroll-section\s*\{[^}]*content-visibility:\s*auto/s);
});
