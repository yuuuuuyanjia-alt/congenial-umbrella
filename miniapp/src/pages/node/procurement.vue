<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">国内采购 / 备货</view>
      <view class="muted">
        公司无自有产线，签约后向国内供应商采购。须登记供应商、采购合同/PO 与计划到货日，并对供应商做制裁/不可靠实体筛查。计划到货不得晚于客户合同交货期；若延期须登记结构化原因并保留客户同意证据。
      </view>
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
      <view class="label">客户合同交货期</view>
      <input class="input" v-model="form.contractDelivery" placeholder="YYYY-MM-DD" />
      <view class="label">供应商计划到货 / 备妥日期</view>
      <input class="input" v-model="form.plannedArrival" placeholder="YYYY-MM-DD" />
      <view class="label">采购合同/PO 附件（可选，模拟上传）</view>
      <input class="input" v-model="form.poEvidenceStub" placeholder="如 PO-2026-011.pdf" />
      <view class="btn btn-ghost" @click="stubUpload">模拟上传采购合同</view>
      <view class="label">登记采购到货延期</view>
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
const triggers = [
  { key: 'FORCE_MAJEURE', label: '不可抗力' },
  { key: 'PORT_CONGESTION', label: '港口拥堵' },
  { key: 'MATERIAL_SHORTAGE', label: '原料短缺' },
  { key: 'CAPACITY', label: '供应商交期不足' },
  { key: 'CUSTOMER_REQUEST', label: '客户要求' },
  { key: 'LOGISTICS', label: '物流运力' },
];
const form = reactive({
  supplierName: '',
  supplierNameEn: '',
  supplierCountry: 'CN',
  supplierRegistrationNo: '',
  supplierAddress: '',
  poNo: '',
  contractDelivery: '2026-11-30',
  plannedArrival: '2026-11-28',
  poEvidenceStub: '',
  delayRegistered: false,
  delayTriggerCode: '',
  delayTriggerRef: '',
  delayReason: '',
  customerConsent: false,
  customerConsentRef: '',
});

const supplierReport = computed(() =>
  (c.value?.kycReports || []).find((r: any) => r.nodeCode === 'N5'),
);
const supplierHits = computed(() =>
  (c.value?.hits || []).filter((h: any) => h.nodeCode === 'N5' || h.party?.role === 'SUPPLIER'),
);

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

async function reload() {
  c.value = await api.case(id.value);
  const supplier = (c.value.parties || []).find((p: any) => p.role === 'SUPPLIER');
  if (supplier) {
    form.supplierName = supplier.name || '';
    form.supplierNameEn = supplier.nameEn || '';
    form.supplierCountry = supplier.country || 'CN';
    form.supplierRegistrationNo = supplier.registrationNo || '';
    form.supplierAddress = supplier.address || '';
  }
  const p = c.value.procurementPlan;
  const d = c.value.contract?.deliveryDate;
  if (d) form.contractDelivery = String(d).slice(0, 10);
  if (p) {
    form.poNo = p.poNo || form.poNo;
    form.contractDelivery = String(p.contractDelivery || form.contractDelivery).slice(0, 10);
    form.plannedArrival = String(p.plannedArrival || '').slice(0, 10) || form.plannedArrival;
    form.poEvidenceStub = p.poEvidenceStub || '';
    form.delayRegistered = !!p.delayRegistered;
    form.delayTriggerCode = p.delayTriggerCode || '';
    form.delayTriggerRef = p.delayTriggerRef || '';
    form.delayReason = p.delayReason || '';
    form.customerConsent = !!p.customerConsent;
  }
}

function stubUpload() {
  const no = form.poNo || 'PO';
  form.poEvidenceStub = `${no}.pdf`;
  ok.value = '已模拟挂载采购合同/PO 附件（演示占位）';
}

async function save() {
  err.value = '';
  await api.savePlan(id.value, { ...form });
  await reload();
  ok.value = '采购/备货已保存';
}

async function runScreen() {
  err.value = '';
  ok.value = '';
  try {
    await save();
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
    await save();
    const r = await api.advance(id.value, 'N5');
    ok.value = `已推进至 ${r.nextNode}`;
    await reload();
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
  }
}
</script>
