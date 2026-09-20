<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h1" style="line-height: 1.35">{{ contractTitle }}</view>
      <view class="muted" style="margin-top: 8rpx">采购合同 / 国内备货</view>
      <view class="muted">
        销售合同与采购合同分开签订。公司惯例先销售后采购：本页是采购合同，须先从已签订的销售/出口合同中任选一笔关联（不限于本案），否则不得保存或推进。公司无自有产线，向国内供应商采购。须登记供应商、采购合同/PO、计划交付日期与货款支付方式（一次性付清或分期支付），并对供应商做制裁/不可靠实体筛查。计划交付日期或实际交付日期任一晚于关联销售合同交货期，须登记结构化延期并保留客户同意证据。本页展示对照用的关联销售合同交货期。
      </view>
      <view class="muted" v-if="c.currentNode" style="margin-top: 8rpx">本案当前节点：{{ c.currentNode }} {{ currentNodeName }}</view>
    </view>
    <NextNodeCta :target="nextTarget" :ready="nextReady" :hint="nextHint" @go="goNext" />

    <view class="card">
      <view class="h2">关联销售合同</view>
      <view class="muted">
        请从已签订的销售合同中<text style="font-weight: 650">任选一笔</text>关联，不限于本案出口合同。列表来自全部已签销售合同（客户、合同号、金额）。未选择则不得保存或推进。
      </view>
      <view class="label">已签订的销售合同<text class="req">必填</text></view>
      <view class="picker-face" :class="{ 'picker-face-on': !!selectedSales, 'picker-face-open': pickerOpen }" @click="togglePicker">
        <view v-if="selectedSales">
          <view class="h2" style="margin: 0">{{ selectedSales.customer }} · {{ selectedSales.contractNo }}</view>
          <view class="muted" style="margin-top: 8rpx">
            销售金额 {{ money(selectedSales.amountFen, selectedSales.currency) }}
            <text v-if="salesDeliveryYmd"> · 交货期 {{ salesDeliveryYmd }}</text>
            <text v-if="selectedSales.statusLabel"> · {{ selectedSales.statusLabel }}</text>
          </view>
        </view>
        <view v-else class="muted">请选择已签订的销售合同（可任选一笔）</view>
        <view class="picker-caret">{{ pickerOpen ? '收起选项' : `展开 ${salesOptions.length} 笔已签合同` }}</view>
      </view>
      <view v-if="pickerOpen" class="picker-panel">
        <input class="input" v-model="salesQuery" placeholder="筛选客户、合同号或品名" @click.stop />
        <view class="muted" style="margin-top: 8rpx">
          共 {{ filteredSalesOptions.length }} 笔可关联，点选即可更换，不锁定本案。
        </view>
        <view
          class="pick"
          :class="{ 'pick-on': form.salesCaseId === opt.id }"
          v-for="opt in filteredSalesOptions"
          :key="opt.id"
          @click.stop="pickSales(opt)"
        >
          <view class="row">
            <view>
              <view class="h2" style="margin: 0">{{ opt.customer }} · {{ opt.contractNo }}</view>
              <view class="muted" style="margin-top: 6rpx">{{ opt.goodsDesc }}</view>
            </view>
            <view>
              <view class="badge" :class="form.salesCaseId === opt.id ? 'badge-pass' : 'badge-stub'">
                {{ form.salesCaseId === opt.id ? '已选' : opt.isCurrent ? '本案出口' : opt.statusLabel }}
              </view>
            </view>
          </view>
          <view class="muted" style="margin-top: 8rpx">
            销售金额 {{ money(opt.amountFen, opt.currency) }}
            <text v-if="ymd(opt.deliveryDate)"> · 交货期 {{ ymd(opt.deliveryDate) }}</text>
            · {{ opt.currentNodeLabel }} · {{ opt.statusLabel }}
          </view>
        </view>
        <view class="muted" v-if="!filteredSalesOptions.length" style="margin-top: 12rpx">没有匹配的已签销售合同。</view>
      </view>
      <view class="muted" v-if="!salesOptions.length" style="margin-top: 12rpx">暂无已签订的销售合同。请先完成销售合同（N3）签订。</view>
      <view class="ok" v-if="selectedSales" style="margin-top: 12rpx">
        已关联：客户 {{ selectedSales.customer }} · 合同号 {{ selectedSales.contractNo }} · 金额 {{ money(selectedSales.amountFen, selectedSales.currency) }}
        <text v-if="salesDeliveryYmd"> · 交货期 {{ salesDeliveryYmd }}</text>
      </view>
      <view class="err" v-if="!form.salesCaseId" style="margin-top: 12rpx">尚未选择销售合同，不得保存采购合同。</view>
    </view>

    <view class="card">
      <view class="h2">国内供应商</view>
      <view class="label">供应商名称</view>
      <input class="input" v-model="form.supplierName" placeholder="如 苏州精工机械有限公司" />
      <view class="label">英文名称（可选）</view>
      <input class="input" v-model="form.supplierNameEn" placeholder="用于筛查匹配" />
      <view class="label">国家/地区</view>
      <input class="input" v-model="form.supplierCountry" placeholder="CN" />
      <view class="label">统一社会信用代码 / 登记号</view>
      <input class="input" v-model="form.supplierRegistrationNo" placeholder="如 91320500MA1XXXXX" />
      <view class="label">地址</view>
      <input class="input" v-model="form.supplierAddress" placeholder="选填" />
    </view>

    <view class="card">
      <view class="h2">采购合同 / 备货</view>
      <view class="label">采购订单 / 采购合同编号</view>
      <input class="input" v-model="form.poNo" placeholder="如 PO-2026-011" />
      <view class="label">关联销售合同交货期（对照用）</view>
      <view class="readonly" v-if="salesDeliveryYmd">{{ salesDeliveryYmd }}</view>
      <view class="muted" v-else>请先选择已签订的销售合同。有交货期时，计划交付日期或实际交付日期任一晚于该日须登记延期。</view>
      <view class="muted" v-if="salesDeliveryYmd">延期对照此日期：计划交付日期或实际交付日期任一更晚，须登记延期。</view>
      <view class="label">计划交付日期</view>
      <input class="input" v-model="form.plannedArrival" placeholder="YYYY-MM-DD，计划交付日期" />
      <view class="label">实际交付日期</view>
      <input class="input" v-model="form.actualArrival" placeholder="YYYY-MM-DD，实际交付；可选" />
      <view class="label">采购金额（元）</view>
      <input class="input" type="digit" v-model="form.amountYuan" placeholder="采购合同/PO 金额" @blur="syncAmountsFromPercent" />
      <view class="label">币种</view>
      <input class="input" v-model="form.currency" placeholder="CNY" />
      <view class="h2" style="margin-top: 24rpx">付款方式</view>
      <view class="muted">请选择：一次性付清，或分期支付。分期支付时，每一期须填写约定付款时间、付款比例、金额。</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': form.paymentMode === 'FULL' }" @click="setMode('FULL')">一次性付清</view>
        <view class="choice-btn" :class="{ 'choice-btn-on': form.paymentMode === 'STAGED' }" @click="setMode('STAGED')">分期支付</view>
      </view>
      <view class="muted" v-if="scheduleWording" style="margin-top: 8rpx">当前：{{ scheduleWording }}</view>

      <view v-if="form.paymentMode === 'FULL'">
        <view class="label">约定付款时间</view>
        <input class="input" v-model="form.paymentDueAt" placeholder="YYYY-MM-DD 约定付款日期" />
        <view class="label">付款条件（可选）</view>
        <input class="input" v-model="form.paymentConditionText" placeholder="一次性付清" />
        <view class="label">已付货款（元）</view>
        <input class="input" type="digit" v-model="form.paidYuan" placeholder="已付给供应商的金额" />
        <view class="label">付款日期（付清日）</view>
        <input class="input" v-model="form.paidAt" placeholder="YYYY-MM-DD" />
      </view>

      <view v-else>
        <view class="btn btn-ghost" @click="apply90_10">填入 90% 到货 + 10% 尾款</view>
        <view class="inst" v-for="(row, idx) in form.installments" :key="idx">
          <view class="row">
            <view class="h2" style="margin: 0">第 {{ idx + 1 }} 期 · {{ row.label || defaultInstLabel(idx) }}</view>
            <view class="chip" @click="removeInst(idx)" v-if="form.installments.length > 1">删除本期</view>
          </view>
          <view class="label">期次名称</view>
          <input class="input" v-model="row.label" :placeholder="defaultInstLabel(idx)" />
          <view class="label">付款比例（%）<text class="req">必填</text></view>
          <input class="input" type="digit" v-model="row.percent" placeholder="如 90" @blur="onPercent(idx)" />
          <view class="label">金额（元）<text class="req">必填</text></view>
          <input class="input" type="digit" v-model="row.amountYuan" placeholder="可按比例自动带出" @blur="onAmount(idx)" />
          <view class="label">约定付款时间<text class="req">必填</text></view>
          <view class="muted">填写约定日期，或填写触发时间（如货物到达后支付）。至少填一项。</view>
          <input class="input" v-model="row.dueAt" placeholder="YYYY-MM-DD 约定付款日期" />
          <input class="input" v-model="row.conditionText" :placeholder="idx === 0 ? '触发时间，如 货物到达交付地点之后' : '触发时间，如 验收合格后支付'" />
          <view class="label">本期已付（元）</view>
          <input class="input" type="digit" v-model="row.paidYuan" placeholder="登记本期实付" />
          <view class="label">本期付款日</view>
          <input class="input" v-model="row.paidAt" placeholder="YYYY-MM-DD" />
          <view class="btn btn-ghost" @click="markInstPaid(idx)">本期记为付清（今天）</view>
        </view>
        <view class="btn btn-ghost" @click="addInst">再加一期</view>
      </view>
      <view class="label">采购合同/PO 附件（可选，模拟上传）</view>
      <input class="input" v-model="form.poEvidenceStub" placeholder="如 PO-2026-011.pdf" />
      <view class="btn btn-ghost" @click="stubUpload">模拟上传采购合同</view>
      <view class="label">登记采购交付延期</view>
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
      <view class="btn" @click="save">保存采购/备货</view>
    </view>

    <view class="btn" @click="runScreen">执行国内供应商模拟筛查</view>
    <view class="btn btn-ghost" @click="tryAdvance">校验并推进</view>

    <view class="card" v-if="supplierReport">
      <view class="h2">供应商筛查报告</view>
      <view class="row">
        <view>风险评分 {{ supplierReport.score }}</view>
        <view class="badge" :class="decisionClass(supplierReport.riskLevel)">{{ decisionText(supplierReport.riskLevel) }}</view>
      </view>
      <view class="muted" style="margin-top: 8rpx">{{ supplierReport.summary }}</view>
    </view>

    <view class="card" v-for="h in supplierHits" :key="h.id">
      <view class="row">
        <view class="h2" style="margin: 0">{{ h.listCode }} · {{ h.listedName }}</view>
        <view class="badge" :class="decisionClass(h.riskLevel)">{{ h.confidence }} / {{ decisionText(h.disposition) }}</view>
      </view>
      <view class="muted">匹配名称：{{ h.matchedName }}（供应商 {{ h.party?.name || form.supplierName }}）</view>
    </view>

    <view class="muted" v-if="c.procurementPlan?.customerConsentEvidenceId">同意证据 ID：{{ c.procurementPlan.customerConsentEvidenceId }}</view>
    <view class="muted" v-if="c.procurementPlan?.poEvidenceId">PO 证据 ID：{{ c.procurementPlan.poEvidenceId }}</view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
    <NextNodeCta v-if="nextReady" :target="nextTarget" :ready="nextReady" :hint="nextHint" @go="goNext" />
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import {
  api,
  decisionClass,
  decisionText,
  fenToYuan,
  goToNode,
  money,
  nextWorkNodeFromForm,
  pipelineNodeName,
  procurementContractTitle,
  toastErr,
  yuanToFen,
} from '../../api';
import NextNodeCta from '../../components/NextNodeCta.vue';

