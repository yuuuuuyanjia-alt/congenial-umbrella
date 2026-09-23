<script setup lang="ts">
/**
 * Show or hide a block from a draft read that happens here. The page template
 * does not evaluate `open`, so typing into the field that feeds it does not
 * recompute the rest of the page.
 */
defineProps<{
  open: () => boolean;
}>();
</script>

<template>
  <view v-if="open()" class="draft-gate">
    <slot />
  </view>
</template>

<style>
.draft-gate {
  display: contents;
}
</style>
