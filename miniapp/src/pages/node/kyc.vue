<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">询盘 / 客户 KYC</view>
      <view class="muted">须确认买方、收货人，并对 OFAC / UN / EU / UK 与中国不可靠实体清单做模拟筛查。高置信命中硬拦截。</view>
      <view class="ok" v-if="fromCreate" style="margin-top: 12rpx">
        已创建销售合同案，当前从询盘/客户 KYC 开始。请先保存当事方并完成筛查，再报价，最后到销售合同页填写。不能跳过。
      </view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可保存或推进。</view>
      <view class="muted" style="margin-top: 8rpx">买方在本节点填写后，待案件到达合同/订单确认（N3）时自动录入客户管理；若已有同一客户（按名称+国家或税号匹配）则合并到已有档案，不重复建档。</view>
    </view>

    <view class="card">
      <view class="label">货物名称</view>
      <input class="input" v-model="goods.goodsDesc" placeholder="货物名称" />
      <view class="label">规格</view>
      <input class="input" v-model="goods.goodsSpec" placeholder="如型号、尺寸" />
    </view>

    <view class="card" v-for="role in roles" :key="role.key">
      <view class="label">{{ role.label }}</view>
      <input class="input" v-model="forms[role.key].name" :placeholder="'输入' + role.label + '名称'" />
      <input class="input" v-model="forms[role.key].country" placeholder="国家/地区" />
      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="save(role.key)">保存{{ role.label }}</view>
    </view>

    <view class="btn" v-if="canWriteBusiness" @click="runScreen">执行模拟筛查并生成 KYC 报告</view>
    <view class="btn" v-if="canWriteBusiness" @click="tryAdvance">尝试推进本节点</view>
    <NextNodeCta v-if="nextReady" :target="nextTarget" :ready="nextReady" :hint="nextHint" @go="goNext" />

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
    <NextNodeCta v-if="nextReady" :target="nextTarget" :ready="nextReady" :hint="nextHint" @go="goNext" />
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, decisionClass, decisionText, goToNode, nextWorkNodeFromForm, pipelineNodeName, toastErr } from '../../api';
import { resolveCarriedGoods } from '../../goods-fields';
import NextNodeCta from '../../components/NextNodeCta.vue';
import { useDemoRole } from '../../role';

const { canWriteBusiness, roleLabel } = useDemoRole();

const FORM_NODE = 'N1';
const id = ref('');
const fromCreate = ref(false);
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const advancedTo = ref<string | null>(null);
const roles = [
  { key: 'BUYER', label: '买方' },
  { key: 'CONSIGNEE', label: '收货人' },
];
const forms = reactive<any>({
  BUYER: { name: '', country: '' },
  CONSIGNEE: { name: '', country: '' },
});
const goods = reactive({ goodsDesc: '', goodsSpec: '' });
const kycReport = computed(() => (c.value?.kycReports || []).find((r: any) => r.nodeCode === 'N1') || (c.value?.kycReports || []).find((r: any) => !r.nodeCode));
const customerHits = computed(() =>
  (c.value?.hits || []).filter((h: any) => h.nodeCode !== 'N5' && h.party?.role !== 'SUPPLIER'),
);
const nextTarget = computed(() =>
  c.value
    ? nextWorkNodeFromForm(FORM_NODE, {
        currentNode: c.value.currentNode,
        overrideNext: advancedTo.value,
      })
    : null,
);
const nextReady = computed(() => {
  if (!nextTarget.value || !c.value) return false;
  if (advancedTo.value) return true;
  const cur = c.value.currentNode || '';
  return !!cur && cur !== FORM_NODE;
});
const nextHint = computed(() => {
  const t = nextTarget.value;
  if (!t) return '';
  if (advancedTo.value) return `已过闸。下一步为 ${t.code} ${t.name}。`;
  const cur = c.value?.currentNode;
  if (cur && cur !== FORM_NODE) {
    return `本案已在 ${cur} ${pipelineNodeName(cur)}。可直接进入该节点。`;
  }
  return `推进本节点后，可进入 ${t.code} ${t.name}。`;
});

onLoad(async (q) => {
  id.value = q?.id || '';
  fromCreate.value = q?.fromCreate === '1' || q?.fromCreate === 'true';
  await reload();
});

async function reload() {
  c.value = await api.case(id.value);
  for (const role of roles) {
    const p = (c.value.parties || []).find((x: any) => x.role === role.key);
    forms[role.key] = { name: p?.name || '', country: p?.country || '' };
  }
  const carried = resolveCarriedGoods({
    quote: (c.value.quotes || []).find((x: any) => x.status === 'ACTIVE') || c.value.quotes?.[0],
    caseGoodsDesc: c.value.goodsDesc,
    caseGoodsSpec: c.value.goodsSpec,
  });
  goods.goodsDesc = carried.goodsDesc;
  goods.goodsSpec = carried.goodsSpec;
}

async function saveGoods() {
  await api.saveInquiry(id.value, { goodsDesc: goods.goodsDesc, goodsSpec: goods.goodsSpec });
}

async function save(role: string) {
  err.value = '';
  const roleLabel = roles.find((r) => r.key === role)?.label || role;
  await api.upsertParty(id.value, { role, name: forms[role].name, country: forms[role].country });
  await saveGoods();
  ok.value = `${roleLabel} 已保存。到达合同确认（N3）后将自动录入客户管理。`;
  await reload();
}

async function runScreen() {
  err.value = '';
  ok.value = '';
  try {
    await saveGoods();
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
    await saveGoods();
    const r = await api.advance(id.value, 'N1');
    ok.value = r.stub ? r.message : `已推进，下一节点 ${r.nextNode || '结束'}`;
    advancedTo.value = r.nextNode || null;
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

function goNext() {
  const t = nextTarget.value;
  if (t && id.value) goToNode(id.value, t.code);
}
</script>
