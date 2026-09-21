<template>
  <view class="wrap">
    <view class="card" v-if="!c">
      <view class="muted">正在加载销售合同…</view>
    </view>
    <template v-else>
    <view class="card">
      <view class="h2">销售合同 / 订单确认</view>
      <view class="muted">销售合同与采购合同分开签订。须先登记中信保限额（美元）再保存合同。运输术语仅 FOB / CIF，结算方式为前 T/T / 后 T/T，可组合。</view>
      <view class="muted" v-if="c.currentNode" style="margin-top: 8rpx">本案当前节点：{{ c.currentNode }} {{ currentNodeName }}</view>
      <view class="err" v-if="needsKycFirst" style="margin-top: 12rpx">
        本案尚未到达销售合同节点。请先完成询盘/客户 KYC 与报价，再确认签订。
      </view>
      <view class="btn" v-if="needsKycFirst && canWriteBusiness" @click="goEarliest">去办询盘 / 客户 KYC</view>
      <view class="err" v-if="!hasLimit" style="margin-top: 12rpx">尚未登记中信保限额，不得签订销售合同。</view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 12rpx">当前为{{ roleLabel }}，合同只读，不可保存或推进。</view>
    </view>

    <view class="card">
      <view class="label">相对方</view>
      <view class="readonly">{{ form.counterparty || '（询盘买方未填）' }}</view>
      <view class="label">货物名称</view>
      <input class="input" v-model="form.goodsDesc" placeholder="与询盘/报价相同，可改" />
      <view class="label">规格</view>
      <input class="input" v-model="form.goodsSpec" placeholder="如型号、尺寸" />
      <view class="label">运输术语（Incoterms）<text class="req">必填</text></view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': tradeTerm === 'FOB' }" @click="selectTerm('FOB')">FOB</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': tradeTerm === 'CIF' }" @click="selectTerm('CIF')">CIF</view>
      </view>
      <view class="label">结算方式</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.ttTiming === 'ADVANCE' }" @click="selectTtTiming('ADVANCE')">前 T/T</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.ttTiming === 'AFTER' }" @click="selectTtTiming('AFTER')">后 T/T</view>
      </view>
      <view class="label" v-if="!form.ttTiming">付款条件</view>
      <input
        v-if="!form.ttTiming"
        class="input"
        v-model="form.paymentTerms"
        placeholder="如 L/C、OA 30 days；电汇请点选上方前 T/T / 后 T/T"
      />
      <view class="label">数量</view>
      <input class="input" type="number" v-model="form.quantity" />
      <view class="label">单位</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.unit === 'TON' }" @click="form.unit = 'TON'">吨</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.unit === 'KG' }" @click="form.unit = 'KG'">千克</view>
      </view>
      <view class="label">合同总金额（{{ form.currency }}）</view>
      <input class="input" type="digit" v-model="form.amountYuan" :placeholder="`${form.currency} 金额`" />
      <view class="label">币种</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.currency === 'USD' }" @click="form.currency = 'USD'">USD</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.currency === 'CNY' }" @click="form.currency = 'CNY'">CNY</view>
      </view>
      <view class="muted" v-if="form.currency === 'CNY'">人民币合同暂不计入美元占用</view>
      <view class="label">交货方式<text class="req">必填</text></view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.deliveryMode === 'OWN_WAREHOUSE' }" @click="form.deliveryMode = 'OWN_WAREHOUSE'">自有仓</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.deliveryMode === 'DIRECT_PORT' }" @click="form.deliveryMode = 'DIRECT_PORT'">港口直出</view>
      </view>
      <template v-if="form.deliveryMode === 'DIRECT_PORT'">
        <view class="label">货物仓储地点</view>
        <input class="input" v-model="directPort.warehouseLocation" placeholder="如洋山港待装仓" />
        <view class="label">批次号</view>
        <input class="input" v-model="directPort.batchNo" placeholder="批次号" />
      </template>
    </view>

    <view class="card" v-if="tradeTerm === 'FOB'">
      <view class="h2">国内段：到达口岸 / 港口时间</view>
      <view class="label">到达口岸/港口时间</view>
      <input class="input" v-model="form.domesticPortArrivalAt" placeholder="年-月-日 或 年-月-日 时:分，如 2026-12-08 10:00" />
    </view>

    <view class="card" v-if="form.ttTiming === 'ADVANCE'">
      <view class="h2">前 T/T 收汇</view>
      <view class="label">收汇比例（%）</view>
      <input class="input" type="digit" v-model="form.ttPercent" placeholder="如 30" @input="syncAdvanceFromPercent" />
      <view class="label">收汇金额（{{ form.currency }}）</view>
      <input class="input" type="digit" v-model="form.ttAdvanceYuan" :placeholder="form.currency" />
      <view class="label">收汇凭证</view>
      <view class="muted" v-for="(v, i) in form.ttVouchers" :key="v.ref || i">{{ v.fileName || v.ref }}</view>
      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="stubVoucher">模拟上传收汇凭证</view>
    </view>

    <view class="card" v-if="form.ttTiming === 'AFTER'">
      <view class="h2">后 T/T</view>
      <view class="label">装运后付款天数</view>
      <input class="input" type="number" v-model="form.ttDays" placeholder="如 30" />
    </view>

    <view class="card">
      <view class="btn" v-if="canWriteBusiness" @click="save">保存合同要素</view>
      <view class="muted" v-if="canWriteBusiness && !hasLimit" style="margin-top: 8rpx">须先保存中信保限额，否则保存销售合同将被拒绝。</view>
    </view>

    <view class="card">
      <view class="h2">中信保</view>
      <view class="muted">须先登记投保限额（美元），否则不得保存或推进合同。占用不换汇，仅美元销售计入美元占用。</view>
      <SinosureExposure :exposure="exposureView" :show-new="true" />
      <view class="err" v-if="occupancyNeedsReview" style="margin-top: 12rpx">
        占用属高风险，须由风控岗在审核工作台领取并放行后再推进，无需修改合同金额。
      </view>
      <view class="ok" v-if="occupancyApproved" style="margin-top: 12rpx">工作台已放行该高风险占用，可以推进。</view>
      <view class="err" v-if="occupancyRejected" style="margin-top: 12rpx">工作台已驳回该高风险占用，暂不可推进。</view>
      <view class="btn btn-ghost" v-if="canWriteWorkbench && (occupancyNeedsReview || occupancyRejected)" @click="goWorkbench">去审核工作台</view>
      <view class="muted" v-if="sinosureHint" style="margin-top: 8rpx">{{ sinosureHint }}</view>
      <view class="label">保单编号 / 附件编号</view>
      <input class="input" v-model="sino.evidenceRef" placeholder="可手填编号，或点下方模拟上传" />
      <view class="label">附件名称</view>
      <input class="input" v-model="sino.fileName" placeholder="如 中信保限额批注.pdf" />
      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="stubUpload">模拟上传保单</view>
      <view class="label">投保限额</view>
      <input class="input" type="digit" v-model="sino.limitYuan" placeholder="须不低于计入占用的美元合同金额" />
      <view class="label">限额币种</view>
      <view class="readonly">USD</view>
      <view class="muted">中信保限额固定美元</view>
      <view class="btn" v-if="canWriteBusiness" @click="saveSino">保存中信保信息</view>
      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="tryAdvance">尝试确认并推进</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
    <NextNodeCta
      v-if="nextReady"
      :target="nextTarget"
      :ready="nextReady"
      :hint="nextHint"
      button-label="进入下一步"
      @go="goNext"
    />
    </template>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import {
  api,
  fenToYuan,
  goToNode,
  hasReachedNode,
  latestSinosure,
  nextWorkNodeFromForm,
  pipelineNodeName,
  previewExposure,
  SALES_CURRENCY,
  yuanToFen,
} from '../../api';
import { parseContractUnit, resolveCarriedGoods } from '../../goods-fields';
import NextNodeCta from '../../components/NextNodeCta.vue';
import SinosureExposure from '../../components/SinosureExposure.vue';
import { useDemoRole } from '../../role';

