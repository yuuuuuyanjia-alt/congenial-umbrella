<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">命中处置</view>
      <view class="muted">对筛查命中做误报排除、确认真实、补充信息或持续监控。处置写入审计日志，并按命中所属节点重算 N1 客户 KYC 或 N5 供应商闸门。</view>
    </view>
    <view class="card" v-for="h in queue" :key="h.id">
      <view class="row">
        <view>
          <view class="muted">{{ h.case?.caseNo }}</view>
          <view class="h2" style="margin: 0">{{ h.matchedName }}</view>
          <view class="muted">{{ h.listCode }} · {{ h.listedName }} · {{ h.confidence }} · {{ h.nodeCode === 'N5' || h.party?.role === 'SUPPLIER' ? '国内供应商' : '客户当事方' }}</view>
        </view>
        <view class="badge" :class="decisionClass(h.riskLevel)">{{ decisionText(h.disposition) }}</view>
      </view>
      <view class="btn btn-ghost" @click="act(h, 'FALSE_POSITIVE')">误报排除</view>
      <view class="btn btn-danger" @click="act(h, 'CONFIRM_TRUE')">确认真实</view>
      <view class="btn btn-warn" @click="act(h, 'SUPPLEMENT')">补充信息</view>
      <view class="btn" @click="act(h, 'MONITOR')">持续监控</view>
    </view>
    <view class="muted" v-if="!queue.length">审核队列为空。</view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, decisionClass, decisionText } from '../../api';

const queue = ref<any[]>([]);

onShow(load);
async function load() {
  queue.value = await api.queue();
}

async function act(h: any, action: string) {
  await api.workbench(h.caseId, { hitId: h.id, action, comment: `工作台处置 ${action}` });
  uni.showToast({ title: '已记录处置', icon: 'none' });
  await load();
}
</script>
