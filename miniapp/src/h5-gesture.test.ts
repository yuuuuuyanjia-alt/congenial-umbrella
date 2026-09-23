import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  beginPointer,
  createSelectionGesture,
  noteScroll,
  samplePointerMove,
  shouldFocusField,
  shouldFocusLabel,
  shouldPauseSelection,
} from './h5-selection.ts';

test('pointer moves under the tap slop do not count as a drag or a scroll', () => {
  const g = createSelectionGesture();
  beginPointer(g, 10, 20, true);
  assert.equal(samplePointerMove(g, 12, 22), 'track');
  assert.equal(g.dragged, false);
  assert.equal(g.scrolling, false);
  assert.equal(g.listenMove, true);
  assert.equal(shouldFocusField(g, true), true);
});

test('a long pan is a scroll and stops listening for later moves', () => {
  const g = createSelectionGesture();
  beginPointer(g, 0, 0, true);
  assert.equal(samplePointerMove(g, 0, 40), 'scroll');
  assert.equal(g.scrolling, true);
  assert.equal(g.listenMove, false);
  assert.equal(samplePointerMove(g, 0, 400), 'ignore');
  assert.equal(shouldFocusField(g, true), false);
  assert.equal(shouldFocusLabel(g, false), false);
});

test('a short drag still focuses a field shell but not a label', () => {
  const g = createSelectionGesture();
  beginPointer(g, 0, 0, true);
  assert.equal(samplePointerMove(g, 10, 0), 'track');
  assert.equal(g.dragged, true);
  assert.equal(g.scrolling, false);
  assert.equal(shouldFocusField(g, true), true);
  const label = createSelectionGesture();
  beginPointer(label, 0, 0, false);
  samplePointerMove(label, 10, 0);
  assert.equal(shouldFocusLabel(label, false), false);
  assert.equal(shouldFocusField(label, false), false);
});

test('scroll events during a pointer do not require further move samples', () => {
  const g = createSelectionGesture();
  beginPointer(g, 5, 5, false);
  noteScroll(g);
  assert.equal(g.scrolling, true);
  assert.equal(g.listenMove, false);
});

test('wheel scroll without a pointer does not mark the gesture', () => {
  const g = createSelectionGesture();
  noteScroll(g);
  assert.equal(g.scrolling, false);
  assert.equal(shouldPauseSelection(g), true);
});

test('a mouse drag stays a text selection on every page', () => {
  const g = createSelectionGesture();
  beginPointer(g, 0, 0, false, 'mouse');
  assert.equal(samplePointerMove(g, 0, 80), 'track');
  assert.equal(g.scrolling, false);
  assert.equal(g.listenMove, true);
  noteScroll(g);
  assert.equal(g.scrolling, false);
  assert.equal(shouldPauseSelection(g), false);
});

test('the clipboard helper does not register a page scroll listener', () => {
  const src = readFileSync(new URL('./h5-selection.ts', import.meta.url), 'utf8');
  assert.equal(/addEventListener\(\s*['"]scroll['"]/.test(src), false);
  assert.equal(/addEventListener\(\s*['"]wheel['"]/.test(src), false);
  assert.equal(/classList/.test(src), false);
  assert.equal(/h5-scrolling/.test(src), false);
});

test('the shared shell does not restyle the tree while scrolling', () => {
  const css = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
  assert.equal(css.includes('h5-scrolling'), false);
  assert.equal(css.includes('content-visibility: auto'), false);
  assert.equal(css.includes('scrollbar-gutter: stable'), true);
  assert.equal(css.includes('overflow-x: clip'), true);
  assert.equal(css.includes('overflow: visible'), true);
  assert.equal(/box-shadow:\s*0 8rpx 24rpx/.test(css), true);
  const h5 = css.slice(css.indexOf('#ifdef H5'));
  assert.equal(h5.includes('box-shadow: none'), true);
  assert.equal(h5.includes('backdrop-filter: none'), true);
  assert.equal(h5.includes('content: none'), true);
});

test('a touch pan pauses selection hit-testing', () => {
  const g = createSelectionGesture();
  beginPointer(g, 0, 0, false, 'touch');
  assert.equal(shouldPauseSelection(g), false);
  assert.equal(samplePointerMove(g, 0, 40), 'scroll');
  assert.equal(shouldPauseSelection(g), true);
});
