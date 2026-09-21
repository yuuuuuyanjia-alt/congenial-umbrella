<template>
  <view class="wrap">
    <RoleBar compact />
    <template v-if="c">
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

    <view class="card" v-if="c.procurementPlan?.salesLink">
      <view class="h2">关联销售合同</view>
      <view class="muted">{{ c.procurementPlan.salesLink.customer }} · {{ c.procurementPlan.salesLink.contractNo }}</view>
      <view class="muted" style="margin-top: 8rpx">
        {{ money(c.procurementPlan.salesLink.amountFen, c.procurementPlan.salesLink.currency) }} · {{ c.procurementPlan.salesLink.statusLabel }} · {{ c.procurementPlan.salesLink.currentNodeLabel }}
      </view>
      <view class="muted" style="margin-top: 8rpx" v-if="salesDeliveryYmd">
        关联销售合同交货期 {{ salesDeliveryYmd }}（采购交付延期对照此日期）
      </view>
      <view class="muted" style="margin-top: 8rpx" v-else>所选销售合同未登记交货期，采购延期闸门跳过交期核对。</view>
      <view
        class="btn btn-ghost"
        v-if="c.procurementPlan.salesLink.id !== c.id"
        @click="go(`/pages/case/detail?id=${c.procurementPlan.salesLink.id}`)"
      >打开关联销售案件</view>
    </view>

    <view class="card">
      <view class="h2">退税就绪清单</view>
      <view class="muted">FT4：报关放行与 N9 收汇由系统读取；进项发票号可手填；四流闭环须勾选。完成后方可模拟申报退税。本阶段不做自动票证匹配或电子口岸对接。</view>
      <view class="muted" v-for="item in rebateItems" :key="item.code" style="margin-top: 8rpx">
        {{ item.ok ? '✓' : '○' }} {{ item.label }}
        <text v-if="item.source === 'auto'">（系统）</text>
      </view>
      <view class="label" style="margin-top: 16rpx">进项发票号</view>
      <input class="input" v-model="rebate.inputInvoiceNo" placeholder="可手填，如 12345678" />
      <view class="label">四流闭环</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': rebate.flowGoods }" @click="rebate.flowGoods = !rebate.flowGoods">货物流</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': rebate.flowCustoms }" @click="rebate.flowCustoms = !rebate.flowCustoms">报关</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': rebate.flowInvoice }" @click="rebate.flowInvoice = !rebate.flowInvoice">发票</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': rebate.flowRemittance }" @click="rebate.flowRemittance = !rebate.flowRemittance">收汇</view>
      </view>
      <view class="btn" v-if="canWriteBusiness" @click="saveRebate">保存就绪清单</view>
      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="declareRebate">模拟申报退税</view>
      <view class="ok" v-if="rebateMsg">{{ rebateMsg }}</view>
      <view class="err" v-if="rebateErr">{{ rebateErr }}</view>
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
    <view class="btn btn-ghost" v-if="isRisk" @click="go('/pages/workbench/index')">审核工作台</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, decisionClass, decisionText, money, nodePage } from '../../api';
import RoleBar from '../../components/RoleBar.vue';
import { useDemoRole } from '../../role';

const { canWriteBusiness, isRisk } = useDemoRole();
const id = ref('');
const c = ref<any>(null);
const rebateMsg = ref('');
const rebateErr = ref('');
const rebate = reactive({
  inputInvoiceNo: '',
  flowGoods: false,
  flowCustoms: false,
  flowInvoice: false,
  flowRemittance: false,
});
const salesDeliveryYmd = computed(() => {
  const p = c.value?.procurementPlan;
  const d = p?.salesContractDeliveryDate || p?.salesLink?.deliveryDate || p?.contractDelivery;
  return d ? String(d).slice(0, 10) : '';
});
const rebateItems = computed(() => c.value?.taxRebateReady?.items || []);

onLoad((q) => {
  id.value = q?.id || '';
});

onShow(load);

async function load() {
  if (!id.value) return;
  c.value = await api.case(id.value);
  const row = c.value?.taxRebateChecklist;
  if (row) {
    rebate.inputInvoiceNo = row.inputInvoiceNo || '';
    rebate.flowGoods = !!row.flowGoods;
    rebate.flowCustoms = !!row.flowCustoms;
    rebate.flowInvoice = !!row.flowInvoice;
    rebate.flowRemittance = !!row.flowRemittance;
  }
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

function gateMessage(e: any) {
  if (Array.isArray(e?.reasons) && e.reasons.length) return e.reasons.join('；');
  return e?.message || '操作失败';
}

async function saveRebate() {
  rebateErr.value = '';
  rebateMsg.value = '';
  try {
    await api.saveTaxRebate(id.value, { ...rebate });
    await load();
    rebateMsg.value = '退税就绪清单已保存';
  } catch (e: any) {
    rebateErr.value = gateMessage(e);
  }
}

async function declareRebate() {
  rebateErr.value = '';
  rebateMsg.value = '';
  try {
    await api.saveTaxRebate(id.value, { ...rebate });
    await api.declareTaxRebate(id.value);
    await load();
    rebateMsg.value = '已模拟申报退税（演示，无电子口岸对接）';
  } catch (e: any) {
    rebateErr.value = gateMessage(e);
  }
}
</script>
