<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h1">{{ c.name }}</view>
      <view class="muted" style="margin-top: 8rpx">
        {{ c.country || '国家未填' }}{{ c.address ? ' · ' + c.address : '' }}
      </view>
      <view class="chips">
        <view class="badge" :class="remittanceClass(c.collection?.code)">
          约定收款日 {{ remittanceText(c.collection?.code) }}
        </view>
        <view class="chip">{{ c.contractCount || 0 }} 份合同</view>
      </view>
    </view>

    <view class="card">
      <view class="h2">中信保限额</view>
      <view v-if="c.sinosureLimit">
        <view class="h1" style="font-size: 36rpx">
          {{ money(c.sinosureLimit.insuredLimitFen, c.sinosureLimit.currency) }}
        </view>
        <view class="muted" style="margin-top: 8rpx">
          最新保单 {{ c.sinosureLimit.evidenceRef || '—' }} · 来自案件 {{ c.sinosureLimit.caseNo }}
        </view>
      </view>
      <view class="muted" v-else>尚未登记中信保保单或投保限额。</view>
    </view>

    <view class="card">
      <view class="h2">已收汇 / 未收汇</view>
      <view class="muted">按出口合同金额与收汇到账金额汇总。部分到账计入已收汇，差额为未收汇。</view>
      <view v-for="b in c.receivable || []" :key="b.currency" style="margin-top: 12rpx">
        <view class="row">
          <view>
            <view class="muted">已收汇</view>
            <view class="stat-n">{{ money(b.settledFen, b.currency) }}</view>
          </view>
          <view>
            <view class="muted">未收汇</view>
            <view class="stat-n over">{{ money(b.openFen, b.currency) }}</view>
          </view>
        </view>
      </view>
      <view class="muted" v-if="!(c.receivable || []).length">暂无合同金额，无法统计收汇。</view>
    </view>

    <view class="card">
      <view class="h2">约定收款日</view>
      <view class="muted">是否按期回款：对照约定收款日与到账日。到期日可手填，或由交货期加付款条件账期推算。</view>
      <view class="row" style="margin-top: 16rpx">
        <view class="stat">
          <view class="stat-n">{{ c.collection?.counts?.onTime ?? 0 }}</view>
          <view class="muted">按期</view>
        </view>
        <view class="stat">
          <view class="stat-n over">{{ c.collection?.counts?.overdue ?? 0 }}</view>
          <view class="muted">逾期</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ c.collection?.counts?.notDue ?? 0 }}</view>
          <view class="muted">未到期</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ c.collection?.counts?.noRecord ?? 0 }}</view>
          <view class="muted">无约定</view>
        </view>
      </view>
    </view>

    <view class="h2" style="margin: 8rpx 8rpx 12rpx">签过哪些合同</view>
    <view class="card" v-for="t in c.contracts" :key="'ct-' + t.id" @click="openCase(t.id)">
      <view class="row">
        <view>
          <view class="muted">{{ t.caseNo }} · {{ t.contract?.incoterms || '合同' }}</view>
          <view class="h2" style="margin: 6rpx 0 0">{{ t.goodsDesc }}</view>
        </view>
        <view class="badge" :class="remittanceClass(t.collection?.code)">
          {{ remittanceText(t.collection?.code) }}
        </view>
      </view>
      <view class="muted" style="margin-top: 10rpx">
        合同金额 {{ money(t.amountFen, t.currency) }} · 已收汇 {{ money(t.receivedFen, t.currency) }} · 未收汇 {{ money(t.unpaidFen, t.currency) }}
      </view>
      <view class="muted">
        付款条件 {{ t.paymentTerms || '未填' }} · 约定收款日 {{ t.paymentDueAt || '—' }} · 到账 {{ t.receivedAt || '—' }}
      </view>
    </view>
    <view class="muted" v-if="!c.contracts?.length" style="margin-bottom: 16rpx">尚未签订出口合同。</view>

    <view class="h2" style="margin: 8rpx 8rpx 12rpx">历次交易记录</view>
    <view class="card" v-for="t in c.transactions" :key="t.id" @click="openCase(t.id)">
      <view class="row">
        <view>
          <view class="muted">{{ t.caseNo }}</view>
          <view class="h2" style="margin: 6rpx 0 0">{{ t.title }}</view>
        </view>
        <view class="badge" :class="remittanceClass(t.collection?.code)">
          {{ remittanceText(t.collection?.code) }}
        </view>
      </view>
      <view class="muted" style="margin-top: 10rpx">{{ t.goodsDesc }} · {{ t.destination }}</view>
      <view class="muted" v-if="t.hasContract">
        已收汇 {{ money(t.receivedFen, t.currency) }} / 未收汇 {{ money(t.unpaidFen, t.currency) }}
      </view>
      <view class="muted" v-else>尚无出口合同（询盘/报价阶段）</view>
      <view class="muted" v-if="t.collection?.note">{{ t.collection.note }}</view>
    </view>
    <view class="muted" v-if="!c.transactions?.length">暂无交易。</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, money, remittanceClass, remittanceText } from '../../api';

const id = ref('');
const c = ref<any>(null);

onLoad(async (q) => {
  id.value = q?.id || '';
  if (!id.value) return;
  c.value = await api.customer(id.value);
});

function openCase(caseId: string) {
  uni.navigateTo({ url: `/pages/case/detail?id=${caseId}` });
}
</script>

<style scoped>
.stat {
  flex: 1;
  text-align: center;
}
.stat-n {
  font-size: 32rpx;
  font-weight: 700;
  color: #0b3a5b;
}
.stat-n.over {
  color: #b42318;
}
</style>
