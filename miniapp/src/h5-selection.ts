/**
 * H5 trial clipboard + text-entry helpers.
 *
 * uni-app's H5 shell sets `user-select: none` on html/body (see
 * @dcloudio/uni-h5/style/framework/base.css). CSS in App.vue turns selection
 * back on for copyable text. Two side effects of that override blocked typing
 * on contract / batch / shipment fields:
 *
 * 1. `<uni-input>` is only 1.4em tall with overflow hidden
 *    (`@dcloudio/uni-components/style/input.css`). The gray `.input` padding
 *    sits on the host, so most of the visible box is not the native
 *    `<input>`. A click there never focuses the control.
 * 2. With `user-select: text` on the page, that same click-drag selects the
 *    host (or a nearby label) and blurs the field. The old drag-select
 *    listener then `stopImmediatePropagation`'d the click whenever the pointer
 *    moved a few pixels, so the caret click never reached the control.
 *
 * This file focuses the inner input/textarea when the pointer lands on the
 * shell, the gap under a `.label`, or the label itself (a tap, not a
 * drag-select). N5 is the worst case: supplier, PO, dates, and delay notes
 * are a long run of label + gap + field, and those misses feel like a stuck
 * caret. Card `@click` is still ignored after a drag-select on non-field copy.
 * No copy/cut/paste/contextmenu/keydown/beforeinput preventDefault — native
 * clipboard and typing stay intact. Do not preventDefault on pointerdown:
 * that cancels the caret.
 *
 * Scroll (every H5 page, not one route): App.vue keeps the document as the
 * only scrollport and leaves the tree non-selectable, so a pan does not
 * hit-test or restyle. This file does not listen for scroll or wheel, and
 * it does not toggle a class on the document. Move listeners exist only
 * while a pointer is down, compare coordinates, then detach once the gesture
 * is a scroll. A mouse drag still selects text where the pointer is fine.
 * Focus walks happen on click, and only when the gesture was not a scroll.
 */

const SELECT_MOVE_PX = 4;
/** A pan this large is a scroll, not a shaky tap or a short text selection. */
const SCROLL_MOVE_PX = 16;

export type SelectionGesture = {
  id: number;
  pointerDown: boolean;
  x: number;
  y: number;
  dragged: boolean;
  scrolling: boolean;
  onField: boolean;
  listenMove: boolean;
  /** mouse drags select text; touch pans scroll. Empty means a generic pan. */
  pointerType: string;
};

export function createSelectionGesture(): SelectionGesture {
  return {
    id: 0,
    pointerDown: false,
    x: 0,
    y: 0,
    dragged: false,
    scrolling: false,
    onField: false,
    listenMove: false,
    pointerType: '',
  };
}

export function beginPointer(
  g: SelectionGesture,
  x: number,
  y: number,
  onField: boolean,
  pointerType = '',
): void {
  g.id += 1;
  g.pointerDown = true;
  g.x = x;
  g.y = y;
  g.dragged = false;
  g.scrolling = false;
  g.onField = onField;
  g.listenMove = true;
  g.pointerType = pointerType;
}

/**
 * Distance check only. Callers must not query the DOM, selection, or focus
 * from pointermove / touchmove / scroll — that work is what janks a pan.
 * Returns `scroll` once the move listener should be removed.
 */
export function samplePointerMove(g: SelectionGesture, x: number, y: number): 'ignore' | 'track' | 'scroll' {
  if (!g.pointerDown || !g.listenMove) return 'ignore';
  const dx = x - g.x;
  const dy = y - g.y;
  const dist2 = dx * dx + dy * dy;
  if (dist2 <= SELECT_MOVE_PX * SELECT_MOVE_PX) return 'track';
  g.dragged = true;
  // A mouse drag is a text selection on every page. Only a touch/pen pan
  // (or an unspecified pointer) is a scroll we should stop tracking.
  if (g.pointerType !== 'mouse' && dist2 >= SCROLL_MOVE_PX * SCROLL_MOVE_PX) {
    g.scrolling = true;
    g.listenMove = false;
    return 'scroll';
  }
  return 'track';
}

/** A real scroll event during the gesture. No layout reads. */
export function noteScroll(g: SelectionGesture): void {
  if (!g.pointerDown || g.pointerType === 'mouse') return;
  g.dragged = true;
  g.scrolling = true;
  g.listenMove = false;
}

/**
 * Wheel, trackpad, and touch pans should drop selection hit-testing.
 * A mouse-button drag is a copy gesture and must keep user-select.
 */
export function shouldPauseSelection(g: SelectionGesture): boolean {
  if (!g.pointerDown) return true;
  if (g.pointerType === 'mouse') return false;
  return g.scrolling;
}

export function endPointer(g: SelectionGesture): void {
  g.pointerDown = false;
  g.listenMove = false;
}

export function shouldFocusField(g: SelectionGesture, hasField: boolean): boolean {
  if (!hasField || g.scrolling) return false;
  return g.onField || !g.dragged;
}

export function shouldFocusLabel(g: SelectionGesture, hasField: boolean): boolean {
  return !g.scrolling && !g.dragged && !g.onField && !hasField;
}

const FIELD_HOST = 'uni-input, uni-textarea';

const NON_TEXT_INPUT = new Set([
  'button',
  'checkbox',
  'radio',
  'file',
  'hidden',
  'submit',
  'reset',
  'image',
  'range',
  'color',
]);

export function isTextEntryField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !NON_TEXT_INPUT.has((el.type || 'text').toLowerCase());
}

