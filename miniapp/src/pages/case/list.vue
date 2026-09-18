<template>
  <view class="wrap">
    <view class="h1" style="margin-bottom: 16rpx">合同管理</view>
    <view class="card" v-for="c in list" :key="c.id" @click="open(c.id)">
      <view class="row">
        <view>
          <view class="muted">{{ c.caseNo }}</view>
          <view class="h2" style="margin: 6rpx 0 0">{{ c.title }}</view>
        </view>
        <view class="badge" :class="decisionClass(c.status === 'BLOCKED' ? 'HARD_BLOCK' : c.overallRisk)">
          {{ decisionText(c.scenario) }}
        </view>
      </view>
      <view class="muted" style="margin-top: 8rpx">当前节点 {{ c.currentNode }} · {{ decisionText(c.status) }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, decisionClass, decisionText } from '../../api';

const list = ref<any[]>([]);

onShow(async () => {
  list.value = await api.cases();
});

function open(id: string) {
  uni.navigateTo({ url: `/pages/case/detail?id=${id}` });
}
</script>