const FORM_NODE = 'N5';
const id = ref('');
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const savedSession = ref(false);
const advancedTo = ref<string | null>(null);
const salesOptions = ref<any[]>([]);
const salesQuery = ref('');
const pickerOpen = ref(true);
const triggers = [
  { key: 'FORCE_MAJEURE', label: '不可抗力' },
  { key: 'PORT_CONGESTION', label: '港口拥堵' },
  { key: 'MATERIAL_SHORTAGE', label: '原料短缺' },
  { key: 'CAPACITY', label: '供应商交期不足' },
  { key: 'CUSTOMER_REQUEST', label: '客户要求' },
  { key: 'LOGISTICS', label: '物流运力' },
];
function emptyInst(seq: number) {
  return {
    label: seq === 1 ? '到货付款' : '尾款',
    percent: '',
    amountYuan: '',
    conditionText: seq === 1 ? '货物到达交付地点之后支付' : '',
    dueAt: '',
    paidYuan: '',
    paidAt: '',
  };
}
const form = reactive({
  supplierName: '',
  supplierNameEn: '',
  supplierCountry: 'CN',
  supplierRegistrationNo: '',
  supplierAddress: '',
  salesCaseId: '',
  poNo: '',
  plannedArrival: '2026-11-28',
  actualArrival: '',
  amountYuan: '',
  currency: 'CNY',
  paidYuan: '',
  paymentDueAt: '',
  paidAt: '',
  paymentMode: 'FULL' as 'FULL' | 'STAGED',
  paymentConditionText: '一次性付清',
  installments: [emptyInst(1), emptyInst(2)],
  poEvidenceStub: '',
  delayRegistered: false,
  delayTriggerCode: '',
  delayTriggerRef: '',
  delayReason: '',
  customerConsent: false,
  customerConsentRef: '',
});

