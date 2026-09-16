<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">生产 / 备货排期</view>
      <view class="muted">计划交期不得晚于合同交货期。若延期，必须选择结构化触发原因（或依据编号），并保留客户同意证据编号。</view>
    </view>
    <view class="card">
      <view class="label">合同交货期</view>
      <input class="input" v-model="form.contractDelivery" placeholder="YYYY-MM-DD" />
      <view class="label">计划交期</view>
      <input class="input" v-model="form.plannedDelivery" placeholder="YYYY-MM-DD" />
      <view class="label">登记延期</view>
      <switch :checked="form.delayRegistered" @change="(e: any) => (form.delayRegistered = e.detail.value)" />
      <view class="label">延期触发条件</view>
      <view class="chips">
        <view class="chip" :class="{ 'chip-on': form.delayTriggerCode === t.key }" v-for="t in triggers" :key="t.key" @click="form.delayTriggerCode = t.key">{{ t.label }}</view>
      </view>
      <view class="label">触发依据编号</view>
      <input class="input" v-model="form.delayTriggerRef" placeholder="如 PORT-SG-09" />
      <view class="label">延期说明</view>
      <input class="input" v-model="form.delayReason" />
      <view class="label">客户已同意延期</view>
      <switch :checked="form.customerConsent" @change="(e: any) => (form.customerConsent = e.detail.value)" />
      <view class="label">客户同意证据编号</view>
      <input class="input" v-model="form.customerConsentRef" placeholder="邮件/函件编号，将写入证据链" />
      <view class="btn" @click="save">保存排期</view>
      <view class="btn btn-ghost" @click="tryAdvance">校验并推进</view>
    </view>
    <view class="muted" v-if="c.productionPlan?.customerConsentEvidenceId">同意证据 ID：{{ c.productionPlan.customerConsentEvidenceId }}</view>
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
const triggers = [
  { key: 'FORCE_MAJEURE', label: '不可抗力' },
  { key: 'PORT_CONGESTION', label: '港口拥堵' },
  { key: 'MATERIAL_SHORTAGE', label: '原料短缺' },
  { key: 'CAPACITY', label: '产能不足' },
  { key: 'CUSTOMER_REQUEST', label: '客户要求' },
  { key: 'LOGISTICS', label: '物流运力' },
];
const form = reactive({
  contractDelivery: '2026-11-30',
  plannedDelivery: '2026-11-28',
  delayRegistered: false,
  delayTriggerCode: '',
  delayTriggerRef: '',
  delayReason: '',
  customerConsent: false,
  customerConsentRef: '',
});

onLoad(async (q) => {
  id.value = q?.id || '';
  c.value = await api.case(id.value);
  const p = c.value.productionPlan;
  const d = c.value.contract?.deliveryDate;
  if (d) form.contractDelivery = String(d).slice(0, 10);
  if (p) {
    form.contractDelivery = String(p.contractDelivery || form.contractDelivery).slice(0, 10);
    form.plannedDelivery = String(p.plannedDelivery || '').slice(0, 10) || form.plannedDelivery;
    form.delayRegistered = !!p.delayRegistered;
    form.delayTriggerCode = p.delayTriggerCode || '';
    form.delayTriggerRef = p.delayTriggerRef || '';
    form.delayReason = p.delayReason || '';
    form.customerConsent = !!p.customerConsent;
  }
});

async function save() {
  await api.savePlan(id.value, { ...form });
  c.value = await api.case(id.value);
  ok.value = '排期已保存';
}

async function tryAdvance() {
  err.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N5');
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
  }
}
</script>
