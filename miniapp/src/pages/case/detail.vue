<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="muted">{{ c.caseNo }}</view>
      <view class="h1">{{ c.title }}</view>
      <view class="row" style="margin-top: 12rpx">
        <view class="badge" :class="decisionClass(c.overallRisk)">{{ decisionText(c.overallRisk) }}</view>
        <view class="badge" :class="decisionClass(c.status)">{{ decisionText(c.status) }}</view>
      </view>
      <view class="muted" style="margin-top: 12rpx">
        {{ c.goodsDesc }} · {{ c.destination }} · {{ c.currency }} {{ (c.amountFen / 100).toFixed(2) }}
      </view>
    </view>

    <view class="card">
      <view class="h2">当事方</view>
      <view v-for="p in c.parties" :key="p.id" class="muted">
        {{ role(p.role) }}：{{ p.name }}（{{ p.country || '—' }}）
      </view>
    </view>

    <view class="card" v-for="n in c.nodes" :key="n.code" @click="openNode(n)">
      <view class="row">
        <view>
          <view class="h2" style="margin: 0">{{ n.code }} {{ n.name }}</view>
          <view class="muted">{{ n.summary }}</view>
        </view>
        <view>
          <view class="badge badge-gate" v-if="n.isHardGate">硬闸门</view>
          <view class="badge" :class="decisionClass(n.decision || n.status)" style="margin-top: 8rpx">
            {{ decisionText(n.decision || n.status) }}
          </view>
        </view>
      </view>
    </view>

    <view class="btn btn-ghost" @click="go(`/pages/audit/index?id=${c.id}`)">查看审计日志</view>
    <view class="btn btn-ghost" @click="go('/pages/workbench/index')">案例工作台</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, decisionClass, decisionText, nodePage } from '../../api';

const id = ref('');
const c = ref<any>(null);

onLoad((q) => {
  id.value = q?.id || '';
});

onShow(load);

async function load() {
  if (!id.value) return;
  c.value = await api.case(id.value);
}

function role(r: string) {
  return ({ BUYER: '买方', PAYER: '付款人', CONSIGNEE: '收货人', SUPPLIER: '国内供应商' } as any)[r] || r;
}

function openNode(n: any) {
  uni.navigateTo({ url: `${nodePage(n.code)}?id=${id.value}&code=${n.code}` });
}

function go(url: string) {
  uni.navigateTo({ url });
}
</script>