function elementFromTarget(target: EventTarget | null): Element | null {
  if (!target) return null;
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/** Native control that should receive keystrokes for this hit target. */
export function textEntryField(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  const el = elementFromTarget(target);
  if (!el) return null;
  if (isTextEntryField(el)) return el;
  const host = el.closest(FIELD_HOST);
  if (!host) return null;
  const field = host.querySelector('input, textarea');
  return isTextEntryField(field) ? field : null;
}

function selectionText(): string {
  if (typeof window === 'undefined' || !window.getSelection) return '';
  return String(window.getSelection()).trim();
}

const SKIP_TO_FIELD = '.muted, .readonly, .err, .ok';
const STOP_BEFORE_FIELD = '.label, .btn, .choice-row, .choice-btn, .chips, .h1, .h2, .pick';

/**
 * A tap on the caption above a field should type into that field. Dragging
 * the caption still selects it for copy, so this is only used when the
 * pointer did not move.
 */
export function fieldAfterLabel(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  const el = elementFromTarget(target);
  if (!el || el.closest('.btn, .choice-btn, .chip, .pick, button, a')) return null;
  const label = el.closest('.label');
  if (!label) return null;
  let next = label.nextElementSibling;
  for (let i = 0; i < 3 && next; i += 1) {
    if (next.matches(STOP_BEFORE_FIELD)) break;
    const host = next.matches(`${FIELD_HOST}, input, textarea`) ? next : null;
    if (host) {
      if (isTextEntryField(host)) return host.disabled ? null : host;
      const field = host.querySelector('input, textarea');
      if (isTextEntryField(field) && !field.disabled) return field;
      return null;
    }
    if (!next.matches(SKIP_TO_FIELD)) break;
    next = next.nextElementSibling;
  }
  return null;
}

function focusField(field: HTMLInputElement | HTMLTextAreaElement) {
  if (field.disabled || document.activeElement === field) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    const node = sel.anchorNode;
    const owner = node instanceof Element ? node : node?.parentElement ?? null;
    if (!owner || !field.contains(owner)) sel.removeAllRanges();
  }
  try {
    field.focus({ preventScroll: true });
  } catch {
    field.focus();
  }
}

/**
 * Allow selecting / copying body text (case nos, labels) without the card's
 * @click navigating away. Clicks and short drags on inputs still focus so
 * typing and paste work.
 */
let clipboardInstalled = false;

export function enableH5Clipboard(): void {
  if (typeof document === 'undefined' || clipboardInstalled) return;
  clipboardInstalled = true;

  const g = createSelectionGesture();
  const passiveCapture: AddEventListenerOptions = { capture: true, passive: true };

  const onPointerMove = (e: PointerEvent) => {
    if (samplePointerMove(g, e.clientX, e.clientY) !== 'scroll') return;
    detachMove();
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.changedTouches[0] || e.touches[0];
    if (!t) return;
    if (samplePointerMove(g, t.clientX, t.clientY) !== 'scroll') return;
    detachMove();
  };
  const detachMove = () => {
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('touchmove', onTouchMove, true);
  };
  const attachMove = () => {
    detachMove();
    document.addEventListener('pointermove', onPointerMove, passiveCapture);
    document.addEventListener('touchmove', onTouchMove, passiveCapture);
  };

  document.addEventListener(
    'pointerdown',
    (e) => {
      const field = textEntryField(e.target);
      beginPointer(g, e.clientX, e.clientY, !!field && !field.disabled, e.pointerType);
      attachMove();
      // Do not focus here. A pan often starts on the field padding; focusing
      // on pointerdown forces layout and pulls the caret into a scroll.
    },
    passiveCapture,
  );

  const finishPointer = (e: PointerEvent) => {
    const tapOnShell = g.onField && !g.dragged && !g.scrolling;
    endPointer(g);
    detachMove();
    if (!tapOnShell) return;
    const field = textEntryField(e.target);
    if (!field || field.disabled || e.target === field) return;
    focusField(field);
  };
  document.addEventListener('pointerup', finishPointer, passiveCapture);
  document.addEventListener('pointercancel', () => {
    endPointer(g);
    detachMove();
  }, passiveCapture);

  document.addEventListener(
    'click',
    (e) => {
      const startedOnField = g.onField;
      const scrolling = g.scrolling;
      const dragged = g.dragged;
      g.onField = false;
      // A pan is not a tap. Skip field walks, getSelection, and focus.
      if (scrolling) {
        g.scrolling = false;
        e.stopImmediatePropagation();
        e.stopPropagation();
        return;
      }
      const field = textEntryField(e.target);
      const focusable = !!field && !field.disabled && document.activeElement !== field;
      // iOS only honors focus() from click, not pointerdown. A drag that
      // started on a label and ended on a field is a copy gesture — don't
      // focus and collapse that selection.
      if (focusable && shouldFocusField({ ...g, onField: startedOnField, scrolling, dragged }, true)) {
        focusField(field!);
      }
      if (shouldFocusLabel({ ...g, onField: startedOnField, scrolling, dragged }, !!field)) {
        const labeled = fieldAfterLabel(e.target);
        if (labeled) {
          focusField(labeled);
          e.stopPropagation();
        }
      }
      // Never steal a field gesture. stopImmediatePropagation here used to
      // drop the caret click after a 4px move while selecting text.
      if (startedOnField || field) return;
      if (!dragged) return;
      if (!selectionText()) return;
      e.stopImmediatePropagation();
      e.stopPropagation();
    },
    true,
  );
}
