<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">装运 / 提单指示 · 硬闸门</view>
      <view class="muted">
        须上传商业发票与箱单（写入证据链），并完成内部审批。CIF / CFR 等卖方出单：点选「正本提单」或「电放提单」其一即可（不必两样都有）。FOB / EXW / FAS / FCA 等买方安排运输：可不控提单，走「无提单」路径。T/T 是结算方式不是运输术语；装运规则跟随所选 Incoterm，未填运输术语时按 FOB 回退。存在未生效变更单时禁止装运。同一合同的其他批次不必先完成。
      </view>
      <view class="muted" v-if="batchLabel" style="margin-top: 8rpx">当前批次 {{ batchLabel }}。本页只办理这一批的提单、商业发票和箱单。</view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可保存或推进。</view>
    </view>
    <PendingChangeBlock :case-id="id" :case-data="c" />
    <view class="card">
      <view class="label">本节点用于闸门的运输术语（可改）</view>
      <BoundField
        :model="form"
        field="n6Incoterms"
        placeholder="默认带出合同术语，必要时改为 FOB / CIF 等；不要填 T/T"
      />
      <DraftGate :open="() => buyerFreight">
        <view class="muted">
          已识别为买方安排运输（FOB / EXW / FAS / FCA）：不强制正本或电放，请走「无提单」或仍选择其一。
        </view>
      </DraftGate>
      <DraftGate :open="() => !buyerFreight">
        <view class="muted">卖方出单路径：须点选正本或电放其一；无提单须先把本节点术语改为 FOB 等。</view>
      </DraftGate>

      <DraftGate :open="() => showCifShipping">
        <view class="h2" style="margin-top: 24rpx">CIF 装运</view>
        <view class="label">装运港口</view>
        <BoundField :model="form" field="shipmentPort" placeholder="如 Shanghai" />
        <view class="label">装运日期</view>
        <BoundField :model="form" field="shipmentDate" placeholder="年-月-日，如 2026-08-15" />
        <view class="h2" style="margin-top: 24rpx">货物状态</view>
        <view class="label">预计到达日期</view>
        <BoundField :model="form" field="etaDate" placeholder="年-月-日，如 2026-09-20" />
        <view class="label">到达港口</view>
        <BoundField :model="form" field="arrivalPort" placeholder="预计到达的港口，如 Hamburg" />
      </DraftGate>

      <view class="h2" style="margin-top: 24rpx">商业发票与箱单</view>
      <view class="muted">两份都要上传后才能过闸。没有文件时可用演示示例，无需打开本机文件选择器。</view>
      <WindowedList :items="docSlots" key-field="slot">
        <template #default="{ item: doc }">
          <view style="margin-top: 16rpx">
            <view class="label">{{ doc.label }}</view>
            <view class="readonly" v-if="fileOf(doc.kind)">{{ fileOf(doc.kind).fileName }}</view>
            <view class="muted" v-if="fileOf(doc.kind)" style="margin-top: 8rpx">文件已写入证据链。</view>
            <view class="btn btn-ghost" v-if="fileOf(doc.kind)" @click="openFile(doc.kind)">查看{{ doc.label }}</view>
            <view class="doc-actions" v-if="canWriteBusiness">
              <view class="btn btn-ghost" @click="pickFile(doc)">{{ fileOf(doc.kind) ? '重新' : '' }}上传{{ doc.label }}</view>
              <view class="btn btn-ghost" @click="useDemo(doc)">
                {{ uploading === doc.slot ? '正在上传示例…' : '使用演示示例' }}
              </view>
            </view>
          </view>
        </template>
      </WindowedList>

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
        <BoundField :model="form" field="blNo" placeholder="卖方控单时填写；无提单路径不必填" />
      </view>

      <view class="label">无提单路径</view>
      <view class="choice-row">
        <view class="choice-btn" :class="{ 'choice-btn-on': isNoBl }" @click="selectBl('NO_BL')">无提单</view>
      </view>
      <view class="muted">买方指定货代、卖方不签发或不控提单时使用。</view>

      <view v-if="isNoBl">
        <view class="label">无提单原因说明（可选）</view>
        <BoundField :model="form" field="noBlReason" placeholder="如：FOB 买方自行订舱，卖方不控提单" />
      </view>

      <view class="btn" v-if="canWriteBusiness" @click="save">保存指示</view>
      <view class="btn btn-danger" v-if="canWriteBusiness" @click="tryAdvance">校验硬闸门并推进</view>
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
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import {
  api,
  chooseAndUploadTradeDoc,
  evidenceFileUrl,
  batchPickUrl,
  goToNode,
  latestTradeDoc,
  N6_DOC_SLOTS,
  nextWorkNodeFromForm,
  pipelineNodeName,
  uploadDemoTradeDoc,
  type TradeDocSlot,
} from '../../api';
import BoundField from '../../components/BoundField.vue';
import DraftGate from '../../components/DraftGate.vue';
import WindowedList from '../../components/WindowedList.vue';
import NextNodeCta from '../../components/NextNodeCta.vue';
import PendingChangeBlock from '../../components/PendingChangeBlock.vue';
import { useDemoRole } from '../../role';

const BUYER_FREIGHT = ['FOB', 'EXW', 'FAS', 'FCA'];
const FORM_NODE = 'N6';
const docSlots = N6_DOC_SLOTS;

