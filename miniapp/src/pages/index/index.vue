<template>
  <view class="wrap">
    <view class="hero card">
      <view class="eyebrow">国有企业 · 跨境出口</view>
      <view class="h1">贸易风险管控</view>
      <view class="muted" style="margin-top: 12rpx">
        筛查嵌在询盘→报价→合同→变更→排期→装运→单证→报关→收汇业务流中，无需单独登录筛查系统。高风险硬拦截，中风险进审核队列，低风险软提示不阻断。全链路审计留痕。
      </view>
    </view>

    <view class="card" v-for="item in paths" :key="item.caseNo" @click="openByNo(item.caseNo)">
      <view class="row">
        <view class="h2" style="margin: 0">{{ item.title }}</view>
        <view class="badge" :class="item.cls">{{ item.tag }}</view>
      </view>
      <view class="muted">{{ item.desc }}</view>
    </view>

    <view class="card">
      <view class="h2">工作入口</view>
      <view class="btn" @click="go('/pages/case/list')">案件工作台</view>
      <view class="btn btn-ghost" @click="go('/pages/workbench/index')">命中处置（误报/确认/补充/监控）</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../api';

const cases = ref<any[]>([]);
const paths = [
  {
    caseNo: 'DEMO-PASS',
    title: '绿灯通过',
    tag: 'PASS',
    cls: 'badge-pass',
    desc: '买方=付款人=收货人，模拟清单未命中，条款与硬闸门证据齐全，收汇放行。',
  },
  {
    caseNo: 'DEMO-SOFT',
    title: '软提示',
    tag: 'SOFT ALERT',
    cls: 'badge-soft',
    desc: '名称近似命中（低置信），提示关注但不阻断询盘推进。',
  },
  {
    caseNo: 'DEMO-BLOCK',
    title: '硬拦截',
    tag: 'HARD BLOCK',
    cls: 'badge-block',
    desc: '高置信命中 OFAC 模拟清单，N1 闸门拒绝进入后续交易。',
  },
  {
    caseNo: 'DEMO-LIMIT',
    title: '中信保超额',
    tag: 'GATE REFUSED',
    cls: 'badge-block',
    desc: '合同金额超过中信保投保限额，合同确认节点拒绝推进。',
  },
];

onMounted(async () => {
  try {
    cases.value = await api.cases();
  } catch (e) {
    uni.showToast({ title: '后端未启动，请先运行 backend', icon: 'none' });
  }
});

function go(url: string) {
  uni.navigateTo({ url });
}

function openByNo(caseNo: string) {
  const hit = cases.value.find((c) => c.caseNo === caseNo);
  if (!hit) {
    uni.showToast({ title: '未找到种子案件，请先 seed', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/case/detail?id=${hit.id}` });
}
</script>

<style scoped>
.hero {
  background: linear-gradient(135deg, #0b3a5b 0%, #164e6e 70%, #8c4a1f 140%);
}
.hero .h1,
.hero .eyebrow,
.hero .muted {
  color: #f8f4ea;
}
.eyebrow {
  letter-spacing: 4rpx;
  font-size: 22rpx;
  opacity: 0.85;
  margin-bottom: 8rpx;
}
</style>