type TradeTerm = 'FOB' | 'CIF';
type TtTiming = 'ADVANCE' | 'AFTER';

const FORM_NODE = 'N3';
const id = ref('');
const { canWriteBusiness, canWriteWorkbench, roleLabel } = useDemoRole();
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const savedSession = ref(false);
const advancedTo = ref<string | null>(null);

const currentNodeName = computed(() => pipelineNodeName(c.value?.currentNode));
const needsKycFirst = computed(() => !!c.value && !hasReachedNode(c.value.currentNode, FORM_NODE));
function goEarliest() {
  if (id.value) goToNode(id.value, 'N1');
}
const nextTarget = computed(() =>
  c.value
    ? nextWorkNodeFromForm(FORM_NODE, {
        currentNode: c.value.currentNode,
        changeOrders: c.value.changeOrders,
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
  if (cur && cur !== FORM_NODE) return `本案已在 ${cur} ${pipelineNodeName(cur)}。`;
  return '';
});
const form = reactive({
  counterparty: '',
  goodsDesc: '',
  goodsSpec: '',
  incoterms: 'CIF' as string,
  paymentTerms: 'L/C',
  ttTiming: '' as '' | TtTiming,
  ttPercent: '',
  ttAdvanceYuan: '',
  ttDays: '',
  ttVouchers: [] as Array<{ ref: string; fileName?: string | null }>,
  quantity: 10,
  unit: 'TON' as 'TON' | 'KG',
  amountYuan: '',
  currency: SALES_CURRENCY,
  domesticPortArrivalAt: '',
  deliveryMode: '' as '' | 'OWN_WAREHOUSE' | 'DIRECT_PORT',
});
const directPort = reactive({
  warehouseLocation: '',
  batchNo: '',
});
const sino = reactive({
  evidenceRef: '',
  fileName: '',
  limitYuan: '',
  currency: SALES_CURRENCY,
});

const tradeTerm = computed(() => resolveTradeTerm(form.incoterms));

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
  return previewExposure(base, yuanToFen(form.amountYuan), form.currency) || base;
});

