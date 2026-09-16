<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">合同 / 订单确认</view>
      <view class="muted">所有权保留条款、争议解决条款为必填。国际贸易术语与付款条件将做风险提示校验。</view>
    </view>
    <view class="card">
      <view class="label">相对方</view>
      <input class="input" v-model="form.counterparty" />
      <view class="label">Incoterms</view>
      <input class="input" v-model="form.incoterms" placeholder="如 CIF / FOB / CFR" />
      <view class="label">付款条件</view>
      <input class="input" v-model="form.paymentTerms" placeholder="如 T/T 30 days" />
      <view class="label">合同交货期（YYYY-MM-DD）</view>
      <input class="input" v-model="form.deliveryDate" placeholder="2026-11-30" />
      <view class="label">数量</view>
      <input class="input" type="number" v-model="form.quantity" />
      <view class="label">单位</view>
      <input class="input" v-model="form.unit" placeholder="套 / 台 / 千克" />
      <view class="label">所有权保留条款</view>
      <switch :checked="form.hasRetentionOfTitle" @change="(e: any) => (form.hasRetentionOfTitle = e.detail.value)" />
      <view class="label">争议解决条款</view>
      <switch :checked="form.hasDisputeClause" @change="(e: any) => (form.hasDisputeClause = e.detail.value)" />
      <view class="btn" @click="save">保存合同要素</view>
      <view class="btn btn-ghost" @click="tryAdvance">尝试确认并推进</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { reactive, ref } from 'vue';
import { api } from '../../api';

const id = ref('');
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const form = reactive({
  counterparty: '',
  incoterms: 'CIF',
  paymentTerms: 'T/T 30 days',
  hasRetentionOfTitle: true,
  hasDisputeClause: true,
  deliveryDate: '2026-11-30',
  quantity: 10,
  unit: '套',
});

onLoad(async (q) => {
  id.value = q?.id || '';
  c.value = await api.case(id.value);
  const ct = c.value.contract;
  if (ct) {
    Object.assign(form, {
      ...ct,
      deliveryDate: ct.deliveryDate ? String(ct.deliveryDate).slice(0, 10) : form.deliveryDate,
    });
  }
  else if (c.value.parties?.[0]) form.counterparty = c.value.parties[0].name;
});

async function save() {
  await api.saveContract(id.value, {
    ...form,
    quantity: Number(form.quantity),
  });
  ok.value = '合同要素已保存';
}

async function tryAdvance() {
  err.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N3');
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
  }
}
</script>
