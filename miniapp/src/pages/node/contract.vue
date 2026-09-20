<template>
  <view class="wrap">
    <view class="card" v-if="!c">
      <view class="muted">正在加载销售合同…</view>
    </view>
    <template v-else>
    <view class="card">
      <view class="h2">销售合同 / 订单确认</view>
      <view class="muted">销售合同与采购合同分开签订。硬规则：中信保限额未登记，不得签订销售合同。请先登记投保限额，再保存合同要素。所有权保留、争议解决条款为必填。运输术语（FOB / CIF）与结算方式（前 T/T / 后 T/T）独立，可组合例如 FOB + 前 T/T。CIF 填装运节点，FOB 填国内段到达口岸/港口时间，电汇填对应收汇节点。所选路径下的字段均可填写。公司惯例先销售后采购：国内采购合同在 N5 另签，并须关联本销售合同。</view>
      <view class="err" v-if="!hasLimit" style="margin-top: 12rpx">尚未登记中信保限额，不得签订销售合同。</view>
    </view>
    <view class="card">
      <view class="label">相对方</view>
      <input class="input" v-model="form.counterparty" />
      <view class="label">运输术语（Incoterms）<text class="req">必填</text></view>
      <view class="muted">只选 FOB / CIF 等运输条件。T/T 不是 Incoterm，请在下方结算方式勾选。</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': tradeTerm === 'FOB' }" @click="selectTerm('FOB')">FOB</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': tradeTerm === 'CIF' }" @click="selectTerm('CIF')">CIF</view>
      </view>
      <view class="label">结算方式</view>
      <view class="muted">与运输术语独立，可组合例如 FOB + 前 T/T。再点一次可取消，改为填写其他付款条件。</view>
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
    </view>

    <view class="card" v-if="tradeTerm === 'CIF'">
      <view class="h2">CIF 装运节点</view>
      <view class="muted">装运后预计什么时候到达哪个港口。下列字段均可填写。</view>
      <view class="label">装运港口</view>
      <input class="input" v-model="form.shipmentPort" placeholder="如 Shanghai" />
      <view class="label">装运日期</view>
      <input class="input" v-model="form.shipmentDate" placeholder="年-月-日，如 2026-08-15" />
      <view class="h2" style="margin-top: 24rpx">货物状态</view>
      <view class="label">预计到达日期</view>
      <input class="input" v-model="form.etaDate" placeholder="年-月-日，如 2026-09-20" />
      <view class="label">到达港口</view>
      <input class="input" v-model="form.arrivalPort" placeholder="预计到达的港口，如 Hamburg" />
    </view>

    <view class="card" v-if="tradeTerm === 'FOB'">
      <view class="h2">国内段：到达口岸 / 港口时间</view>
      <view class="muted">货物到达指定口岸/港口即完成国内交付。下列字段可填写。</view>
      <view class="label">到达口岸/港口时间</view>
      <input class="input" v-model="form.domesticPortArrivalAt" placeholder="年-月-日 或 年-月-日 时:分，如 2026-12-08 10:00" />
    </view>

    <view class="card" v-if="form.ttTiming">
      <view class="h2">T/T 收汇节点</view>
      <view class="muted">与上方运输术语独立。前 T/T / 后 T/T 字段均可填写。</view>
      <view class="label">T/T 类型</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.ttTiming === 'ADVANCE' }" @click="selectTtTiming('ADVANCE')">前 T/T</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.ttTiming === 'AFTER' }" @click="selectTtTiming('AFTER')">后 T/T</view>
      </view>

      <template v-if="form.ttTiming === 'ADVANCE'">
        <view class="muted" style="margin-top: 12rpx">前 T/T：约定先收款再发货。比例、金额与装运日期均可填。是否收汇以收汇对账为准。</view>
        <view class="label">预付款比例（%）</view>
        <input class="input" type="digit" v-model="form.ttPercent" placeholder="如 30" @input="syncAdvanceFromPercent" />
        <view class="label">预付款金额</view>
        <input class="input" type="digit" v-model="form.ttAdvanceYuan" :placeholder="`与合同币种一致（${form.currency || 'USD'}）`" />
        <view class="label" v-if="tradeTerm !== 'CIF'">装运日期</view>
        <input
          v-if="tradeTerm !== 'CIF'"
          class="input"
          v-model="form.shipmentDate"
          placeholder="年-月-日。填写后计入已出运"
        />
      </template>

      <template v-if="form.ttTiming === 'AFTER'">
        <view class="muted" style="margin-top: 12rpx">后 T/T：装运后再按约定账期收款。装运日期与天数均可填。是否收汇以收汇对账为准。</view>
        <view class="label" v-if="tradeTerm !== 'CIF'">装运日期</view>
        <input
          v-if="tradeTerm !== 'CIF'"
          class="input"
          v-model="form.shipmentDate"
          placeholder="年-月-日。填写后计入已出运"
        />
        <view class="label">装运后付款天数</view>
        <input class="input" type="number" v-model="form.ttDays" placeholder="如 30" />
      </template>
    </view>

    <view class="card">
      <view class="h2">提货与收汇</view>
      <view class="muted">客户是否提货可在此填写。是否收汇、收汇金额、未收汇以收汇对账（水单/到账）为准，此处只读，与占用「已回款」同一口径。请到收汇对账节点登记，勾选本页不能假装已完成。</view>
      <view class="label">客户是否提货</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.customerPickedUp === true }" @click="form.customerPickedUp = true">已提货</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.customerPickedUp === false }" @click="form.customerPickedUp = false">未提货</view>
      </view>
      <view class="label">约定客户付款日期</view>
      <input class="input" v-model="form.paymentDueAt" placeholder="年-月-日。后 T/T 未填时按装运日+天数推算" />
      <view class="label">是否收汇</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.hasRemittance === true }">是</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.hasRemittance === false }">否</view>
      </view>
      <view class="label">收汇金额</view>
      <input
        class="input"
        disabled
        :value="form.remittedYuan"
        :placeholder="`与合同币种一致（${form.currency || 'USD'}）`"
      />
      <view class="label">未收汇金额</view>
      <view class="muted">按收汇对账到账金额与合同总额轧差（{{ form.currency || 'USD' }}）</view>
      <input class="input" disabled :value="unpaidYuan" :placeholder="`与合同币种一致（${form.currency || 'USD'}）`" />
      <view class="btn" @click="save">保存合同要素</view>
      <view class="muted" v-if="!hasLimit" style="margin-top: 8rpx">须先保存中信保限额，否则保存销售合同将被拒绝。</view>
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
    </template>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, fenToYuan, latestSinosure, previewExposure, yuanToFen } from '../../api';
