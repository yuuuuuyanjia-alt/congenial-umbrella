<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">询盘 / 客户 KYC</view>
      <view class="muted">须确认买方、付款人、收货人关系，并对 OFAC / UN / EU / UK 与中国不可靠实体清单做模拟筛查。高置信命中硬拦截。</view>
    </view>

    <view class="card" v-for="role in roles" :key="role.key">
      <view class="label">{{ role.label }}</view>
      <input class="input" v-model="forms[role.key].name" :placeholder="'输入' + role.label + '名称'" />
      <input class="input" v-model="forms[role.key].country" placeholder="国家/地区" />
      <view class="btn btn-ghost" @click="save(role.key)">保存{{ role.label }}</view>
    </view>

    <view class="btn" @click="runScreen">执行模拟筛查并生成 KYC 报告</view>
    <view class="btn" @click="tryAdvance">尝试推进本节点</view>

    <view class="card" v-if="kycReport">
      <view class="h2">KYC 报告</view>
      <view class="row">
        <view>风险评分 {{ kycReport.score }}</view>
        <view class="badge" :class="decisionClass(kycReport.riskLevel)">{{ decisionText(kycReport.riskLevel) }}</view>
      </view>
      <view class="muted" style="margin-top: 8rpx">{{ kycReport.summary }}</view>
    </view>

    <view class="card" v-for="h in customerHits" :key="h.id">
      <view class="row">
        <view class="h2" style="margin: 0">{{ h.listCode }} · {{ h.listedName }}</view>
        <view class="badge" :class="decisionClass(h.riskLevel)">{{ h.confidence }} / {{ decisionText(h.disposition) }}</view>
      </view>
      <view class="muted">匹配名称：{{ h.matchedName }}（当事方 {{ h.party?.name }}）</view>
    </view>

    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, decisionClass, decisionText, toastErr } from '../../api';

const id = ref('');
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const roles = [
  { key: 'BUYER', label: '买方' },
  { key: 'PAYER', label: '付款人' },
  { key: 'CONSIGNEE', label: '收货人' },
];
const forms = reactive<any>({
  BUYER: { name: '', country: '' },
  PAYER: { name: '', country: '' },
  CONSIGNEE: { name: '', country: '' },
});
const kycReport = computed(() => (c.value?.kycReports || []).find((r: any) => r.nodeCode === 'N1') || (c.value?.kycReports || []).find((r: any) => !r.nodeCode));
const customerHits = computed(() =>
  (c.value?.hits || []).filter((h: any) => h.nodeCode !== 'N5' && h.party?.role !== 'SUPPLIER'),
);

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

async function reload() {
  c.value = await api.case(id.value);
  for (const p of c.value.parties || []) {
    forms[p.role] = { name: p.name, country: p.country || '' };
  }
}

async function save(role: string) {
  err.value = '';
  await api.upsertParty(id.value, { role, name: forms[role].name, country: forms[role].country });
  ok.value = `${role} 已保存`;
  await reload();
}

async function runScreen() {
  err.value = '';
  ok.value = '';
  try {
    await api.screen(id.value);
    ok.value = '筛查完成（模拟黑名单，无真实 API Key）';
    await reload();
  } catch (e: any) {
    err.value = JSON.stringify(e);
    toastErr(e);
  }
}

async function tryAdvance() {
  err.value = '';
  ok.value = '';
  try {
    const r = await api.advance(id.value, 'N1');
    ok.value = r.stub ? r.message : `已推进，下一节点 ${r.nextNode || '结束'}`;
    await reload();
  } catch (e: any) {
    err.value = formatGate(e);
  }
}

function formatGate(e: any) {
  const reasons = e?.reasons || e?.message;
  const missing = e?.missing ? `缺失：${e.missing.join(', ')}` : '';
  return [e?.message, Array.isArray(reasons) ? reasons.join('；') : '', missing].filter(Boolean).join('\n');
}
</script>