const occupancyReview = computed(() => {
  const rows = (c.value?.occupancyReviews || []).filter(
    (r: any) => r.nodeCode === 'N3' && r.status !== 'SUPERSEDED',
  );
  return (
    rows.find((r: any) => r.status === 'APPROVED') ||
    rows.find((r: any) => r.status === 'REJECTED') ||
    rows[0]
  );
});

const occupancyNeedsReview = computed(() => {
  if (exposureView.value?.band !== 'HIGH') return false;
  const st = occupancyReview.value?.status;
  return !st || st === 'OPEN' || st === 'CLAIMED';
});
const occupancyApproved = computed(
  () => exposureView.value?.band === 'HIGH' && occupancyReview.value?.status === 'APPROVED',
);
const occupancyRejected = computed(
  () => exposureView.value?.band === 'HIGH' && occupancyReview.value?.status === 'REJECTED',
);

function goWorkbench() {
  uni.navigateTo({ url: '/pages/workbench/index' });
}

onLoad(async (q) => {
  id.value = q?.id || '';
  c.value = await api.case(id.value);
  hydrateFromCase(c.value);
});

onShow(async () => {
  if (!id.value) return;
  try {
    c.value = await api.case(id.value);
  } catch {
    /* 首次 onLoad 可能尚未写入 id；忽略 */
  }
});

function hydrateFromCase(row: any) {
  if (!row) return;
  const buyer = (row.parties || []).find((p: any) => p.role === 'BUYER') || row.parties?.[0];
  const activeQuote = (row.quotes || []).find((x: any) => x.status === 'ACTIVE') || row.quotes?.[0];
  const goods = resolveCarriedGoods({
    contract: row.contract,
    quote: activeQuote,
    caseGoodsDesc: row.goodsDesc,
    caseGoodsSpec: row.goodsSpec,
  });
  form.goodsDesc = goods.goodsDesc;
  form.goodsSpec = goods.goodsSpec;
  const ct = row.contract;
  if (ct) {
    form.counterparty = buyer?.name || ct.counterparty || '';
    form.incoterms = isTtOnly(ct.incoterms) ? 'FOB' : ct.incoterms || form.incoterms;
    form.paymentTerms = ct.paymentTerms || form.paymentTerms;
    form.ttTiming = (ct.ttTiming === 'ADVANCE' || ct.ttTiming === 'AFTER' ? ct.ttTiming : resolveTtTiming(ct.paymentTerms || ct.incoterms)) || '';
    form.ttPercent = ct.ttPercentBps != null ? String(Math.round(Number(ct.ttPercentBps) / 100)) : '';
    form.ttAdvanceYuan = ct.ttAdvanceFen ? fenToYuan(ct.ttAdvanceFen) : '';
    form.ttDays = ct.ttDaysAfterShipment != null ? String(ct.ttDaysAfterShipment) : '';
    form.ttVouchers = Array.isArray(ct.ttVouchers) ? ct.ttVouchers : [];
    form.quantity = ct.quantity ?? form.quantity;
    form.unit = parseContractUnit(ct.unit) || parseContractUnit(activeQuote?.unit) || 'TON';
    form.amountYuan = fenToYuan(ct.amountFen || row.amountFen);
    form.currency = ct.currency === 'CNY' || ct.currency === 'USD' ? ct.currency : SALES_CURRENCY;
    form.domesticPortArrivalAt = datetimeField(ct.domesticPortArrivalAt);
    form.deliveryMode = (ct.deliveryMode === 'OWN_WAREHOUSE' || ct.deliveryMode === 'DIRECT_PORT'
      ? ct.deliveryMode
      : '') as typeof form.deliveryMode;
    applyDirectPort(ct.directPort);
    if (isTtOnly(ct.incoterms) && !form.ttTiming) form.ttTiming = 'ADVANCE';
    if (form.ttTiming === 'ADVANCE' && !form.ttAdvanceYuan) syncAdvanceFromPercent();
  } else {
    form.counterparty = buyer?.name || '';
    form.amountYuan = fenToYuan(row.amountFen);
    form.currency = row.currency === 'CNY' || row.currency === 'USD' ? row.currency : SALES_CURRENCY;
    form.unit = parseContractUnit(activeQuote?.unit) || 'TON';
    if (activeQuote?.quantity) form.quantity = activeQuote.quantity;
  }
  const p = latestSinosure(row.sinosurePolicies, 'N3');
  if (p) {
    sino.evidenceRef = p.evidenceRef || '';
    sino.fileName = p.fileName || '';
    sino.limitYuan = fenToYuan(p.insuredLimitFen);
  }
  sino.currency = SALES_CURRENCY;
}

