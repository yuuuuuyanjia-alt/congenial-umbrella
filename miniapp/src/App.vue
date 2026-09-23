<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { ensureDemoUser } from './role';
// #ifdef H5
import { enableH5Clipboard } from './h5-selection';
// #endif
onLaunch(() => {
  console.log('出口风控小程序启动');
  ensureDemoUser().catch(() => {});
  // #ifdef H5
  enableH5Clipboard();
  // #endif
});
</script>

<style>
page {
  /* Type scale +4rpx vs previous (~+2px / two steps on 375-wide H5). Body/labels ~16px. */
  --font-xs: 30rpx;
  --font-sm: 32rpx;
  --font-md: 34rpx;
  --font-lg: 36rpx;
  --font-h2: 38rpx;
  --font-stat: 40rpx;
  --font-title: 44rpx;
  --font-h1: 48rpx;
  background: #f4f1ea;
  color: #1f2933;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif;
  font-size: var(--font-sm);
}
/* H5 native controls ignore inherited font-size; keep them on the same scale. */
input,
textarea,
button,
select {
  font-size: inherit;
  font-family: inherit;
}
.wrap {
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 61, 46, 0.08);
}
/* List rows used to set content-visibility:auto. The intrinsic size was
   wrong, so each row that entered the viewport reflowed the shared
   scrollport. WindowedList already limits how many rows mount. */
