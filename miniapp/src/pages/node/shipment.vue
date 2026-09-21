<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">装运 / 提单指示 · 硬闸门</view>
      <view class="muted">
        须同时具备客户书面指示与内部审批。CIF / CFR 等卖方出单：点选「正本提单」或「电放提单」其一即可（不必两样都有）。FOB / EXW / FAS / FCA 等买方安排运输：可不控提单，走「无提单」路径并留下依据。T/T 是结算方式不是运输术语；装运规则跟随所选 Incoterm，未填运输术语时按 FOB 回退。存在未生效变更单时禁止装运。
      </view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可保存或推进。</view>
    </view>
    <PendingChangeBlock :case-id="id" :case-data="c" />
    <view class="card">
      <view class="label">合同运输术语（N3）</view>
      <view class="muted">{{ contractIncoterms || '尚未从合同读取，可在下方手工填写' }}</view>
      <view class="label">本节点用于闸门的运输术语（可改）</view>
      <input
        class="input"
        v-model="form.n6Incoterms"
        placeholder="默认带出合同术语，必要时改为 FOB / CIF 等；不要填 T/T"
      />
      <view class="muted" v-if="buyerFreight">
        已识别为买方安排运输（FOB / EXW / FAS / FCA）：不强制正本或电放，请走「无提单」或仍选择其一。
      </view>
      <view class="muted" v-else>卖方出单路径：须点选正本或电放其一；无提单须先把本节点术语改为 FOB 等。</view>

      <template v-if="showCifShipping">
        <view class="h2" style="margin-top: 24rpx">CIF 装运</view>
        <view class="label">装运港口</view>
        <input class="input" v-model="form.shipmentPort" placeholder="如 Shanghai" />
        <view class="label">装运日期</view>
        <input class="input" v-model="form.shipmentDate" placeholder="年-月-日，如 2026-08-15" />
        <view class="h2" style="margin-top: 24rpx">货物状态</view>
        <view class="label">预计到达日期</view>
        <input class="input" v-model="form.etaDate" placeholder="年-月-日，如 2026-09-20" />
        <view class="label">到达港口</view>
        <input class="input" v-model="form.arrivalPort" placeholder="预计到达的港口，如 Hamburg" />
      </template>

      <view class="label">客户书面指示编号</view>
      <input class="input" v-model="form.instructionRef" placeholder="例如 INST-2026-001" />
      <view class="label">已收到客户书面指示</view>
      <switch
        :checked="form.hasCustomerWrittenInstruction"
        @change="(e: any) => (form.hasCustomerWrittenInstruction = e.detail.value)"
      />
      <view class="label">内部审批已完成</view>
      <switch
        :checked="form.hasInternalApproval"
        @change="(e: any) => (form.hasInternalApproval = e.detail.value)"
      />

      <view class="label">提单控制（二选一即可）</view>
      <view class="choice-row">
        <view
          class="choice-btn"
          :class="{ 'choice-btn-on': form.blControl === 'ORIGINAL' }"
          @click="selectBl('ORIGINAL')"
        >
          正本提单
        </view>
        <view
          class="choice-btn"
          :class="{ 'choice-btn-on': form.blControl === 'TELEX_RELEASE' }"
          @click="selectBl('TELEX_RELEASE')"
        >
          电放提单
        </view>
      </view>
      <view class="muted" style="margin-top: 8rpx">
        当前：{{ blLabel }}。正本与电放是并列选项，点选其中一个即满足提单控制硬条件。
      </view>

      <view v-if="blTypeSelected">
        <view class="label">提单号（可选）</view>
        <input class="input" v-model="form.blNo" placeholder="卖方控单时填写；无提单路径不必填" />
      </view>

      <view class="label">无提单路径</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': isNoBl }" @click="selectBl('NO_BL')">无提单</view>
      </view>
      <view class="muted">买方指定货代、卖方不签发或不控提单时使用。须填写原因或装船通知 / 订舱编号。</view>

      <view v-if="isNoBl">
        <view class="label">无提单原因说明</view>
        <input class="input" v-model="form.noBlReason" placeholder="如：FOB 买方自行订舱，卖方不控提单" />
        <view class="label">依据编号（装船通知 / 订舱 / 买方运输安排）</view>
        <input class="input" v-model="form.noBlRef" placeholder="例如 SA-2026-001 或 BK-FOB-88" />
        <view class="btn btn-ghost" v-if="canWriteBusiness" @click="stubUpload">演示上传装船通知 / 订舱记录</view>
        <view class="muted" v-if="form.noBlEvidenceStub">已挂演示附件：{{ form.noBlEvidenceStub }}</view>
      </view>

      <view class="btn" v-if="canWriteBusiness" @click="save">保存指示</view>
      <view class="btn btn-danger" v-if="canWriteBusiness" @click="tryAdvance">校验硬闸门并推进</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api';
import PendingChangeBlock from '../../components/PendingChangeBlock.vue';
import { useDemoRole } from '../../role';

const BUYER_FREIGHT = ['FOB', 'EXW', 'FAS', 'FCA'];

const id = ref('');
const { canWriteBusiness, roleLabel } = useDemoRole();
const err = ref('');
const ok = ref('');
const c = ref<any>(null);
const contractIncoterms = ref('');
const form = reactive({
  hasCustomerWrittenInstruction: false,
  instructionRef: '',
  hasInternalApproval: false,
  blControl: '',
  blNo: '',
  n6Incoterms: '',
  noBlReason: '',
  noBlRef: '',
  noBlEvidenceStub: '',
  shipmentPort: '',
  shipmentDate: '',
  etaDate: '',
  arrivalPort: '',
});

