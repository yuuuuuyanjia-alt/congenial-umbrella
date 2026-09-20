<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">审核工作台</view>
      <view class="muted">
        筛查命中可做误报排除 / 确认真实 / 补充信息 / 持续监控。中信保占用高风险须
        <text class="emph">领取、放行或驳回</text>
        ；放行后业务可推进，驳回后仍阻断。超高风险不进本队列（硬拦截），中风险不进本队列（软提示）。处置写入审计日志。
      </view>
    </view>

    <view class="card" v-for="h in occupancyQueue" :key="'occ-' + h.id">
      <view class="row">
        <view>
          <view class="muted">{{ h.case?.caseNo }} · {{ h.nodeCode }}</view>
          <view class="h2" style="margin: 0">中信保占用高风险</view>
          <view class="muted">
            占用 {{ money(h.occupancyFen, h.currency) }} · 限额 {{ money(h.insuredLimitFen, h.currency) }} · 超额
            {{ money(h.excessFen, h.currency) }}
          </view>
          <view class="muted" v-if="h.claimedBy">领取人：{{ h.claimedBy.name }}</view>
        </view>
        <view class="badge" :class="occupancyBadge(h.status)">{{ h.statusLabel || decisionText(h.status) }}</view>
      </view>
      <view class="muted" style="margin-top: 8rpx">放行后无需改合同金额即可推进；驳回后仍不得推进。</view>
      <input class="input" v-model="comments[h.id]" placeholder="审核备注（可选）" />
      <view class="btn" v-if="h.status === 'OPEN' || h.status === 'REJECTED'" @click="actOccupancy(h, 'CLAIM')">领取</view>
      <view class="btn" v-if="h.status !== 'APPROVED'" @click="actOccupancy(h, 'APPROVE')">放行</view>
      <view class="btn btn-danger" v-if="h.status === 'OPEN' || h.status === 'CLAIMED'" @click="actOccupancy(h, 'REJECT')">驳回</view>
    </view>

    <view class="card" v-for="h in hitQueue" :key="'hit-' + h.id">
      <view class="row">
        <view>
          <view class="muted">{{ h.case?.caseNo }}</view>
          <view class="h2" style="margin: 0">{{ h.matchedName }}</view>
          <view class="muted">{{ h.listCode }} · {{ h.listedName }} · {{ h.confidence }} · {{ h.nodeCode === 'N5' || h.party?.role === 'SUPPLIER' ? '国内供应商' : '客户当事方' }}</view>
        </view>
        <view class="badge" :class="decisionClass(h.riskLevel)">{{ decisionText(h.disposition) }}</view>
      </view>
      <view class="btn btn-ghost" @click="actHit(h, 'FALSE_POSITIVE')">误报排除</view>
      <view class="btn btn-danger" @click="actHit(h, 'CONFIRM_TRUE')">确认真实</view>
      <view class="btn btn-warn" @click="actHit(h, 'SUPPLEMENT')">补充信息</view>
      <view class="btn" @click="actHit(h, 'MONITOR')">持续监控</view>
    </view>
    <view class="muted" v-if="!queue.length">审核队列为空。</view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api, decisionClass, decisionText, money } from '../../api';

const queue = ref<any[]>([]);
const comments = reactive<Record<string, string>>({});

onShow(load);
async function load() {
  queue.value = await api.queue();
}

const occupancyQueue = computed(() =>
  queue.value.filter((h) => h.kind === 'OCCUPANCY_HIGH' || (h.band === 'HIGH' && h.nodeCode && !h.matchedName)),
);
const hitQueue = computed(() => queue.value.filter((h) => h.kind !== 'OCCUPANCY_HIGH' && h.matchedName));

function occupancyBadge(status?: string) {
  if (status === 'APPROVED') return 'badge-pass';
  if (status === 'REJECTED') return 'badge-block';
  if (status === 'CLAIMED') return 'badge-review';
  return 'badge-review';
}

async function actHit(h: any, action: string) {
  await api.workbench(h.caseId, { hitId: h.id, action, comment: `工作台处置 ${action}` });
  uni.showToast({ title: '已记录处置', icon: 'none' });
  await load();
}

async function actOccupancy(h: any, action: string) {
  const label = action === 'CLAIM' ? '已领取' : action === 'APPROVE' ? '已放行' : '已驳回';
  await api.workbench(h.caseId, {
    reviewId: h.reviewId || h.id,
    action,
    comment: comments[h.id] || `工作台${label}`,
  });
  uni.showToast({ title: label, icon: 'none' });
  await load();
}
</script>

<style scoped>
.emph {
  color: #0f3d2e;
  font-weight: 700;
}
</style>