const selectedSales = computed(
  () =>
    salesOptions.value.find((o: any) => o.id === form.salesCaseId) ||
    (form.salesCaseId ? c.value?.procurementPlan?.salesLink : null) ||
    null,
);
function ymd(v?: string | Date | null) {
  return v ? String(v).slice(0, 10) : '';
}
const salesDeliveryYmd = computed(() =>
  ymd(
    selectedSales.value?.deliveryDate ||
      c.value?.procurementPlan?.salesContractDeliveryDate ||
      c.value?.procurementPlan?.salesLink?.deliveryDate ||
      c.value?.procurementPlan?.contractDelivery,
  ),
);
const currentNodeName = computed(() => pipelineNodeName(c.value?.currentNode));
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
  if (cur && cur !== FORM_NODE) return true;
  return savedSession.value;
});
const nextHint = computed(() => {
  const t = nextTarget.value;
  if (!t) return '';
  const cur = c.value?.currentNode;
  if (cur && cur !== FORM_NODE) {
    return `本案已在 ${cur} ${pipelineNodeName(cur)}。可直接进入该节点，不必再从案件树查找。`;
  }
  if (advancedTo.value) return `已过闸。下一步为 ${t.code} ${t.name}。`;
  if (savedSession.value) return `采购合同已保存。可进入 ${t.code} ${t.name}，不必再从案件树查找。`;
  return `保存或推进本合同后，可进入 ${t.code} ${t.name}，不必再从案件树查找。`;
});
const contractTitle = computed(() =>
  procurementContractTitle(c.value || {}, {
    supplierName: form.supplierName,
    productName: selectedSales.value?.goodsDesc,
    customerName: selectedSales.value?.customer,
  }),
);
const filteredSalesOptions = computed(() => {
  const q = salesQuery.value.trim().toLowerCase();
  if (!q) return salesOptions.value;
  return salesOptions.value.filter((o: any) =>
    [o.customer, o.contractNo, o.caseNo, o.goodsDesc, o.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
});
const supplierReport = computed(() =>
  (c.value?.kycReports || []).find((r: any) => r.nodeCode === 'N5'),
);
const supplierHits = computed(() =>
  (c.value?.hits || []).filter((h: any) => h.nodeCode === 'N5' || h.party?.role === 'SUPPLIER'),
);
const scheduleWording = computed(() => {
  if (form.paymentMode !== 'STAGED' || form.installments.length < 2) return '';
  const first = form.installments[0];
  const last = form.installments[form.installments.length - 1];
  const pct = first.percent || ' ';
  const residualNum = Number(last.amountYuan);
  const residual = Number.isFinite(residualNum)
    ? `${form.currency || 'CNY'} ${residualNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : last.amountYuan || '具体金额';
  const cond = last.conditionText || '填写条件';
  return `货物到达交付地点之后支付（${pct}）%货款，剩余尾款（${residual}）于（${cond}）支付`;
});

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

function defaultInstLabel(idx: number) {
  if (form.installments.length <= 1) return '一次性付清';
  if (idx === 0) return '到货付款';
  if (idx === form.installments.length - 1) return '尾款';
  return `第${idx + 1}期`;
}

function planFen() {
  return form.amountYuan === '' ? 0 : yuanToFen(form.amountYuan);
}

function syncAmountsFromPercent() {
  const plan = planFen();
  if (!plan || form.paymentMode !== 'STAGED') return;
  form.installments.forEach((row, i) => {
    const pct = Number(row.percent);
    if (!Number.isFinite(pct)) return;
    if (i === form.installments.length - 1) {
      const prev = form.installments.slice(0, i).reduce((s, r) => s + (r.amountYuan === '' ? 0 : yuanToFen(r.amountYuan)), 0);
      row.amountYuan = fenToYuan(Math.max(0, plan - prev));
    } else {
      row.amountYuan = fenToYuan(Math.round((plan * pct) / 100));
    }
  });
}

function onPercent(idx: number) {
  syncAmountsFromPercent();
  const plan = planFen();
  const row = form.installments[idx];
  if (plan && row.amountYuan !== '') {
    const pct = Number(row.percent);
    if (Number.isFinite(pct) && idx !== form.installments.length - 1) {
      row.amountYuan = fenToYuan(Math.round((plan * pct) / 100));
    }
  }
}

function onAmount(idx: number) {
  const plan = planFen();
  const row = form.installments[idx];
  if (!plan || row.amountYuan === '') return;
  row.percent = ((yuanToFen(row.amountYuan) * 100) / plan).toFixed(2).replace(/\.00$/, '');
  if (idx !== form.installments.length - 1) syncAmountsFromPercent();
}

function setMode(mode: 'FULL' | 'STAGED') {
  form.paymentMode = mode;
  if (mode === 'STAGED' && form.installments.length < 2) apply90_10();
}

function apply90_10() {
  form.paymentMode = 'STAGED';
  form.installments = [
    {
      label: '到货付款',
      percent: '90',
      amountYuan: '',
      conditionText: '货物到达交付地点之后支付',
      dueAt: form.actualArrival || form.plannedArrival || '',
      paidYuan: '',
      paidAt: '',
    },
    {
      label: '尾款',
      percent: '10',
      amountYuan: '',
      conditionText: '验收合格后支付',
      dueAt: '',
      paidYuan: '',
      paidAt: '',
    },
  ];
  syncAmountsFromPercent();
}

function addInst() {
  form.installments.push(emptyInst(form.installments.length + 1));
}

function removeInst(idx: number) {
  if (form.installments.length <= 1) return;
  form.installments.splice(idx, 1);
  syncAmountsFromPercent();
}

function markInstPaid(idx: number) {
  const row = form.installments[idx];
  row.paidYuan = row.amountYuan || row.paidYuan;
  if (!row.paidAt) row.paidAt = new Date().toISOString().slice(0, 10);
}

function instFromPlan(p: any) {
  const list = p.installments || [];
  if (!list.length) {
    return {
      paymentMode: (p.paymentMode as 'FULL' | 'STAGED') || 'FULL',
      installments: [emptyInst(1), emptyInst(2)],
    };
  }
  return {
    paymentMode: list.length > 1 ? 'STAGED' : (p.paymentMode as 'FULL' | 'STAGED') || 'FULL',
    installments: list.map((item: any, i: number) => ({
      label: item.label || defaultInstLabel(i),
      percent: item.percent != null ? String(item.percent).replace(/\.0$/, '') : '',
      amountYuan: fenToYuan(item.amountFen),
      conditionText: item.conditionText || '',
      dueAt: String(item.dueAt || '').slice(0, 10),
      paidYuan: fenToYuan(item.paidFen),
      paidAt: String(item.paidAt || '').slice(0, 10),
    })),
  };
}

async function reload() {
  c.value = await api.case(id.value);
  try {
    salesOptions.value = await api.salesOptions(id.value);
  } catch {
    salesOptions.value = [];
  }
  const supplier = (c.value.parties || []).find((p: any) => p.role === 'SUPPLIER');
  if (supplier) {
    form.supplierName = supplier.name || '';
    form.supplierNameEn = supplier.nameEn || '';
    form.supplierCountry = supplier.country || 'CN';
    form.supplierRegistrationNo = supplier.registrationNo || '';
    form.supplierAddress = supplier.address || '';
  }
  const p = c.value.procurementPlan;
  const savedSalesId = p?.salesCaseId || p?.salesLink?.id || '';
  form.salesCaseId = savedSalesId;
  pickerOpen.value = !savedSalesId || salesOptions.value.length > 1;
  if (p) {
    form.poNo = p.poNo || form.poNo;
    form.plannedArrival = String(p.plannedArrival || '').slice(0, 10) || form.plannedArrival;
    form.actualArrival = String(p.actualArrival || '').slice(0, 10);
    form.amountYuan = fenToYuan(p.amountFen);
    form.currency = p.currency || 'CNY';
    form.paidYuan = fenToYuan(p.paidFen);
    form.paymentDueAt = String(p.paymentDueAt || '').slice(0, 10);
    form.paidAt = String(p.paidAt || '').slice(0, 10);
    form.poEvidenceStub = p.poEvidenceStub || '';
    form.delayRegistered = !!p.delayRegistered;
    form.delayTriggerCode = p.delayTriggerCode || '';
    form.delayTriggerRef = p.delayTriggerRef || '';
    form.delayReason = p.delayReason || '';
    form.customerConsent = !!p.customerConsent;
    const loaded = instFromPlan(p);
    form.paymentMode = loaded.paymentMode;
    form.installments = loaded.installments;
    form.paymentConditionText = loaded.installments[0]?.conditionText || p.installments?.[0]?.conditionText || '一次性付清';
  }
}

function togglePicker() {
  pickerOpen.value = !pickerOpen.value;
}

function pickSales(opt: any) {
  form.salesCaseId = opt.id;
  ok.value = `已选择销售合同 ${opt.customer} · ${opt.contractNo} · ${money(opt.amountFen, opt.currency)}`;
  err.value = '';
}

function stubUpload() {
  const no = form.poNo || 'PO';
  form.poEvidenceStub = `${no}.pdf`;
  ok.value = '已模拟挂载采购合同/PO 附件（演示占位）';
}

async function save(silent = false) {
  err.value = '';
  if (!form.salesCaseId) {
    err.value = '须关联已签订的销售合同（先销售后采购），否则不得保存或推进采购合同';
    return false;
  }
  if (form.paymentMode === 'STAGED') {
    syncAmountsFromPercent();
    if (form.installments.length < 2) {
      err.value = '分期支付至少两期，每一期须填写约定付款时间、付款比例、金额';
      return false;
    }
    for (let i = 0; i < form.installments.length; i += 1) {
      const row = form.installments[i];
      const n = i + 1;
      if (row.percent === '' || !Number.isFinite(Number(row.percent))) {
        err.value = `第${n}期须填写付款比例`;
        return false;
      }
      if (row.amountYuan === '') {
        err.value = `第${n}期须填写金额`;
        return false;
      }
      if (!row.dueAt && !(row.conditionText || '').trim()) {
        err.value = `第${n}期须填写约定付款时间（约定日期或触发时间）`;
        return false;
      }
    }
  }
  const payload: any = {
    ...form,
    amountFen: form.amountYuan === '' ? undefined : yuanToFen(form.amountYuan),
    paidFen: form.paidYuan === '' ? undefined : yuanToFen(form.paidYuan),
    actualArrival: form.actualArrival || undefined,
    paymentDueAt: form.paymentDueAt || undefined,
    paidAt: form.paidAt || undefined,
    paymentMode: form.paymentMode,
    paymentConditionText: form.paymentConditionText || undefined,
    salesCaseId: form.salesCaseId,
  };
  if (form.paymentMode === 'STAGED') {
    payload.installments = form.installments.map((row, i) => ({
      seq: i + 1,
      label: row.label || defaultInstLabel(i),
      percent: row.percent === '' ? undefined : Number(row.percent),
      amountFen: row.amountYuan === '' ? undefined : yuanToFen(row.amountYuan),
      conditionText: row.conditionText || undefined,
      dueAt: row.dueAt || undefined,
      paidFen: row.paidYuan === '' ? undefined : yuanToFen(row.paidYuan),
      paidAt: row.paidAt || undefined,
    }));
  } else {
    payload.installments = undefined;
  }
  try {
    await api.savePlan(id.value, payload);
    await reload();
    savedSession.value = true;
    if (!silent) ok.value = '采购合同已保存，已关联销售合同';
    return true;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || JSON.stringify(e);
    toastErr(e);
    return false;
  }
}

async function runScreen() {
  err.value = '';
  ok.value = '';
  try {
    const saved = await save(true);
    if (!saved) return;
    await api.screenSupplier(id.value);
    ok.value = '供应商筛查完成（模拟黑名单，无真实 API Key）';
    await reload();
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || JSON.stringify(e);
    toastErr(e);
  }
}

async function tryAdvance() {
  err.value = '';
  ok.value = '';
  try {
    const saved = await save(true);
    if (!saved) return;
    const r = await api.advance(id.value, 'N5');
    ok.value = r.nextNode ? `已推进至 ${r.nextNode} ${pipelineNodeName(r.nextNode)}` : '已推进';
    savedSession.value = true;
    advancedTo.value = r.nextNode || null;
    await reload();
    if (r.nextNode) goToNode(id.value, r.nextNode);
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
  }
}

function goNext() {
  const t = nextTarget.value;
  if (t) goToNode(id.value, t.code);
}
</script>

<style scoped>
.inst {
  border: 2rpx solid #e8eef3;
  border-radius: 12rpx;
  padding: 16rpx 16rpx 20rpx;
  margin-top: 16rpx;
  background: #fbfaf7;
}
.pick {
  border: 2rpx solid #e8eef3;
  border-radius: 12rpx;
  padding: 16rpx;
  margin-top: 12rpx;
  background: #fbfaf7;
}
.pick-on {
  border-color: #0f3d2e;
  background: #e6efe9;
}
.picker-face {
  margin-top: 12rpx;
  border: 2rpx solid #c5d4cb;
  border-radius: 12rpx;
  padding: 20rpx 18rpx;
  background: #f7f5f0;
}
.picker-face-on {
  border-color: #0f3d2e;
  background: #e6efe9;
}
.picker-face-open {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.picker-caret {
  margin-top: 10rpx;
  color: #0f3d2e;
  font-size: var(--font-sm);
  font-weight: 650;
}
.picker-panel {
  border: 2rpx solid #0f3d2e;
  border-top: none;
  border-radius: 0 0 12rpx 12rpx;
  padding: 8rpx 16rpx 16rpx;
  background: #fff;
}
.req {
  color: #b42318;
  font-weight: 600;
  margin-left: 8rpx;
  font-size: var(--font-xs);
}
.readonly {
  margin-top: 8rpx;
  border: 2rpx solid #e8eef3;
  border-radius: 12rpx;
  padding: 18rpx;
  background: #f7f5f0;
  font-weight: 650;
  color: #0f3d2e;
}
</style>
