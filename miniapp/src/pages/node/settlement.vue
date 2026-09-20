<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">收汇对账 · 硬闸门</view>
      <view class="muted">付款人≠买方时必须有第三方关系证明；另需汇款附言、单证一致证明与放行审批。水单/到账金额是已回款唯一账本：保存后销售列表「已完成」与中信保占用「已回款」同步更新。存在未生效变更单时禁止放行。</view>
    </view>
    <PendingChangeBlock :case-id="id" :case-data="c" />
    <view class="card">
      <view class="label">买方名称</view>
      <input class="input" v-model="form.buyerName" />
      <view class="label">实际付款人</view>
      <input class="input" v-model="form.payerName" />
      <view class="label">汇款附言 / 水单编号</view>
      <input class="input" v-model="form.remittanceMemoRef" />
      <view class="label">实际到账日期（年-月-日）</view>
      <input class="input" v-model="form.receivedAt" placeholder="用于判断是否按期回款" />
      <view class="label">已收汇金额</view>
      <input class="input" v-model="form.amountYuan" :placeholder="`与合同币种一致（${currency}）。留空且已填到账日则按合同全额`" />
      <view class="label">未收汇金额</view>
      <view class="muted">合同总额减已收汇（{{ currency }}）。已回款须未收汇为 0。</view>
      <input class="input" disabled :value="unpaidYuan" />
      <view class="label">已附汇款附言</view>
      <switch :checked="form.hasRemittanceMemo" @change="(e: any) => (form.hasRemittanceMemo = e.detail.value)" />
      <view class="label">单证一致证明</view>
      <switch :checked="form.hasDocConsistencyProof" @change="(e: any) => (form.hasDocConsistencyProof = e.detail.value)" />
      <view class="label">收汇放行审批</view>
      <switch :checked="form.hasReleaseApproval" @change="(e: any) => (form.hasReleaseApproval = e.detail.value)" />
      <view class="label">第三方关系证明（代付时必填）</view>
      <switch :checked="form.hasThirdPartyProof" @change="(e: any) => (form.hasThirdPartyProof = e.detail.value)" />
      <view class="btn" @click="save">保存收汇材料</view>
      <view class="btn btn-danger" @click="tryAdvance">校验硬闸门并放行</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, fenToYuan, yuanToFen } from '../../api';
import PendingChangeBlock from '../../components/PendingChangeBlock.vue';

const id = ref('');
const err = ref('');
const ok = ref('');
const c = ref<any>(null);
const currency = ref('USD');
const contractAmountFen = ref(0);
const form = reactive({
  buyerName: '',
  payerName: '',
  remittanceMemoRef: '',
  receivedAt: '',
  amountYuan: '',
  hasRemittanceMemo: false,
  hasDocConsistencyProof: false,
  hasReleaseApproval: false,
  hasThirdPartyProof: false,
});

const unpaidYuan = computed(() => {
  const received = form.amountYuan.trim()
    ? yuanToFen(form.amountYuan)
    : form.receivedAt || form.hasRemittanceMemo
      ? contractAmountFen.value
      : 0;
  return fenToYuan(Math.max(0, contractAmountFen.value - received)) || '0.00';
});

onLoad(async (q) => {
  id.value = q?.id || '';
  c.value = await api.case(id.value);
  const buyer = c.value.parties?.find((p: any) => p.role === 'BUYER')?.name || '';
  currency.value = c.value.contract?.currency || c.value.currency || 'USD';
  contractAmountFen.value = Number(c.value.contract?.amountFen ?? c.value.amountFen) || 0;
  form.buyerName = c.value.settlement?.buyerName || buyer;
  form.payerName = c.value.settlement?.payerName || buyer;
  if (c.value.settlement) {
    form.remittanceMemoRef = c.value.settlement.remittanceMemoRef || '';
    form.hasRemittanceMemo = !!c.value.settlement.hasRemittanceMemo;
    form.hasDocConsistencyProof = !!c.value.settlement.hasDocConsistencyProof;
    form.hasReleaseApproval = !!c.value.settlement.hasReleaseApproval;
    form.hasThirdPartyProof = !!c.value.settlement.hasThirdPartyProof;
    if (c.value.settlement.amountFen != null) form.amountYuan = fenToYuan(c.value.settlement.amountFen);
  }
  form.receivedAt = (c.value.settlement?.receivedAt || '').toString().slice(0, 10);
});

async function save() {
  const amountFen = form.amountYuan.trim() ? yuanToFen(form.amountYuan) : undefined;
  await api.saveSettlement(id.value, {
    buyerName: form.buyerName,
    payerName: form.payerName,
    remittanceMemoRef: form.remittanceMemoRef,
    receivedAt: form.receivedAt || undefined,
    amountFen,
    isThirdParty: form.payerName.trim() !== form.buyerName.trim(),
    hasRemittanceMemo: !!form.remittanceMemoRef && form.hasRemittanceMemo,
    hasDocConsistencyProof: form.hasDocConsistencyProof,
    hasReleaseApproval: form.hasReleaseApproval,
    hasThirdPartyProof: form.hasThirdPartyProof,
  });
  ok.value = '收汇材料已保存。列表已完成与占用已回款已按本笔到账更新。';
}

async function tryAdvance() {
  err.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N9');
    ok.value = r.nextNode ? `已推进 ${r.nextNode}` : '收汇放行完成';
  } catch (e: any) {
    err.value = ['硬闸门拒绝放行', ...(e?.reasons || [])].join('\n');
  }
}
</script>
