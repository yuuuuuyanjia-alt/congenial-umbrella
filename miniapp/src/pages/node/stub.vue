<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">{{ code }} 后续版本占位</view>
      <view class="muted">{{ message }}</view>
      <view class="btn" @click="skip">标记 TODO 并跳过（演示用）</view>
      <view class="ok" v-if="ok">{{ ok }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api } from '../../api';

const id = ref('');
const code = ref('N2');
const message = ref('');
const ok = ref('');

onLoad(async (q) => {
  id.value = q?.id || '';
  code.value = q?.code || 'N2';
  const c = await api.case(id.value);
  const n = c.nodes.find((x: any) => x.code === code.value);
  message.value = n?.summary || '本节点不在 MVP 范围。';
});

async function skip() {
  const r = await api.advance(id.value, code.value);
  ok.value = r.message || '已跳过占位节点';
}
</script>