import SinosureExposure from '../../components/SinosureExposure.vue';

type TradeTerm = 'FOB' | 'CIF';
type TtTiming = 'ADVANCE' | 'AFTER';

const id = ref('');
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const form = reactive({
  counterparty: '',
  incoterms: 'CIF' as string,
  paymentTerms: 'L/C',
  ttTiming: '' as '' | TtTiming,
  ttPercent: '',
  ttAdvanceYuan: '',
  ttDays: '',
  hasRetentionOfTitle: true,
  hasDisputeClause: true,
  deliveryDate: '2026-11-30',
  quantity: 10,
  unit: '套',
  amountYuan: '',
  currency: 'USD',
  shipmentPort: '',
  shipmentDate: '',
  etaDate: '',
  arrivalPort: '',
  domesticPortArrivalAt: '',
  customerPickedUp: null as boolean | null,
  paymentDueAt: '',
  hasRemittance: false,
  remittedYuan: '',
});
const sino = reactive({
  evidenceRef: '',
  fileName: '',
  limitYuan: '',
  currency: 'USD',
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
  return previewExposure(base, yuanToFen(form.amountYuan)) || base;
});

const remittedFenEffective = computed(() => (form.hasRemittance ? yuanToFen(form.remittedYuan) : 0));

const unpaidYuan = computed(() => fenToYuan(Math.max(0, yuanToFen(form.amountYuan) - remittedFenEffective.value)) || '0.00');