const isNoBl = computed(() => form.blControl === 'NO_BL' || form.blControl === 'FOB_NO_BL');
const blTypeSelected = computed(
  () => form.blControl === 'ORIGINAL' || form.blControl === 'TELEX_RELEASE',
);
const buyerFreight = computed(() => BUYER_FREIGHT.includes(effectiveIncotermsCode(form.n6Incoterms)));
const showCifShipping = computed(() => {
  const code = effectiveIncotermsCode(form.n6Incoterms);
  return code === 'CIF' || code === 'CIP' || !!c.value?.contract?.cifShippingVisible;
});
const blLabel = computed(() => {
  if (form.blControl === 'ORIGINAL') return '正本提单';
  if (form.blControl === 'TELEX_RELEASE') return '电放提单';
  if (isNoBl.value) return '无提单';
  return '未选择';
});

onLoad(async (q) => {
  id.value = q?.id || '';
  c.value = await api.case(id.value);
  contractIncoterms.value = displayTransport(c.value.contract?.incoterms || '');
  const s = c.value.shipment;
  if (s) {
    form.hasCustomerWrittenInstruction = !!s.hasCustomerWrittenInstruction;
    form.instructionRef = s.instructionRef || '';
    form.hasInternalApproval = !!s.hasInternalApproval;
    form.blControl = s.blControl || '';
    form.blNo = s.blNo || '';
    form.noBlReason = s.noBlReason || '';
    form.noBlRef = s.noBlRef || '';
    form.noBlEvidenceStub = s.noBlEvidenceStub || '';
    form.n6Incoterms = displayTransport(s.incotermsOverride || contractIncoterms.value);
  } else {
    form.n6Incoterms = contractIncoterms.value;
  }
  const ct = c.value.contract || {};
  form.shipmentPort = ct.shipmentPort || '';
  form.shipmentDate = ct.shipmentDate ? String(ct.shipmentDate).slice(0, 10) : '';
  form.etaDate = ct.etaDate ? String(ct.etaDate).slice(0, 10) : '';
  form.arrivalPort = ct.arrivalPort || '';
});

function incotermsCode(raw: string) {
  const s = (raw || '').trim().toUpperCase().replace(/^INCOTERMS(?:\s*20\d{2})?\s+/, '');
  if (!s) return '';
  const known = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
  const found = s.match(/[A-Z]{3}/g) || [];
  for (const code of found) {
    if (known.includes(code)) return code;
  }
  return '';
}

function isTtOnly(raw: string) {
  const s = (raw || '').trim();
  if (!s || incotermsCode(s)) return false;
  return /t\s*\/\s*t/i.test(s) || /^tt(?:\b|\s|$)/i.test(s);
}

function effectiveIncotermsCode(raw: string) {
  return incotermsCode(raw) || (isTtOnly(raw) ? 'FOB' : '');
}

function displayTransport(raw: string) {
  if (isTtOnly(raw)) return 'FOB';
  return raw;
}

function selectBl(v: string) {
  const currentNoBl = form.blControl === 'NO_BL' || form.blControl === 'FOB_NO_BL';
  if (v === 'NO_BL' && currentNoBl) form.blControl = '';
  else if (form.blControl === v) form.blControl = '';
  else form.blControl = v;
}

function stubUpload() {
  form.noBlEvidenceStub = `DEMO-SA-${id.value.slice(-6) || 'FOB'}.pdf`;
  if (!form.noBlRef) form.noBlRef = 'SA-DEMO-UPLOAD';
  if (!form.noBlReason) form.noBlReason = '买方安排运输，附装船通知/订舱记录（演示）';
  ok.value = `已挂演示附件 ${form.noBlEvidenceStub}`;
}

function payload() {
  const contractCode = effectiveIncotermsCode(contractIncoterms.value);
  const n6Code = effectiveIncotermsCode(form.n6Incoterms);
  const override = n6Code && n6Code !== contractCode ? form.n6Incoterms.trim() : '';
  return {
    hasCustomerWrittenInstruction: form.hasCustomerWrittenInstruction,
    instructionRef: form.instructionRef,
    hasInternalApproval: form.hasInternalApproval,
    blControl: form.blControl || null,
    blNo: isNoBl.value ? '' : form.blNo,
    noBlReason: isNoBl.value ? form.noBlReason : '',
    noBlRef: isNoBl.value ? form.noBlRef : '',
    noBlEvidenceStub: isNoBl.value ? form.noBlEvidenceStub : '',
    incotermsOverride: override || null,
    ...(showCifShipping.value
      ? {
          shipmentPort: form.shipmentPort || null,
          shipmentDate: form.shipmentDate || null,
          etaDate: form.etaDate || null,
          arrivalPort: form.arrivalPort || null,
        }
      : {}),
  };
}

async function save() {
  await api.saveShipment(id.value, payload());
  ok.value = '装运指示已保存（尚未过闸）';
}

async function tryAdvance() {
  err.value = '';
  ok.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N6');
    ok.value = `硬闸门通过，下一节点 ${r.nextNode}`;
  } catch (e: any) {
    err.value = ['硬闸门拒绝推进', ...(e?.reasons || []), e?.missing ? `缺失项 ${e.missing.join(', ')}` : '']
      .filter(Boolean)
      .join('\n');
  }
}
</script>
