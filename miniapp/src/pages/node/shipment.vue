<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">装运 / 提单指示 · 硬闸门</view>
      <view class="muted">
        须同时具备客户书面指示与内部审批。CIF / CFR 等卖方出单：点选「正本提单」或「电放提单」其一即可（不必两样都有）。FOB / EXW / FAS / FCA 等买方安排运输：可不控提单，走「无提单」路径并留下依据。
      </view>
    </view>
    <view class="card">
      <view class="label">合同贸易术语（N3）</view>
      <view class="muted">{{ contractIncoterms || '尚未从合同读取，可在下方手工填写' }}</view>
      <view class="label">本节点用于闸门的贸易术语（可改）</view>
      <input
        class="input"
        v-model="form.n6Incoterms"
        placeholder="默认带出合同术语，必要时改为 FOB / CIF 等"
      />
      <view class="muted" v-if="buyerFreight">
        已识别为买方安排运输（FOB / EXW / FAS / FCA）：不强制正本或电放，请走「无提单」或仍选择其一。
      </view>
      <view class="muted" v-else>卖方出单路径：须点选正本或电放其一；无提单须先把本节点术语改为 FOB 等。</view>

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
        <view class="btn btn-ghost" @click="stubUpload">演示上传装船通知 / 订舱记录</view>
        <view class="muted" v-if="form.noBlEvidenceStub">已挂演示附件：{{ form.noBlEvidenceStub }}</view>
      </view>

      <view class="btn" @click="save">保存指示</view>
      <view class="btn btn-danger" @click="tryAdvance">校验硬闸门并推进</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api';

const BUYER_FREIGHT = ['FOB', 'EXW', 'FAS', 'FCA'];

const id = ref('');
const err = ref('');
const ok = ref('');
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
});

const isNoBl = computed(() => form.blControl === 'NO_BL' || form.blControl === 'FOB_NO_BL');
const blTypeSelected = computed(
  () => form.blControl === 'ORIGINAL' || form.blControl === 'TELEX_RELEASE',
);
const buyerFreight = computed(() => BUYER_FREIGHT.includes(incotermsCode(form.n6Incoterms)));
const blLabel = computed(() => {
  if (form.blControl === 'ORIGINAL') return '正本提单';
  if (form.blControl === 'TELEX_RELEASE') return '电放提单';
  if (isNoBl.value) return '无提单';
  return '未选择';
});

onLoad(async (q) => {
  id.value = q?.id || '';
  const c = await api.case(id.value);
  contractIncoterms.value = c.contract?.incoterms || '';
  const s = c.shipment;
  if (s) {
    form.hasCustomerWrittenInstruction = !!s.hasCustomerWrittenInstruction;
    form.instructionRef = s.instructionRef || '';
    form.hasInternalApproval = !!s.hasInternalApproval;
    form.blControl = s.blControl || '';
    form.blNo = s.blNo || '';
    form.noBlReason = s.noBlReason || '';
    form.noBlRef = s.noBlRef || '';
    form.noBlEvidenceStub = s.noBlEvidenceStub || '';
    form.n6Incoterms = s.incotermsOverride || contractIncoterms.value;
  } else {
    form.n6Incoterms = contractIncoterms.value;
  }
});

function incotermsCode(raw: string) {
  return (raw || '')
    .trim()
    .toUpperCase()
    .replace(/^INCOTERMS(?:\s*20\d{2})?\s+/i, '')
    .split(/[\s,;/:：-]+/)[0];
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
  const contractCode = incotermsCode(contractIncoterms.value);
  const n6Code = incotermsCode(form.n6Incoterms);
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