function parseIncotermsCode(raw?: string | null): string {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^INCOTERMS(?:\s*20\d{2})?\s+/, '');
  if (!s) return '';
  const known = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
  const found = s.match(/[A-Z]{3}/g) || [];
  for (const code of found) {
    if (known.includes(code)) return code;
  }
  return '';
}

function isTtOnly(raw?: string | null): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (parseIncotermsCode(s)) return false;
  return /t\s*\/\s*t/i.test(s) || /^tt(?:\b|\s|$)/i.test(s);
}

function resolveTradeTerm(raw?: string | null): TradeTerm | '' {
  const code = parseIncotermsCode(raw);
  if (code === 'CIF' || code === 'CIP') return 'CIF';
  if (code === 'FOB' || code === 'EXW' || code === 'FAS' || code === 'FCA') return 'FOB';
  return '';
}

function resolveTtTiming(terms?: string | null): TtTiming | '' {
  const t = String(terms || '');
  if (/前\s*T\s*\/\s*T|in\s*advance|预付/i.test(t)) return 'ADVANCE';
  if (/后\s*T\s*\/\s*T|after\s*shipment|装运后/i.test(t)) return 'AFTER';
  return '';
}

function isTtPaymentTermsText(raw?: string | null) {
  return /前\s*T\s*\/\s*T|后\s*T\s*\/\s*T/i.test(String(raw || ''));
}

function clearInapplicableModeFields() {
  const term = resolveTradeTerm(form.incoterms);
  const tt = form.ttTiming;
  if (term !== 'FOB') form.domesticPortArrivalAt = '';
  if (tt !== 'ADVANCE') {
    form.ttPercent = '';
    form.ttAdvanceYuan = '';
    form.ttVouchers = [];
  }
  if (tt !== 'AFTER') form.ttDays = '';
  if (!tt && isTtPaymentTermsText(form.paymentTerms)) form.paymentTerms = '';
}

function selectTerm(term: TradeTerm) {
  const prev = resolveTradeTerm(form.incoterms);
  form.incoterms = term;
  if (prev !== term) clearInapplicableModeFields();
}

function selectTtTiming(timing: TtTiming) {
  if (form.ttTiming === timing) {
    form.ttTiming = '';
    clearInapplicableModeFields();
    return;
  }
  form.ttTiming = timing;
  clearInapplicableModeFields();
  if (timing === 'ADVANCE' && !form.ttPercent) form.ttPercent = '30';
  if (timing === 'AFTER' && !form.ttDays) form.ttDays = '30';
  if (timing === 'ADVANCE') syncAdvanceFromPercent();
}

function syncAdvanceFromPercent() {
  const pct = Number(form.ttPercent);
  if (!Number.isFinite(pct) || pct <= 0) return;
  const amt = yuanToFen(form.amountYuan);
  if (!amt) return;
  form.ttAdvanceYuan = fenToYuan(Math.round((amt * pct) / 100));
}

