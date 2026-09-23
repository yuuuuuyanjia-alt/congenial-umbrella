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
 */

const SELECT_MOVE_PX = 4;

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
export function enableH5Clipboard(): void {
  if (typeof document === 'undefined') return;

  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;
  let dragged = false;
  let gestureOnField = false;

  document.addEventListener(
    'pointerdown',
    (e) => {
      pointerDown = true;
      pointerX = e.clientX;
      pointerY = e.clientY;
      dragged = false;
      const field = textEntryField(e.target);
      gestureOnField = !!field;
      if (!field || field.disabled || e.target === field) return;
      // Padding, wrapper, or placeholder overlay — not the native control.
      focusField(field);
    },
    true,
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      if (!pointerDown) return;
      const dx = e.clientX - pointerX;
      const dy = e.clientY - pointerY;
      if (dx * dx + dy * dy > SELECT_MOVE_PX * SELECT_MOVE_PX) dragged = true;
    },
    true,
  );

  const endPointer = () => {
    pointerDown = false;
  };
  document.addEventListener('pointerup', endPointer, true);
  document.addEventListener('pointercancel', endPointer, true);

  document.addEventListener(
    'click',
    (e) => {
      const startedOnField = gestureOnField;
      gestureOnField = false;
      const field = textEntryField(e.target);
      // iOS only honors focus() from click, not pointerdown. A drag that
      // started on a label and ended on a field is a copy gesture — don't
      // focus and collapse that selection.
      if (field && !field.disabled && document.activeElement !== field && (startedOnField || !dragged)) {
        focusField(field);
      }
      if (!startedOnField && !field && !dragged) {
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
