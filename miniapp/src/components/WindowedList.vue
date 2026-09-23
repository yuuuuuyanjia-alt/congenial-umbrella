<template>
  <view class="windowed-list">
    <view v-for="(item, index) in visible" :key="keyFor(item, index)" class="windowed-row">
      <slot :item="item" :index="index" />
    </view>
    <view v-if="hasMore" :class="sentinelClass" class="window-sentinel">
      <view class="muted window-more" @click="reveal">继续加载 {{ restCount }} 条</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  LIST_WINDOW_PAGE,
  itemWindowId,
  itemWindowIds,
  nextSentinelClass,
  nextWindowCount,
  revealWindow,
  sliceWindow,
} from '../list-window';

const props = withDefaults(
  defineProps<{
    items?: readonly any[] | null;
    pageSize?: number;
    keyField?: string;
  }>(),
  { items: () => [], pageSize: LIST_WINDOW_PAGE, keyField: 'id' },
);

const sentinelClass = nextSentinelClass();
const shown = ref(props.pageSize);

const visible = computed(() => sliceWindow(props.items, shown.value));
const total = computed(() => props.items?.length || 0);
const hasMore = computed(() => shown.value < total.value);
const restCount = computed(() => Math.max(0, total.value - shown.value));

function splitIds(sig?: string) {
  return sig ? sig.split('\n') : [];
}

function keyFor(item: any, index: number) {
  return itemWindowId(item, index, props.keyField);
}

function reveal() {
  shown.value = revealWindow(shown.value, total.value, props.pageSize);
}

watch(
  () => itemWindowIds(props.items, props.keyField).join('\n'),
  (sig, prev) => {
    shown.value = nextWindowCount(splitIds(prev), splitIds(sig), shown.value, props.pageSize);
  },
);

let io: IntersectionObserver | null = null;

async function bindIo() {
  await nextTick();
  io?.disconnect();
  io = null;
  if (!hasMore.value || typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') return;
  const el = document.querySelector(`.${sentinelClass}`);
  if (!el) return;
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) reveal();
    },
    { root: null, rootMargin: '0px' },
  );
  io.observe(el);
}

watch([hasMore, shown, total], () => {
  bindIo();
});
onMounted(bindIo);
onBeforeUnmount(() => io?.disconnect());
</script>

<style>
.windowed-list,
.windowed-row {
  display: contents;
}
.window-more {
  margin: 8rpx 0 20rpx;
}
</style>
