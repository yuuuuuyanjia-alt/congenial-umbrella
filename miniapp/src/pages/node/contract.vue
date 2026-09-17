<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">合同 / 订单确认</view>
      <view class="muted">硬规则：中信保限额未登记，不得签订合同。请先登记投保限额，再保存合同要素。所有权保留、争议解决条款为必填。占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款 + 新签订合同金额；超额将按分档提示或拦截。保存合同或推进本节点后，本案买方将自动录入或合并至客户管理。</view>
      <view class="err" v-if="!hasLimit" style="margin-top: 12rpx">尚未登记中信保限额，不得签订合同。</view>
    </view>
    <view class="card">
      <view class="label">相对方</view>
      <input class="input" v-model="form.counterparty" />
      <view class="label">国际贸易术语</view>
      <input class="input" v-model="form.incoterms" placeholder="如 CIF / FOB / CFR" />
      <view class="label">付款条件</view>
      <input class="input" v-model="form.paymentTerms" placeholder="如 T/T 30 days" />
      <view class="label">合同交货期（年-月-日）</view>
      <input class="input" v-model="form.deliveryDate" placeholder="2026-11-30" />
      <view class="label">数量</view>
      <input class="input" type="number" v-model="form.quantity" />
      <view class="label">单位</view>
      <input class="input" v-model="form.unit" placeholder="套 / 台 / 千克" />
      <view class="label">合同总金额</view>
      <input class="input" type="digit" v-model="form.amountYuan" placeholder="与投保限额同一币种" />
      <view class="label">币种</view>
      <input class="input" v-model="form.currency" placeholder="USD" />
      <view class="label">所有权保留条款</view>
      <switch :checked="form.hasRetentionOfTitle" @change="(e: any) => (form.hasRetentionOfTitle = e.detail.value)" />
      <view class="label">争议解决条款</view>
      <switch :checked="form.hasDisputeClause" @change="(e: any) => (form.hasDisputeClause = e.detail.value)" />
      <view class="btn" @click="save">保存合同要素</view>
      <view class="muted" v-if="!hasLimit" style="margin-top: 8rpx">须先保存中信保限额，否则保存合同将被拒绝。</view>
    </view>

    <view class="card">
      <view class="h2">中信保</view>
      <view class="muted">须先登记投保限额，否则不得保存或推进合同。请上传出口信用保险保单或限额批注。保存或推进时自动测算占用；超高风险禁止推进，高风险须审核，中风险软提示。</view>
      <SinosureExposure :exposure="exposureView" :show-new="true" />
      <view class="muted" v-if="sinosureHint" style="margin-top: 8rpx">{{ sinosureHint }}</view>
      <view class="label">保单编号 / 附件编号</view>
      <input class="input" v-model="sino.evidenceRef" placeholder="可手填编号，或点下方模拟上传" />
      <view class="label">附件名称</view>
      <input class="input" v-model="sino.fileName" placeholder="如 中信保限额批注.pdf" />
      <view class="btn btn-ghost" @click="stubUpload">模拟上传保单</view>
      <view class="label">投保限额</view>
      <input class="input" type="digit" v-model="sino.limitYuan" placeholder="须不低于合同总金额" />
      <view class="label">限额币种</view>
      <input class="input" v-model="sino.currency" placeholder="须与合同一致" />
      <view class="btn" @click="saveSino">保存中信保信息</view>
      <view class="btn btn-ghost" @click="tryAdvance">尝试确认并推进</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, fenToYuan, latestSinosure, previewExposure, yuanToFen } from '../../api';
import SinosureExposure from '../../components/SinosureExposure.vue';

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
  amountYuan: '',
  currency: 'USD',
});
const sino = reactive({
  evidenceRef: '',
  fileName: '',
  limitYuan: '',
  currency: 'USD',
});

const hasLimit = computed(() => {
  const p = latestSinosure(c.value?.sinosurePolicies, 'N3');
  return !!(p && p.insuredLimitFen > 0);
});

const sinosureHint = computed(() => {
  const p = latestSinosure(c.value?.sinosurePolicies, 'N3');
  if (!p || !(p.insuredLimitFen > 0)) return '';
  const limit = fenToYuan(p.insuredLimitFen);
  return `已登记：限额 ${p.currency} ${limit} · ${p.fileName || p.evidenceRef || '已留存附件'}`;
});

const exposureView = computed(() => {
  const base = c.value?.sinosureExposure;
  return previewExposure(base, yuanToFen(form.amountYuan)) || base;
});

onLoad(async (q) => {
  id.value = q?.id || '';
  c.value = await api.case(id.value);
  const ct = c.value.contract;
  if (ct) {
    Object.assign(form, {
      ...ct,
      deliveryDate: ct.deliveryDate ? String(ct.deliveryDate).slice(0, 10) : form.deliveryDate,
      amountYuan: fenToYuan(ct.amountFen || c.value.amountFen),
      currency: ct.currency || c.value.currency || 'USD',
    });
  } else {
    if (c.value.parties?.[0]) form.counterparty = c.value.parties[0].name;
    form.amountYuan = fenToYuan(c.value.amountFen);
    form.currency = c.value.currency || 'USD';
  }
  const p = latestSinosure(c.value.sinosurePolicies, 'N3');
  if (p) {
    sino.evidenceRef = p.evidenceRef || '';
    sino.fileName = p.fileName || '';
    sino.limitYuan = fenToYuan(p.insuredLimitFen);
    sino.currency = p.currency || form.currency;
  } else {
    sino.currency = form.currency;
  }
});

function stubUpload() {
  sino.evidenceRef = `SINOSURE-${Date.now()}`;
  sino.fileName = '中信保限额批注-模拟.pdf';
  ok.value = '已生成模拟保单附件编号（演示环境，非真实上传）';
}

function gateMessage(e: any) {
  if (Array.isArray(e?.reasons) && e.reasons.length) return e.reasons.join('；');
  return e?.message || '闸门拒绝';
}

async function save() {
  err.value = '';
  ok.value = '';
  try {
    await api.saveContract(id.value, {
      counterparty: form.counterparty,
      incoterms: form.incoterms,
      paymentTerms: form.paymentTerms,
      hasRetentionOfTitle: form.hasRetentionOfTitle,
      hasDisputeClause: form.hasDisputeClause,
      deliveryDate: form.deliveryDate,
      quantity: Number(form.quantity),
      unit: form.unit,
      amountFen: yuanToFen(form.amountYuan),
      currency: form.currency,
    });
    c.value = await api.case(id.value);
    ok.value = '合同要素已保存，已按当前金额测算占用；买方已录入或合并至客户管理';
    return true;
  } catch (e: any) {
    err.value = gateMessage(e);
    return false;
  }
}

async function saveSino() {
  err.value = '';
  if (!sino.evidenceRef && !sino.fileName) stubUpload();
  await api.saveSinosureN3(id.value, {
    evidenceRef: sino.evidenceRef,
    fileName: sino.fileName,
    insuredLimitFen: yuanToFen(sino.limitYuan),
    currency: sino.currency || form.currency,
  });
  c.value = await api.case(id.value);
  ok.value = '中信保信息已保存';
}

async function tryAdvance() {
  err.value = '';
  ok.value = '';
  try {
    await saveSino();
    const saved = await save();
    if (!saved) return;
    const r = await api.advance(id.value, 'N3');
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = gateMessage(e);
  }
}
</script>