const id = ref('');
const batchId = ref('');
const { canWriteBusiness, roleLabel } = useDemoRole();
const err = ref('');
const ok = ref('');
const uploading = ref('');
const c = ref<any>(null);
const advancedTo = ref<string | null>(null);
const contractIncoterms = ref('');
const files = reactive<Record<string, { evidenceId: string; fileName: string }>>({});
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
const activeBatch = computed(() => {
  const list = c.value?.shipmentBatches || [];
  if (batchId.value) return list.find((b: any) => b.id === batchId.value) || null;
  return list.length === 1 ? list[0] : list[0] || null;
});
const batchLabel = computed(() => {
  const b = activeBatch.value;
  if (!b) return '';
  const qty = b.quantity != null ? ` · ${b.quantity}${b.unit || ''}` : '';
  return `${b.batchNo}（${b.nodeLabel || '装运'}）${qty}`;
});
const nextHint = computed(() => {
  const t = nextTarget.value;
  if (!t) return '';
  if (advancedTo.value) return `已过闸。下一步为 ${t.code} ${t.name}。`;
  const cur = c.value?.currentNode;
  if (cur && cur !== FORM_NODE) return `本案已在 ${cur} ${pipelineNodeName(cur)}。可直接进入该节点。`;
  return '';
});

onLoad(async (q) => {
  id.value = q?.id || '';
  batchId.value = q?.batchId || '';
  if (id.value && !batchId.value) {
    uni.redirectTo({ url: batchPickUrl(id.value) });
    return;
  }
  await reload();
});

function fileOf(kind: string) {
  return files[kind] || null;
}

function hydrate(row: any) {
  c.value = row;
  const batch = activeBatch.value;
  if (batch?.id) batchId.value = batch.id;
  contractIncoterms.value = displayTransport(row.contract?.incoterms || '');
  const s = batch?.shipment || row.shipment;
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
  const ct = row.contract || {};
  form.shipmentPort = batch?.shipmentPort || ct.shipmentPort || '';
  form.shipmentDate = (batch?.shipmentDate || ct.shipmentDate)
    ? String(batch?.shipmentDate || ct.shipmentDate).slice(0, 10)
    : '';
  form.etaDate = (batch?.etaDate || ct.etaDate) ? String(batch?.etaDate || ct.etaDate).slice(0, 10) : '';
  form.arrivalPort = batch?.arrivalPort || ct.arrivalPort || '';
  for (const slot of docSlots) {
    const ev = latestTradeDoc(row.evidences, slot.kind, batch?.id);
    if (ev) files[slot.kind] = { evidenceId: ev.id, fileName: ev.payload?.fileName || slot.demoName };
    else delete files[slot.kind];
  }
}

async function reload() {
  hydrate(await api.case(id.value));
}

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

function uploadError(e: any, ignoreCancel = false) {
  const msg = e?.message || e?.errMsg || '';
  if (ignoreCancel && (!msg || /cancel|取消|未选择/.test(String(msg)))) return;
  err.value = Array.isArray(e?.message) ? e.message.join('；') : msg || '单证上传失败';
}

function rememberUpload(slot: TradeDocSlot, uploaded: { evidenceId: string; fileName: string }) {
  files[slot.kind] = { evidenceId: uploaded.evidenceId, fileName: uploaded.fileName };
  ok.value = `已上传${slot.label} ${uploaded.fileName}`;
}

function pickFile(slot: TradeDocSlot) {
  if (!id.value || uploading.value) return;
  err.value = '';
  ok.value = '';
  chooseAndUploadTradeDoc(id.value, 'N6', slot.slot, batchId.value || undefined)
    .then((uploaded) => rememberUpload(slot, uploaded))
    .catch((e: any) => uploadError(e, true));
}

function useDemo(slot: TradeDocSlot) {
  if (!id.value || uploading.value) return;
  err.value = '';
  ok.value = '';
  uploading.value = slot.slot;
  uploadDemoTradeDoc(id.value, 'N6', slot, batchId.value || undefined)
    .then((uploaded) => rememberUpload(slot, uploaded))
    .catch((e: any) => uploadError(e))
    .finally(() => {
      uploading.value = '';
    });
}

function openFile(kind: string) {
  const row = files[kind];
  if (!id.value || !row) return;
  const url = evidenceFileUrl(id.value, row.evidenceId);
  if (typeof window !== 'undefined') window.open(url, '_blank');
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
  await api.saveShipment(id.value, payload(), batchId.value || undefined);
  ok.value = '装运指示已保存（尚未过闸）';
}

async function tryAdvance() {
  err.value = '';
  ok.value = '';
  try {
    await api.saveShipment(id.value, payload(), batchId.value || undefined);
    const r = await api.advance(id.value, 'N6', batchId.value || undefined);
    advancedTo.value = r.nextNode || null;
    await reload();
    const title = r.nextNode ? pipelineNodeName(r.nextNode) : '';
    ok.value = r.nextNode ? `已推进至 ${r.nextNode} ${title}` : '已推进';
  } catch (e: any) {
    err.value = ['硬闸门拒绝推进', ...(e?.reasons || []), e?.missing ? `缺失项 ${e.missing.join(', ')}` : '']
      .filter(Boolean)
      .join('\n');
  }
}

function goNext() {
  const t = nextTarget.value;
  if (t && id.value) goToNode(id.value, t.code, batchId.value || undefined);
}
</script>

<style scoped>
.readonly {
  margin-top: 8rpx;
  border: 2rpx solid #e8eef3;
  border-radius: 12rpx;
  padding: 18rpx;
  background: #f7f5f0;
  font-weight: 650;
  color: #0f3d2e;
}
.doc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.doc-actions .btn {
  flex: 1 1 280rpx;
}
</style>
