<template>
  <view class="card radar">
    <view class="row">
      <view class="h2" style="margin: 0">风险雷达</view>
      <view class="badge badge-gate" v-if="activeCount">{{ activeCount }}</view>
    </view>
    <view class="muted">先发现风险，再点开处置。命中、额度和退税审核挂在具体风险下面，不在这里排队。</view>
    <view class="chips">
      <view class="chip">制裁 {{ counts.SANCTION || 0 }}</view>
      <view class="chip">中信保额度 {{ counts.SINOSURE_OCCUPANCY || 0 }}</view>
      <view class="chip">逾期应收 {{ counts.OVERDUE_RECEIVABLE || 0 }}</view>
      <view class="chip">单证缺失 {{ counts.DOC_MISSING || 0 }}</view>
    </view>
    <view class="choice-row">
      <view class="choice-btn" @click="reload">刷新</view>
      <view class="choice-btn" @click="rescreen">重新筛查全部</view>
    </view>
    <view class="choice-row" v-if="sampleEnabled">
      <view class="choice-btn" @click="generate">生成示例风险</view>
      <view class="choice-btn" @click="clearSamples">清除示例</view>
    </view>
    <view class="err" v-if="error">{{ error }}</view>

    <WindowedList :items="items" key-field="id">
      <template #default="{ item }">
        <view class="risk-row scroll-skip" @click="open(item.id)">
          <view class="row">
            <view class="subject">{{ item.subjectLabel }}</view>
            <view class="badge" :class="colorClass(item.color)">{{ item.colorLabel }}</view>
          </view>
          <view class="muted line">
            {{ item.typeLabel }} · {{ item.statusLabel }} · {{ shortTime(item.firstSeenAt) }}
          </view>
          <view class="muted line">
            {{ item.seen ? '已看过' : '未看' }}
            <text v-if="item.processingBy"> · {{ item.processingBy.name }}处理中</text>
            <text v-if="item.escalated"> · 补件逾期，已排到同色最前</text>
          </view>
        </view>
      </template>
    </WindowedList>
    <view class="muted" v-if="loaded && !items.length" style="margin-top: 16rpx">暂无待处置的风险。</view>

    <view class="links">
      <view class="link" @click="goWorkbench('sanctions')">命中处置</view>
      <view class="link" @click="goWorkbench('occupancy')">额度审核</view>
      <view class="link" @click="goWorkbench('tax')">退税审核</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '../api';
import WindowedList from './WindowedList.vue';
import { demoSession } from '../role';

const items = ref<any[]>([]);
const counts = ref<Record<string, number>>({});
const sampleEnabled = ref(false);
const loaded = ref(false);
const error = ref('');
const activeCount = computed(() => items.value.length);

function colorClass(color?: string) {
  if (color === 'RED') return 'badge-block';
  if (color === 'ORANGE') return 'badge-review';
  if (color === 'YELLOW') return 'badge-soft';
  return 'badge-stub';
}

function shortTime(value?: string | null) {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 16);
}

function errText(e: any) {
  const message = e?.message;
  if (Array.isArray(message)) return message.join('；');
  return message || '风险雷达加载失败';
}

async function reload() {
  error.value = '';
  try {
    const data = await api.riskRadar();
    items.value = data.items || [];
    counts.value = data.counts || {};
    sampleEnabled.value = !!data.sampleEnabled;
  } catch (e: any) {
    items.value = [];
    error.value = errText(e);
  } finally {
    loaded.value = true;
  }
}

async function rescreen() {
  error.value = '';
  try {
    const data = await api.riskRescreen();
    items.value = data.items || [];
    counts.value = data.counts || {};
    uni.showToast({ title: `新命中 ${data.freshCount || 0}，等级变化 ${data.changedCount || 0}`, icon: 'none' });
  } catch (e: any) {
    error.value = errText(e);
  }
}

async function generate() {
  error.value = '';
  try {
    const data = await api.riskSamples();
    items.value = data.items || [];
    counts.value = data.counts || {};
    uni.showToast({ title: '已生成示例风险', icon: 'none' });
  } catch (e: any) {
    error.value = errText(e);
  }
}

async function clearSamples() {
  error.value = '';
  try {
    await api.riskClearSamples();
    await reload();
    uni.showToast({ title: '已清除示例', icon: 'none' });
  } catch (e: any) {
    error.value = errText(e);
  }
}

function open(id: string) {
  uni.navigateTo({ url: `/pages/risk/detail?id=${encodeURIComponent(id)}` });
}

function goWorkbench(tab: string) {
  uni.navigateTo({ url: `/pages/workbench/index?tab=${tab}` });
}

onShow(reload);
watch(
  () => demoSession.value?.id,
  () => {
    reload();
  },
);
</script>

<style scoped>
.radar {
  border: 2rpx solid #0f3d2e;
}
.risk-row {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 2rpx solid #efeae0;
}
.subject {
  font-weight: 650;
  color: #0f3d2e;
}
.line {
  margin-top: 4rpx;
}
.links {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}
.link {
  color: #0f3d2e;
  font-size: var(--font-sm);
  text-decoration: underline;
}
</style>