.scroll-skip {
  content-visibility: visible;
}
.h1 {
  font-size: var(--font-h1);
  font-weight: 700;
  color: #0f3d2e;
}
.h2 {
  font-size: var(--font-h2);
  font-weight: 650;
  color: #0f3d2e;
  margin-bottom: 12rpx;
}
.muted {
  color: #6b7280;
  font-size: var(--font-sm);
  line-height: 1.6;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.badge {
  display: inline-block;
  font-size: var(--font-xs);
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-weight: 600;
}
.badge-pass { background: #e3f4ea; color: #1f7a45; }
.badge-soft { background: #fff4d6; color: #9a6b00; }
.badge-review { background: #ffe8d6; color: #b54708; }
.badge-block { background: #fde8e6; color: #b42318; }
.badge-stub { background: #eef0f3; color: #4b5563; }
.badge-gate { background: #0f3d2e; color: #fff; }
.btn {
  background: #0f3d2e;
  color: #fff;
  text-align: center;
  padding: 22rpx;
  border-radius: 12rpx;
  font-size: var(--font-lg);
  margin-top: 16rpx;
}
.btn-ghost {
  background: #fff;
  color: #0f3d2e;
  border: 2rpx solid #0f3d2e;
}
.btn-danger { background: #b42318; }
.btn-warn { background: #b54708; }
.input {
  background: #f7f5f0;
  border-radius: 10rpx;
  padding: 18rpx 20rpx;
  margin-top: 10rpx;
  font-size: var(--font-md);
}
.label {
  margin-top: 18rpx;
  font-size: var(--font-sm);
  color: #374151;
  font-weight: 600;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
}
.chip {
  font-size: var(--font-xs);
  padding: 10rpx 18rpx;
  background: #e6efe9;
  color: #0f3d2e;
  border-radius: 8rpx;
}
.chip-on { background: #0f3d2e; color: #fff; }
.choice-row {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  margin-top: 12rpx;
}
.choice-btn {
  flex: 1;
  text-align: center;
  padding: 24rpx 12rpx;
  border-radius: 12rpx;
  background: #e6efe9;
  color: #0f3d2e;
  font-size: var(--font-lg);
  font-weight: 650;
  border: 2rpx solid #c5d4cb;
  box-sizing: border-box;
}
.choice-btn-on {
  background: #0f3d2e;
  color: #fff;
  border-color: #0f3d2e;
}
.err {
  background: #fde8e6;
  color: #7a1d16;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: var(--font-sm);
  margin-top: 12rpx;
  line-height: 1.55;
}
.ok {
  background: #e3f4ea;
  color: #14532d;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: var(--font-sm);
  margin-top: 12rpx;
}
.input[disabled] {
  color: #6b7280;
  opacity: 1;
}
.readonly {
  margin-top: 8rpx;
  border: 2rpx solid #e8eef3;
  border-radius: 12rpx;
  padding: 18rpx;
  background: #f7f5f0;
  font-weight: 650;
  color: #0f3d2e;
}

/* #ifdef H5 */
/*
 * One scrollport for every route.
 *
 * uni-h5 base.css sets height:100% on html, body, uni-app, uni-page, and
 * uni-page-wrapper, and overflow-x:hidden on body. That is a second
 * scrollport on every route. A classic scrollbar then changes clientWidth,
 * the rpx hook writes html font-size on resize, and every rem reflows.
 * .card's 24rpx blur repaints with that scroll on the homepage, lists, and
 * long forms. body::after also preloads navbar shadow bitmaps from a CDN.
 *
 * #57 toggled a class on every element to drop selection hit-testing. That
 * restyle ran on the scroll path, and a touch pan cleared the class 160ms
 * later while the finger was still down. Selection stays off the tree here.
 * A fine pointer can still select text. The native input sets user-select
 * itself — WebKit will not type into a control that inherits none.
 */
html {
  height: 100%;
  overflow-x: clip;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: #f4f1ea;
  touch-action: manipulation;
}
body {
  height: auto !important;
  min-height: 100%;
  overflow: visible !important;
  background: #f4f1ea;
  touch-action: manipulation;
}
#app,
uni-app,
uni-page,
uni-page-wrapper,
uni-page-body,
uni-page-head[uni-page-head-type='default'] ~ uni-page-wrapper {
  height: auto !important;
}
/* The fixed title bar sets transition-property:all. Keep it from
   interpolating while the page scrolls, and do not blur it.
   body::after is uni's shadow-bitmap preload (a fixed layer plus a CDN
   fetch). These pages do not use that shadow. */
.uni-page-head,
.uni-tabbar {
  transition: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
body::after {
  content: none !important;
  animation: none !important;
}
.card {
  box-shadow: none;
  border: 1px solid rgba(15, 61, 46, 0.08);
}

html,
body,
uni-app,
uni-page,
uni-page-wrapper,
uni-page-body,
page,
uni-view,
uni-text,
.card,
.h1,
.h2,
.muted,
.label,
.readonly,
.err,
.ok,
.wrap {
  -webkit-user-select: none;
  user-select: none;
}
@media (hover: hover) and (pointer: fine) {
  page,
  uni-page-body,
  uni-view,
  uni-text,
  .card,
  .h1,
  .h2,
  .muted,
  .label,
  .readonly,
  .err,
  .ok,
  .wrap {
    -webkit-user-select: text;
    user-select: text;
    -webkit-touch-callout: default;
  }
}

/* Host stays non-selectable so a short drag cannot steal focus. The native
   control must set user-select itself — WebKit inherits `none` and then
   refuses to type. */
uni-input,
uni-textarea {
  -webkit-user-select: none;
  user-select: none;
}

/* Do not select `input` / `textarea` here. The H5 compiler rewrites those
   element selectors to `uni-input` / `uni-textarea`, which would put
   user-select:text !important back on the host and undo the rule above. */
.uni-input-input,
.uni-textarea-textarea {
  -webkit-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: default !important;
}

/* uni-components input.css: uni-input { height: 1.4em; overflow: hidden }.
   `.input` padding is on that host, so clicks on the gray box miss the
   native <input> (contract, batches, shipment, and every other `.input`).
   Move the padding onto the native control so the whole field takes typing.
   Textarea's placeholder is a full-size overlay without pointer-events:none;
   keep it from covering the control. */
uni-input.input {
  height: auto;
  min-height: 0;
  overflow: visible;
  /* `.input` margin-top is not a hit target, so taps in the gap under the
     label (every N5 row) hit the card and never focus the field. Keep that
     gap, but make it part of the host. background-clip leaves the page color
     showing so the gray box does not grow into the label. */
  margin-top: 0;
  padding: 10rpx 0 0;
  background-clip: content-box;
}
uni-input.input > .uni-input-wrapper {
  height: auto;
  min-height: 0;
}
uni-input.input .uni-input-input {
  /* border-box so width:100% includes the padding. min-height adds the
     vertical padding on top of the 1.4em line; a 1.4em min-height with
     border-box would crush the line and hide typed text. */
  box-sizing: border-box;
  width: 100%;
  height: auto;
  min-height: calc(1.4em + 36rpx);
  padding: 18rpx 20rpx;
}
uni-input.input .uni-input-placeholder,
.uni-textarea-placeholder {
  pointer-events: none;
}
uni-input.input .uni-input-placeholder {
  box-sizing: border-box;
  width: 100%;
  padding: 18rpx 20rpx;
}

/* Buttons/chips can stay non-select; do not put this on .card / .chips wrappers. */
.btn,
.choice-btn,
.chip {
  -webkit-user-select: none;
  user-select: none;
}
/* #endif */
</style>
