<template>
  <view class="card" v-if="target">
    <view class="h2" v-if="heading">{{ heading }}</view>
    <view class="muted">{{ hint }}</view>
    <view class="btn" v-if="ready" @click="$emit('go')">{{ resolvedLabel }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    target: { code: string; name: string } | null;
    ready: boolean;
    hint: string;
    heading?: string;
    buttonLabel?: string;
  }>(),
  {
    heading: '进入下一步',
    buttonLabel: '',
  },
);
defineEmits<{ go: [] }>();

const resolvedLabel = computed(() => {
  if (props.buttonLabel) return props.buttonLabel;
  const t = props.target;
  return t ? `进入下一节点 · ${t.code} ${t.name}` : '';
});
</script>
