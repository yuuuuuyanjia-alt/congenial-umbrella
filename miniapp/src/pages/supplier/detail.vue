<template>
  <view class="wrap" v-if="s">
    <view class="card">
      <view class="h1">{{ s.name }}</view>
      <view class="muted" style="margin-top: 8rpx">
        {{ s.country || 'CN' }}{{ s.registrationNo ? ' · ' + s.registrationNo : '' }}
      </view>
      <view class="chips">
        <view class="badge" :class="remittanceClass(s.delivery?.code)">交货 {{ remittanceText(s.delivery?.code) }}</view>
        <view class="badge" :class="remittanceClass(s.payment?.code)">付款 {{ remittanceText(s.payment?.code) }}</view>
        <view class="chip">{{ s.poCount || 0 }} 笔采购单</view>
        <view class="chip" v-if="s.hasStaged">含分期支付</view>
      </view>
    </view>

    <view class="card">
      <view class="h2">货款已付款 / 未付款</view>
      <view v-for="b in s.payable || []" :key="b.currency" style="margin-top: 12rpx">
        <view class="row">
          <view>
            <view class="muted">已付款</view>
            <view class="stat-n">{{ money(b.settledFen, b.currency) }}</view>
          </view>
          <view>
            <view class="muted">未付款</view>
            <view class="stat-n over">{{ money(b.openFen, b.currency) }}</view>
          </view>
        </view>
      </view>
      <view class="muted" v-if="!(s.payable || []).length">尚未登记采购金额。</view>
    </view>

    <view class="card">
      <view class="h2">是否按期交货 · 约定付款时间</view>
      <view class="muted">交货对照实际到货与计划到货（无计划则对照客户合同交期）。付款按每一期的约定付款时间判断：未付清且到期已过即为逾期；分期支付时任一期逾期则总体逾期。</view>
      <view class="row" style="margin-top: 16rpx">
        <view class="stat">
          <view class="stat-n over">{{ s.delivery?.counts?.overdue ?? 0 }}</view>
          <view class="muted">交货逾期</view>
        </view>
        <view class="stat">
          <view class="stat-n over">{{ s.payment?.counts?.overdue ?? 0 }}</view>
          <view class="muted">付款逾期</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ s.delivery?.counts?.onTime ?? 0 }}</view>
          <view class="muted">交货按期</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ s.payment?.counts?.notDue ?? 0 }}</view>
          <view class="muted">付款未到期</view>
        </view>
      </view>
    </view>

    <view class="h2" style="margin: 8rpx 8rpx 12rpx">每一笔采购合同 / 采购单</view>
    <view class="card" v-for="p in s.purchases" :key="p.id" @click="openCase(p.id)">
      <view class="row">
        <view>
          <view class="muted">{{ p.caseNo }} · {{ p.poNo || '未填 PO 号' }}</view>
          <view class="h2" style="margin: 6rpx 0 0">{{ p.goodsDesc }}</view>
        </view>
        <view class="badge" :class="remittanceClass(p.delivery?.code)">交货 {{ remittanceText(p.delivery?.code) }}</view>
      </view>
      <view class="muted" style="margin-top: 10rpx" v-if="p.salesLink">
        关联销售合同 {{ p.salesLink.contractNo }} · {{ p.salesLink.customer }} · {{ money(p.salesLink.amountFen, p.salesLink.currency) }} · {{ p.salesLink.statusLabel }}
      </view>
      <view class="muted" v-else style="margin-top: 10rpx">尚未关联销售合同</view>
      <view class="chip" v-if="p.salesLink" style="margin-top: 8rpx" @click.stop="openCase(p.salesLink.id)">查看销售合同</view>
      <view class="muted" style="margin-top: 10rpx">
        计划到货 {{ ymd(p.plannedArrival) }} · 客户交期 {{ ymd(p.contractDelivery) }} · 实际到货 {{ ymd(p.actualArrival) }}
      </view>
      <view class="muted">
        采购金额 {{ money(p.amountFen, p.currency) }} · 已付 {{ money(p.paidFen, p.currency) }} · 未付 {{ money(p.unpaidFen, p.currency) }}
      </view>
      <view class="row" style="margin-top: 8rpx">
        <view class="badge" :class="remittanceClass(p.payment?.code)">付款 {{ remittanceText(p.payment?.code) }}</view>
        <view class="chip">{{ p.paymentModeLabel || '一次性付清' }}</view>
      </view>
      <view class="muted" v-if="p.scheduleWording">{{ p.scheduleWording }}</view>
      <view class="inst" v-for="inst in p.installments || []" :key="p.id + '-' + inst.seq" @click.stop>
        <view class="row">
          <view class="h2" style="margin: 0">第 {{ inst.seq }} 期 {{ inst.label }}</view>
          <view class="badge" :class="remittanceClass(inst.status === 'PAID' ? 'ON_TIME' : inst.status)">{{ inst.statusLabel }}</view>
        </view>
        <view class="muted" style="margin-top: 8rpx">
          付款比例 {{ inst.percent != null ? inst.percent + '%' : '—' }} · 金额 {{ money(inst.amountFen, p.currency) }}
        </view>
        <view class="muted">约定付款时间 {{ inst.agreedPaymentTime || ymd(inst.dueAt) || inst.conditionText || '—' }}</view>
        <view class="muted">
          已付 {{ money(inst.paidFen, p.currency) }} · 未付 {{ money(inst.unpaidFen, p.currency) }}
        </view>
        <view class="row" style="margin-top: 8rpx">
          <view class="badge" :class="remittanceClass(inst.timing?.code)">{{ remittanceText(inst.timing?.code) }}</view>
          <view class="muted">{{ dueFlag(inst) }}</view>
        </view>
        <view class="muted">付款日 {{ ymd(inst.paidAt) }}</view>
      </view>
      <view class="muted" v-if="!(p.installments || []).length">约定付款时间 {{ p.paymentDueAt || '—' }} · 付款日 {{ p.paidAt || '—' }}</view>
      <view class="muted" v-if="p.delivery?.note">{{ p.delivery.note }}</view>
    </view>
    <view class="muted" v-if="!s.purchases?.length">暂无采购单。</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, money, remittanceClass, remittanceText } from '../../api';

const id = ref('');
const s = ref<any>(null);

onLoad(async (q) => {
  id.value = q?.id || '';
  if (!id.value) return;
  s.value = await api.supplier(id.value);
});

function ymd(v?: string | null) {
  return v ? String(v).slice(0, 10) : '—';
}

function dueFlag(inst: any) {
  if (!inst?.dueAt && !inst?.conditionText) return '无约定付款时间';
  if (inst.duePassed) return '已过约定付款时间';
  if (inst.status === 'PAID' && inst.timing?.code === 'OVERDUE') return '付款日晚于约定付款时间';
  return '未过约定付款时间';
}

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
  color: #0f3d2e;
}
.stat-n.over {
  color: #b42318;
}
.inst {
  border-top: 2rpx solid #eef0f3;
  margin-top: 16rpx;
  padding-top: 14rpx;
}
</style>
