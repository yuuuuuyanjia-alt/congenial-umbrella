/**
 * H5 trial clipboard helpers.
 *
 * uni-app's H5 shell sets `user-select: none` on html/body (see
 * @dcloudio/uni-h5/style/framework/base.css). CSS in App.vue turns selection
 * back on; this file keeps copy/paste usable on clickable cards.
 *
 * No copy/cut/paste/contextmenu preventDefault exists in app source; we do not
 * intercept those events so native clipboard and uni.setClipboardData stay intact.
 */

const SELECT_MOVE_PX = 4;

function selectionText(): string {
  if (typeof window === 'undefined' || !window.getSelection) return '';
  return String(window.getSelection()).trim();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest(
    'input, textarea, [contenteditable="true"], uni-input, uni-textarea',
  );
}

/**
 * Allow selecting / copying body text (case nos, labels) without the card's
 * @click navigating away. Clicks on inputs still focus so paste works.
 */
export function enableH5Clipboard(): void {
  if (typeof document === 'undefined') return;

  let pointerX = 0;
  let pointerY = 0;
  let dragged = false;

  document.addEventListener(
    'pointerdown',
    (e) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      dragged = false;
    },
    true,
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      const dx = e.clientX - pointerX;
      const dy = e.clientY - pointerY;
      if (dx * dx + dy * dy > SELECT_MOVE_PX * SELECT_MOVE_PX) dragged = true;
    },
    true,
  );

  document.addEventListener(
    'click',
    (e) => {
      if (!dragged) return;
      if (isEditableTarget(e.target)) return;
      if (!selectionText()) return;
      e.stopImmediatePropagation();
      e.stopPropagation();
    },
    true,
  );
}
