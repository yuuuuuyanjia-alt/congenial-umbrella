<template>
  <view class="card" v-if="items.length">
    <view class="h2">变更未生效 · 禁止装运</view>
    <view class="err">{{ N6_PLUS_PENDING_CHANGE_REASON }}</view>
    <view class="muted" v-for="co in items" :key="co.id || co.changeNo">
      {{ co.changeNo }} · {{ statusLabel(co.status) }}
    </view>
    <view class="btn btn-ghost" @click="goChange">去变更管理确认并生效</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { N6_PLUS_PENDING_CHANGE_REASON, pendingChangesOf } from '../api';

const props = defineProps<{
  caseId: string;
  caseData?: any;
}>();

const items = computed(() => pendingChangesOf(props.caseData));

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PENDING_ACK: '待确认',
    PENDING_APPROVAL: '待审批',
  };
  return map[String(status || '')] || status || '未生效';
}

function goChange() {
  if (!props.caseId) return;
  uni.navigateTo({ url: `/pages/node/change?id=${props.caseId}` });
}
</script>
