<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">报价环节</view>
      <view class="muted">须明确价格基础（含/不含项目）、有效期、运费与税费承担方。含「价格待定 / 费用另议」不得推进。保存即生成新版本，旧版 SUPERSEDED。</view>
    </view>
    <view class="card">
      <view class="label">价格基础</view>
      <view class="chips">
        <view class="chip" :class="{ 'chip-on': form.priceBasis === 'INCLUSIVE' }" @click="form.priceBasis = 'INCLUSIVE'">含项目</view>
        <view class="chip" :class="{ 'chip-on': form.priceBasis === 'EXCLUSIVE' }" @click="form.priceBasis = 'EXCLUSIVE'">不含项目</view>
        <view class="chip" :class="{ 'chip-on': form.priceBasis === 'MIXED' }" @click="form.priceBasis = 'MIXED'">部分含/不含</view>
      </view>
      <view class="label">所含项目</view>
      <input class="input" v-model="form.includedItems" placeholder="如 海运费、出口报关费" />
      <view class="label">不含项目</view>
      <input class="input" v-model="form.excludedItems" placeholder="如 目的港关税" />
      <view class="label">有效期（YYYY-MM-DD）</view>
      <input class="input" v-model="form.validityUntil" placeholder="2026-12-31" />
      <view class="label">运费承担</view>
      <view class="chips">
        <view class="chip" :class="{ 'chip-on': form.freightBearer === 'SELLER' }" @click="form.freightBearer = 'SELLER'">卖方</view>
        <view class="chip" :class="{ 'chip-on': form.freightBearer === 'BUYER' }" @click="form.freightBearer = 'BUYER'">买方</view>
      </view>
      <view class="label">税费承担</view>
      <view class="chips">
        <view class="chip" :class="{ 'chip-on': form.taxBearer === 'SELLER' }" @click="form.taxBearer = 'SELLER'">卖方</view>
        <view class="chip" :class="{ 'chip-on': form.taxBearer === 'BUYER' }" @click="form.taxBearer = 'BUYER'">买方</view>
      </view>
      <view class="label">单价（分）</view>
      <input class="input" type="number" v-model="form.unitPriceFen" />
      <view class="label">数量</view>
      <input class="input" type="number" v-model="form.quantity" />
      <view class="label">备注</view>
      <input class="input" v-model="form.notes" placeholder="禁止填写价格待定/费用另议" />
      <view class="label">异常价格说明（低于成本底线时必填）</view>
      <input class="input" v-model="form.abnormalPriceNote" />
      <view class="btn" @click="save">保存为新版本</view>
      <view class="btn btn-ghost" @click="tryAdvance">校验并推进</view>
    </view>
    <view class="card" v-for="q in c.quotes || []" :key="q.id">
      <view class="row">
        <view class="h2" style="margin: 0">报价 v{{ q.version }}</view>
        <view class="badge" :class="q.status === 'ACTIVE' ? 'badge-pass' : 'badge-stub'">{{ q.status }}</view>
      </view>
      <view class="muted">基础 {{ q.priceBasis }} · 有效期 {{ dateOnly(q.validityUntil) }} · 运费 {{ q.freightBearer }} / 税 {{ q.taxBearer }}</view>
      <view class="muted">单价 {{ q.unitPriceFen }} 分 × {{ q.quantity }}</view>
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
  priceBasis: 'MIXED',
  includedItems: '海运费、出口报关费',
  excludedItems: '目的港关税',
  validityUntil: '2026-12-31',
  freightBearer: 'SELLER',
  taxBearer: 'BUYER',
  unitPriceFen: 1280000,
  quantity: 10,
  notes: '',
  abnormalPriceNote: '',
});

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

async function reload() {
  c.value = await api.case(id.value);
  const active = (c.value.quotes || []).find((x: any) => x.status === 'ACTIVE') || c.value.quotes?.[0];
  if (active) {
    Object.assign(form, {
      priceBasis: active.priceBasis,
      includedItems: active.includedItems || '',
      excludedItems: active.excludedItems || '',
      validityUntil: dateOnly(active.validityUntil) || form.validityUntil,
      freightBearer: active.freightBearer || 'SELLER',
      taxBearer: active.taxBearer || 'BUYER',
      unitPriceFen: active.unitPriceFen || form.unitPriceFen,
      quantity: active.quantity || form.quantity,
      notes: active.notes || '',
      abnormalPriceNote: active.abnormalPriceNote || '',
    });
  }
}

function dateOnly(v: any) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

async function save() {
  err.value = '';
  const r = await api.saveQuote(id.value, {
    ...form,
    unitPriceFen: Number(form.unitPriceFen),
    quantity: Number(form.quantity),
  });
  ok.value = `已保存报价版本 v${r.version}（旧版 SUPERSEDED）`;
  await reload();
}

async function tryAdvance() {
  err.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N2');
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
  }
}
</script>
