<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">单证一致性 · 硬闸门</view>
      <view class="muted">须有终稿合同，且合同 / 发票 / 装箱单 / 提单关键字段一致；不一致必须留下修改记录。</view>
    </view>
    <view class="card" v-for="doc in docs" :key="doc.type">
      <view class="h2">{{ doc.label }}</view>
      <view class="label">买方</view>
      <input class="input" v-model="doc.fields.buyerName" />
      <view class="label">收货人</view>
      <input class="input" v-model="doc.fields.consigneeName" />
      <view class="label">货物</view>
      <input class="input" v-model="doc.fields.goodsDesc" />
      <view class="label">金额（分）</view>
      <input class="input" type="number" v-model="doc.fields.amountFen" />
      <view class="label">终稿</view>
      <switch :checked="doc.isFinal" @change="(e: any) => (doc.isFinal = e.detail.value)" />
      <view class="btn btn-ghost" @click="saveDoc(doc)">保存{{ doc.label }}</view>
    </view>
    <view class="card">
      <view class="h2">不符点修改记录</view>
      <input class="input" v-model="fix.field" placeholder="字段英文名，如 buyerName" />
      <input class="input" v-model="fix.fromValue" placeholder="原值" />
      <input class="input" v-model="fix.toValue" placeholder="更正值" />
      <input class="input" v-model="fix.reason" placeholder="原因" />
      <view class="btn btn-ghost" @click="saveFix">登记修改</view>
    </view>
    <view class="btn btn-danger" @click="tryAdvance">校验硬闸门并推进</view>
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
const docs = reactive([
  { type: 'CONTRACT', label: '合同', isFinal: true, fields: blank() },
  { type: 'INVOICE', label: '发票', isFinal: true, fields: blank() },
  { type: 'PACKING', label: '装箱单', isFinal: true, fields: blank() },
  { type: 'BL', label: '提单', isFinal: true, fields: blank() },
]);
const fix = reactive({ field: 'buyerName', fromValue: '', toValue: '', reason: '' });

function blank() {
  return { buyerName: '', consigneeName: '', goodsDesc: '', amountFen: 0, currency: 'USD', incoterms: 'CIF' };
}

onLoad(async (q) => {
  id.value = q?.id || '';
  const c = await api.case(id.value);
  for (const d of c.documents || []) {
    const target = docs.find((x) => x.type === d.type);
    if (target) {
      target.isFinal = d.isFinal;
      Object.assign(target.fields, d.fields || {});
    }
  }
  if (c.contract) {
    const t = docs[0];
    t.isFinal = c.contract.isFinal;
    t.fields.buyerName = c.contract.buyerName || t.fields.buyerName;
    t.fields.consigneeName = c.contract.consigneeName || '';
    t.fields.goodsDesc = c.contract.goodsDesc || c.goodsDesc;
    t.fields.amountFen = c.contract.amountFen || c.amountFen;
    t.fields.incoterms = c.contract.incoterms || 'CIF';
  }
});

async function saveDoc(doc: any) {
  await api.saveDocument(id.value, {
    type: doc.type,
    isFinal: doc.isFinal,
    fields: { ...doc.fields, amountFen: Number(doc.fields.amountFen) },
  });
  ok.value = `${doc.label}已保存`;
}

async function saveFix() {
  await api.saveFix(id.value, { ...fix });
  ok.value = '不符点修改已入审计';
}

async function tryAdvance() {
  err.value = '';
  try {
    for (const d of docs) await saveDoc(d);
    const r = await api.advance(id.value, 'N7');
    ok.value = `硬闸门通过，下一节点 ${r.nextNode}`;
  } catch (e: any) {
    err.value = formatGateError(e);
  }
}
</script>
