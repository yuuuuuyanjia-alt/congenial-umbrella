<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">报价环节</view>
      <view class="muted">勾选所含项目，填写有效期与单价（吨或千克）。含「价格待定 / 费用另议」不得推进。保存即生成新版本，旧版 SUPERSEDED。</view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可保存或推进。</view>
    </view>
    <view class="card">
      <view class="label">货物名称</view>
      <input class="input" v-model="form.goodsDesc" placeholder="与询盘相同，可改" />
      <view class="label">规格</view>
      <input class="input" v-model="form.goodsSpec" placeholder="如型号、尺寸" />
      <view class="label">所含项目</view>
      <view class="choice-row">
        <view
          class="choice-btn"
          v-for="item in includedOptions"
          :key="item.key"
          :class="{ 'choice-btn-on': form.includedItemCodes.includes(item.key) }"
          @click="toggleIncluded(item.key)"
        >{{ item.label }}</view>
      </view>
      <view class="label">有效期（YYYY-MM-DD）</view>
      <input class="input" v-model="form.validityUntil" placeholder="2026-12-31" />
      <view class="label">单价</view>
      <input class="input" type="digit" v-model="form.unitPriceUsd" placeholder="美元金额" />
      <view class="label">单价单位</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.unit === 'TON' }" @click="form.unit = 'TON'">吨</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.unit === 'KG' }" @click="form.unit = 'KG'">千克</view>
      </view>
      <view class="label">数量（{{ unitLabel }}）</view>
      <input class="input" type="number" v-model="form.quantity" />
      <view class="label">备注</view>
      <input class="input" v-model="form.notes" placeholder="禁止填写价格待定/费用另议" />
      <view class="btn" v-if="canWriteBusiness" @click="save">保存为新版本</view>
      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="tryAdvance">校验并推进</view>
    </view>
    <view class="card" v-for="q in c.quotes || []" :key="q.id">
      <view class="row">
        <view class="h2" style="margin: 0">报价 v{{ q.version }}</view>
        <view class="badge" :class="q.status === 'ACTIVE' ? 'badge-pass' : 'badge-stub'">{{ q.status }}</view>
      </view>
      <view class="muted">所含 {{ includedLabel(q) }} · 有效期 {{ dateOnly(q.validityUntil) }}</view>
      <view class="muted">单价 {{ money(q.unitPriceFen) }} / {{ unitText(q.unit || q.snapshot?.unit) }} × {{ q.quantity }}</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
    <NextNodeCta
      v-if="nextReady"
      :target="nextTarget"
      :ready="nextReady"
      :hint="nextHint"
      heading="进入下一步"
      button-label="进入下一步"
      @go="goNext"
    />
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, fenToYuan, goToNode, money, nextWorkNodeFromForm, pipelineNodeName, yuanToFen } from '../../api';
import { resolveCarriedGoods } from '../../goods-fields';
import NextNodeCta from '../../components/NextNodeCta.vue';
import { useDemoRole } from '../../role';

const { canWriteBusiness, roleLabel } = useDemoRole();

const FORM_NODE = 'N2';
const includedOptions = [
  { key: 'OCEAN_FREIGHT', label: '海运费' },
  { key: 'INLAND_FREIGHT', label: '陆运费' },
  { key: 'PORT_CHARGES', label: '港杂' },
];
const UNIT_LABEL: Record<string, string> = { TON: '吨', KG: '千克' };

const id = ref('');
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const advancedTo = ref<string | null>(null);
const form = reactive({
  goodsDesc: '',
  goodsSpec: '',
  includedItemCodes: [] as string[],
  validityUntil: '2026-12-31',
  unitPriceUsd: '12800.00',
  unit: 'TON',
  quantity: 10 as number | string,
  notes: '',
});

const unitLabel = computed(() => UNIT_LABEL[form.unit] || '吨');
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
  return `校验并推进后，可进入 ${t.code} ${t.name}。`;
});

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

async function reload() {
  c.value = await api.case(id.value);
  const active = (c.value.quotes || []).find((x: any) => x.status === 'ACTIVE') || c.value.quotes?.[0];
  const carried = resolveCarriedGoods({
    quote: active,
    caseGoodsDesc: c.value.goodsDesc,
    caseGoodsSpec: c.value.goodsSpec,
  });
  form.goodsDesc = carried.goodsDesc;
  form.goodsSpec = carried.goodsSpec;
  if (active) {
    const codes = Array.isArray(active.includedItemCodes)
      ? active.includedItemCodes
      : parseIncluded(active.includedItems);
    form.includedItemCodes = codes;
    form.validityUntil = dateOnly(active.validityUntil) || form.validityUntil;
    form.unitPriceUsd = fenToYuan(active.unitPriceFen) || form.unitPriceUsd;
    form.unit = active.unit || active.snapshot?.unit || 'TON';
    form.quantity = active.quantity || form.quantity;
    form.notes = active.notes || '';
  }
}

function parseIncluded(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => includedOptions.some((i) => i.key === x));
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parseIncluded(parsed);
  } catch {
    /* free text */
  }
  return includedOptions.filter((i) => s.includes(i.label) || s.includes(i.key)).map((i) => i.key);
}

function toggleIncluded(key: string) {
  const i = form.includedItemCodes.indexOf(key);
  if (i >= 0) form.includedItemCodes.splice(i, 1);
  else form.includedItemCodes.push(key);
}

function includedLabel(q: any) {
  const codes = Array.isArray(q.includedItemCodes) && q.includedItemCodes.length
    ? q.includedItemCodes
    : parseIncluded(q.includedItems);
  if (!codes.length) return '未勾选';
  return codes.map((k: string) => includedOptions.find((i) => i.key === k)?.label || k).join('、');
}

function unitText(u?: string | null) {
  return UNIT_LABEL[u || ''] || u || '吨';
}

function dateOnly(v: any) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

function payload() {
  return {
    goodsDesc: form.goodsDesc,
    goodsSpec: form.goodsSpec,
    includedItemCodes: form.includedItemCodes,
    includedItems: form.includedItemCodes,
    validityUntil: form.validityUntil,
    unitPriceFen: yuanToFen(form.unitPriceUsd),
    unit: form.unit,
    quantity: Number(form.quantity),
    notes: form.notes,
  };
}

async function save() {
  err.value = '';
  const r = await api.saveQuote(id.value, payload());
  ok.value = `已保存报价版本 v${r.version}（旧版 SUPERSEDED）`;
  await reload();
}

async function tryAdvance() {
  err.value = '';
  ok.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N2');
    advancedTo.value = r.nextNode || null;
    await reload();
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
  }
}

function goNext() {
  const t = nextTarget.value;
  if (t && id.value) goToNode(id.value, t.code);
}
</script>