function datetimeField(v: unknown) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (s.length >= 16) return s.slice(0, 16).replace('T', ' ');
  return s.slice(0, 10);
}

function applyDirectPort(dp?: any) {
  if (!dp) return;
  directPort.warehouseLocation = dp.warehouseLocation || dp.goodsWhereAnswer || '';
  directPort.batchNo = dp.batchNo || dp.goodsWhereRef || '';
}

function stubVoucher() {
  const ref = `TT-VOUCHER-${Date.now()}`;
  form.ttVouchers.push({ ref, fileName: `前TT收汇凭证-${form.ttVouchers.length + 1}.png` });
  ok.value = '已生成模拟收汇凭证（演示环境，非真实上传）';
}

function stubUpload() {
  sino.evidenceRef = `SINOSURE-${Date.now()}`;
  sino.fileName = '中信保限额批注-模拟.pdf';
  ok.value = '已生成模拟保单附件编号（演示环境，非真实上传）';
}

function gateMessage(e: any) {
  if (Array.isArray(e?.reasons) && e.reasons.length) return e.reasons.join('；');
  return e?.message || '闸门拒绝';
}

function ymdOrNull(v: string) {
  const s = (v || '').trim();
  return s || null;
}

function intOrNull(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function save() {
  err.value = '';
  ok.value = '';
  try {
    const term = tradeTerm.value || (isTtOnly(form.incoterms) ? 'FOB' : form.incoterms);
    const fob = term === 'FOB';
    const ttTiming = form.ttTiming || null;
    const paymentTerms =
      ttTiming || !isTtPaymentTermsText(form.paymentTerms) ? form.paymentTerms : null;
    await api.saveContract(id.value, {
      counterparty: form.counterparty,
      goodsDesc: form.goodsDesc,
      goodsSpec: form.goodsSpec,
      incoterms: term || 'FOB',
      paymentTerms,
      ttTiming,
      ttPercentBps: ttTiming === 'ADVANCE' && form.ttPercent ? Math.round(Number(form.ttPercent) * 100) : null,
      ttAdvanceFen: ttTiming === 'ADVANCE' && form.ttAdvanceYuan ? yuanToFen(form.ttAdvanceYuan) : null,
      ttDaysAfterShipment: ttTiming === 'AFTER' ? intOrNull(form.ttDays) : null,
      ttVouchers: ttTiming === 'ADVANCE' ? form.ttVouchers : [],
      quantity: Number(form.quantity),
      unit: form.unit,
      amountFen: yuanToFen(form.amountYuan),
      currency: form.currency,
      domesticPortArrivalAt: fob ? ymdOrNull(form.domesticPortArrivalAt) : null,
      deliveryMode: form.deliveryMode || null,
      directPort:
        form.deliveryMode === 'DIRECT_PORT'
          ? {
              warehouseLocation: directPort.warehouseLocation || null,
              batchNo: directPort.batchNo || null,
            }
          : null,
    });
    c.value = await api.case(id.value);
    hydrateFromCase(c.value);
    savedSession.value = true;
    ok.value = '销售合同要素已保存，已按当前金额测算占用；买方已录入或合并至客户管理';
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
    currency: SALES_CURRENCY,
  });
  c.value = await api.case(id.value);
  savedSession.value = true;
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
    c.value = await api.case(id.value);
    savedSession.value = true;
    advancedTo.value = r.nextNode || null;
    const title = r.nextNode ? pipelineNodeName(r.nextNode) : '';
    ok.value = r.nextNode ? `已推进至 ${r.nextNode} ${title}` : '已推进';
    if (r.nextNode) goToNode(id.value, r.nextNode);
  } catch (e: any) {
    err.value = gateMessage(e);
    if (Array.isArray(e?.missing) && e.missing.some((m: string) => String(m).includes('SINOSURE_EXPOSURE_HIGH'))) {
      err.value = `${err.value}\n须由风控岗在审核工作台领取并放行，无需修改合同金额。`;
    }
    if (Array.isArray(e?.missing) && e.missing.some((m: string) => String(m).startsWith('FT'))) {
      err.value = `${err.value}\n港口直出请补仓储地点与批次号。`;
    }
  }
}

function goNext() {
  const t = nextTarget.value;
  if (t) goToNode(id.value, t.code);
}
</script>

<style scoped>
.req {
  color: #b42318;
  font-weight: 600;
  margin-left: 8rpx;
  font-size: var(--font-xs);
}
</style>
