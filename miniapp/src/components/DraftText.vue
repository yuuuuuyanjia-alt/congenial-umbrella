<script setup lang="ts">
/**
 * Evaluate a draft-derived string in this component, not in the page render.
 * The page passes a function and does not call it.
 */
defineProps<{
  text: () => string;
}>();
</script>

<template>
  <text>{{ text() }}</text>
</template>