onLoad(async (q) => {
  id.value = q?.id || '';
  c.value = await api.case(id.value);
  const ct = c.value.contract;
  if (ct) {
    form.counterparty = ct.counterparty || '';
    form.incoterms = isTtOnly(ct.incoterms) ? 'FOB' : ct.incoterms || form.incoterms;
    form.paymentTerms = ct.paymentTerms || form.paymentTerms;
    form.ttTiming = (ct.ttTiming === 'ADVANCE' || ct.ttTiming === 'AFTER' ? ct.ttTiming : resolveTtTiming(ct.paymentTerms || ct.incoterms)) || '';
    form.ttPercent = ct.ttPercentBps != null ? String(Math.round(Number(ct.ttPercentBps) / 100)) : '';
    form.ttAdvanceYuan = ct.ttAdvanceFen ? fenToYuan(ct.ttAdvanceFen) : '';
    form.ttDays = ct.ttDaysAfterShipment != null ? String(ct.ttDaysAfterShipment) : '';
    form.hasRetentionOfTitle = !!ct.hasRetentionOfTitle;
    form.hasDisputeClause = !!ct.hasDisputeClause;
    form.deliveryDate = ct.deliveryDate ? String(ct.deliveryDate).slice(0, 10) : form.deliveryDate;
    form.quantity = ct.quantity ?? form.quantity;
    form.unit = ct.unit || form.unit;
    form.amountYuan = fenToYuan(ct.amountFen || c.value.amountFen);
    form.currency = ct.currency || c.value.currency || 'USD';
    form.shipmentPort = ct.shipmentPort || '';
    form.shipmentDate = ct.shipmentDate ? String(ct.shipmentDate).slice(0, 10) : '';
    form.etaDate = ct.etaDate ? String(ct.etaDate).slice(0, 10) : '';
    form.arrivalPort = ct.arrivalPort || '';
    form.domesticPortArrivalAt = datetimeField(ct.domesticPortArrivalAt);
    form.customerPickedUp = ct.customerPickedUp === true ? true : ct.customerPickedUp === false ? false : null;
    form.paymentDueAt = ct.paymentDueAt ? String(ct.paymentDueAt).slice(0, 10) : '';
    applyContractRemittance(ct);
    if (isTtOnly(ct.incoterms) && !form.ttTiming) form.ttTiming = 'ADVANCE';
    if (form.ttTiming === 'ADVANCE' && !form.ttAdvanceYuan) syncAdvanceFromPercent();
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

function selectTerm(term: TradeTerm) {
  form.incoterms = term;
}

function selectTtTiming(timing: TtTiming) {
  if (form.ttTiming === timing) {
    form.ttTiming = '';
    return;
  }
  form.ttTiming = timing;
  if (timing === 'ADVANCE' && !form.ttPercent) form.ttPercent = '30';
  if (timing === 'AFTER' && !form.ttDays) form.ttDays = '30';
  syncAdvanceFromPercent();
}

function syncAdvanceFromPercent() {
  const pct = Number(form.ttPercent);
  if (!Number.isFinite(pct) || pct <= 0) return;
  const amt = yuanToFen(form.amountYuan);
  if (!amt) return;
  form.ttAdvanceYuan = fenToYuan(Math.round((amt * pct) / 100));
}

function applyContractRemittance(ct?: { hasRemittance?: boolean | null; remittedFen?: number | null } | null) {
  form.hasRemittance = !!ct?.hasRemittance;
  form.remittedYuan = ct?.hasRemittance && ct.remittedFen ? fenToYuan(ct.remittedFen) : '';
}

function datetimeField(v: unknown) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (s.length >= 16) return s.slice(0, 16).replace('T', ' ');
  return s.slice(0, 10);
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

function ymdOrUndef(v: string) {
  const s = (v || '').trim();
  return s || undefined;
}

function intOrUndef(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

async function save() {
  err.value = '';
  ok.value = '';
  try {
    const term = tradeTerm.value || (isTtOnly(form.incoterms) ? 'FOB' : form.incoterms);
    const ttTiming = form.ttTiming || undefined;
    await api.saveContract(id.value, {
      counterparty: form.counterparty,
      incoterms: term || 'FOB',
      paymentTerms: form.paymentTerms,
      ttTiming: ttTiming || null,
      ttPercentBps: ttTiming === 'ADVANCE' && form.ttPercent ? Math.round(Number(form.ttPercent) * 100) : undefined,
      ttAdvanceFen: ttTiming === 'ADVANCE' ? yuanToFen(form.ttAdvanceYuan) : undefined,
      ttDaysAfterShipment: ttTiming === 'AFTER' ? intOrUndef(form.ttDays) : undefined,
      hasRetentionOfTitle: form.hasRetentionOfTitle,
      hasDisputeClause: form.hasDisputeClause,
      deliveryDate: form.deliveryDate,
      quantity: Number(form.quantity),
      unit: form.unit,
      amountFen: yuanToFen(form.amountYuan),
      currency: form.currency,
      shipmentPort: form.shipmentPort,
      shipmentDate: ymdOrUndef(form.shipmentDate),
      etaDate: ymdOrUndef(form.etaDate),
      arrivalPort: form.arrivalPort,
      domesticPortArrivalAt: ymdOrUndef(form.domesticPortArrivalAt),
      customerPickedUp: form.customerPickedUp,
      paymentDueAt: ymdOrUndef(form.paymentDueAt),
    });
    c.value = await api.case(id.value);
    applyContractRemittance(c.value?.contract);
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

<style scoped>
.req {
  color: #b42318;
  font-weight: 600;
  margin-left: 8rpx;
  font-size: var(--font-xs);
}
</style>
