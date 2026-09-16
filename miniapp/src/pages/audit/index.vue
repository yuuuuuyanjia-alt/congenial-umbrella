<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">审计日志（仅追加）</view>
      <view class="muted">系统不提供修改或删除审计记录的接口。</view>
    </view>
    <view class="card" v-for="a in logs" :key="a.id">
      <view class="row">
        <view class="h2" style="margin: 0">{{ a.action }}</view>
        <view class="muted">{{ a.nodeCode }}</view>
      </view>
      <view class="muted">{{ a.createdAt }} · {{ a.actor?.name || '系统' }}</view>
      <view class="muted">{{ stringify(a.detail) }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api } from '../../api';

const logs = ref<any[]>([]);

onLoad(async (q) => {
  logs.value = await api.audit(q?.id);
});

function stringify(d: any) {
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}
</script>
