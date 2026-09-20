<template>
  <view class="card" v-if="target">
    <view class="h2">九节点下一步</view>
    <view class="muted">{{ hint }}</view>
    <view class="btn" v-if="ready" @click="$emit('go')">进入下一节点 · {{ target.code }} {{ target.name }}</view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  target: { code: string; name: string } | null;
  ready: boolean;
  hint: string;
}>();
defineEmits<{ go: [] }>();
</script>
