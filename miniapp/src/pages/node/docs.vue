<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">单证一致性 · 硬闸门</view>
      <view class="muted">
        须上传销售合同、商业发票、箱单、采购合同、发票、报关单共六份。商业发票与发票是两项，都要有。缺任一份不得推进。存在未生效变更单时禁止推进。
      </view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可上传或推进。</view>
    </view>
    <PendingChangeBlock :case-id="id" :case-data="c" />
    <view class="card" v-for="slot in docSlots" :key="slot.slot">
      <view class="h2">{{ slot.label }}</view>
      <view class="readonly" v-if="fileOf(slot.kind)">{{ fileOf(slot.kind).fileName }}</view>
      <view class="muted" v-else>尚未上传</view>
      <view class="muted" v-if="fileOf(slot.kind)" style="margin-top: 8rpx">文件已写入证据链。</view>
      <view class="btn btn-ghost" v-if="fileOf(slot.kind)" @click="openFile(slot.kind)">查看文件</view>
      <view class="doc-actions" v-if="canWriteBusiness">
        <view class="btn btn-ghost" @click="pickFile(slot)">{{ fileOf(slot.kind) ? '重新上传' : '上传' }}{{ slot.label }}</view>
        <view class="btn btn-ghost" @click="useDemo(slot)">
          {{ uploading === slot.slot ? '正在上传示例…' : '使用演示示例' }}
        </view>
      </view>
    </view>
    <view class="btn btn-danger" v-if="canWriteBusiness" @click="tryAdvance">校验硬闸门并推进</view>
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
  goToNode,
  latestTradeDoc,
  N7_DOC_SLOTS,
  nextWorkNodeFromForm,
  pipelineNodeName,
  uploadDemoTradeDoc,
  type TradeDocSlot,
} from '../../api';
import NextNodeCta from '../../components/NextNodeCta.vue';
import PendingChangeBlock from '../../components/PendingChangeBlock.vue';
import { useDemoRole } from '../../role';

const FORM_NODE = 'N7';
const docSlots = N7_DOC_SLOTS;

const id = ref('');
const { canWriteBusiness, roleLabel } = useDemoRole();
const err = ref('');
const ok = ref('');
const uploading = ref('');
const c = ref<any>(null);
const advancedTo = ref<string | null>(null);
const files = reactive<Record<string, { evidenceId: string; fileName: string }>>({});

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
  if (cur && cur !== FORM_NODE) return `本案已在 ${cur} ${pipelineNodeName(cur)}。可直接进入该节点。`;
  return '';
});

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

function fileOf(kind: string) {
  return files[kind] || null;
}

function hydrate(row: any) {
  c.value = row;
  for (const slot of docSlots) {
    const ev = latestTradeDoc(row.evidences, slot.kind);
    if (ev) files[slot.kind] = { evidenceId: ev.id, fileName: ev.payload?.fileName || slot.demoName };
    else delete files[slot.kind];
  }
}

async function reload() {
  hydrate(await api.case(id.value));
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
  chooseAndUploadTradeDoc(id.value, 'N7', slot.slot)
    .then((uploaded) => rememberUpload(slot, uploaded))
    .catch((e: any) => uploadError(e, true));
}

function useDemo(slot: TradeDocSlot) {
  if (!id.value || uploading.value) return;
  err.value = '';
  ok.value = '';
  uploading.value = slot.slot;
  uploadDemoTradeDoc(id.value, 'N7', slot)
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

async function tryAdvance() {
  err.value = '';
  ok.value = '';
  try {
    const r = await api.advance(id.value, 'N7');
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
  if (t && id.value) goToNode(id.value, t.code);
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
