<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">收汇对账 · 硬闸门</view>
      <view class="muted">付款人≠买方时必须有第三方关系证明；另需汇款附言、单证一致证明与放行审批。</view>
    </view>
    <view class="card">
      <view class="label">买方名称</view>
      <input class="input" v-model="form.buyerName" />
      <view class="label">实际付款人</view>
      <input class="input" v-model="form.payerName" />
      <view class="label">汇款附言 / 水单编号</view>
      <input class="input" v-model="form.remittanceMemoRef" />
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
import { reactive, ref } from 'vue';
import { api, formatGateError } from '../../api';

const id = ref('');
const err = ref('');
const ok = ref('');
const form = reactive({
  buyerName: '',
  payerName: '',
  remittanceMemoRef: '',
  hasRemittanceMemo: false,
  hasDocConsistencyProof: false,
  hasReleaseApproval: false,
  hasThirdPartyProof: false,
});

onLoad(async (q) => {
  id.value = q?.id || '';
  const c = await api.case(id.value);
  const buyer = c.parties?.find((p: any) => p.role === 'BUYER')?.name || '';
  form.buyerName = c.settlement?.buyerName || buyer;
  form.payerName = c.settlement?.payerName || buyer;
  if (c.settlement) Object.assign(form, c.settlement);
});

async function save() {
  await api.saveSettlement(id.value, {
    ...form,
    isThirdParty: form.payerName.trim() !== form.buyerName.trim(),
    hasRemittanceMemo: !!form.remittanceMemoRef && form.hasRemittanceMemo,
  });
  ok.value = '收汇材料已保存';
}

async function tryAdvance() {
  err.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N9');
    ok.value = r.nextNode ? `已推进 ${r.nextNode}` : '收汇放行完成';
  } catch (e: any) {
    err.value = formatGateError(e);
  }
}
</script>
