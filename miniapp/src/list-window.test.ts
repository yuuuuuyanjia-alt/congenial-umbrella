import assert from 'node:assert/strict';
import test from 'node:test';
import {
  itemWindowIds,
  nextWindowCount,
  revealWindow,
  sliceWindow,
} from './list-window.ts';

test('a window renders a prefix, not the whole list', () => {
  const items = [1, 2, 3, 4, 5];
  assert.deepEqual(sliceWindow(items, 2), [1, 2]);
  assert.deepEqual(sliceWindow(items, 0), []);
  assert.deepEqual(sliceWindow(null, 3), []);
  assert.deepEqual(sliceWindow(items, 9), items);
});

test('replacing the list resets to one page; a stable prefix keeps the window', () => {
  const prev = itemWindowIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
  assert.equal(nextWindowCount(prev, prev, 4, 2), 4);
  assert.equal(nextWindowCount(prev, [...prev, 'e'], 4, 2), 4);
  assert.equal(nextWindowCount(prev, ['a', 'b', 'x'], 4, 2), 2);
  assert.equal(nextWindowCount([], ['a', 'b', 'c'], 2, 2), 2);
});

test('reveal grows by one page and stops at the end', () => {
  assert.equal(revealWindow(2, 10, 2), 4);
  assert.equal(revealWindow(8, 10, 6), 10);
  assert.equal(revealWindow(10, 10, 6), 10);
});
