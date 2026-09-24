<template>
  <view class="wrap">
    <view class="card" v-if="!ready">
      <view class="muted">正在加载费用…</view>
    </view>
    <view class="card" v-else-if="loadFailed">
      <view class="err">{{ err || '无法加载费用' }}</view>
    </view>
    <template v-else>
      <view class="card">
        <view class="h2">费用管理</view>
        <view class="muted">{{ caseLine }}</view>
        <view class="muted" style="margin-top: 8rpx">币种固定 CNY（人民币），不跟随销售合同。费用按销售合同登记，不按出运批次。全部可以留空，保存后也不阻挡后续节点。</view>
        <view class="muted" v-if="quoteHint" style="margin-top: 8rpx">报价所含项目：{{ quoteHint }}。此处只作提示，不改报价勾选，也不自动填入金额。</view>
        <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可保存。</view>
      </view>

      <view class="card">
        <view class="label">海运费（CNY，可空）</view>
        <BoundField :model="form" field="oceanYuan" type="digit" placeholder="CNY 金额，可留空" :disabled="!canWriteBusiness" @input="markDirty" />
        <view class="label">陆运费（CNY，可空）</view>
        <BoundField :model="form" field="inlandYuan" type="digit" placeholder="CNY 金额，可留空" :disabled="!canWriteBusiness" @input="markDirty" />
        <view class="label">港杂（CNY，可空）</view>
        <BoundField :model="form" field="portYuan" type="digit" placeholder="CNY 金额，可留空" :disabled="!canWriteBusiness" @input="markDirty" />
        <view class="label">保险（CNY，可空）</view>
        <BoundField :model="form" field="insuranceYuan" type="digit" placeholder="CNY 金额，可留空" :disabled="!canWriteBusiness" @input="markDirty" />
      </view>

      <view class="card" v-for="row in customRows" :key="row.key">
        <view class="label">费用名称（可空）</view>
        <BoundField :model="row" field="name" placeholder="如文件费、仓储费" :disabled="!canWriteBusiness" @input="markDirty" />
        <view class="label">金额（CNY，可空）</view>
        <BoundField :model="row" field="amountYuan" type="digit" placeholder="CNY 金额，可留空" :disabled="!canWriteBusiness" @input="markDirty" />
        <view class="btn btn-ghost" v-if="canWriteBusiness" @click="removeRow(row.key)">删除</view>
      </view>

      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="addRow">添加费用</view>
      <view class="btn" v-if="canWriteBusiness" @click="save">保存</view>
      <view class="err" v-if="err">{{ err }}</view>
      <view class="ok" v-if="ok">{{ ok }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { nextTick, reactive, ref } from 'vue';
import { api, toastErr } from '../../api';
import BoundField from '../../components/BoundField.vue';
import { feeSaveBody, yuanInputFromFen } from '../../fee-form';
import { useDemoRole } from '../../role';

const { canWriteBusiness, roleLabel } = useDemoRole();

type CustomRow = { key: string; name: string; amountYuan: string };

const id = ref('');
const ready = ref(false);
const loadFailed = ref(false);
const err = ref('');
const ok = ref('');
const dirty = ref(false);
const caseLine = ref('');
const quoteHint = ref('');
const form = reactive({
  oceanYuan: '',
  inlandYuan: '',
  portYuan: '',
  insuranceYuan: '',
});
const customRows = ref<CustomRow[]>([]);
let rowSeq = 0;
let req = 0;
let applying = false;

function markDirty() {
  if (applying) return;
  dirty.value = true;
  ok.value = '';
}

async function applyView(data: any) {
  applying = true;
  caseLine.value = [data?.caseNo, data?.customer || data?.title].filter(Boolean).join(' · ') || '销售合同';
  quoteHint.value = data?.quoteIncludedLabels || '';
  form.oceanYuan = yuanInputFromFen(data?.oceanFreightFen);
  form.inlandYuan = yuanInputFromFen(data?.inlandFreightFen);
  form.portYuan = yuanInputFromFen(data?.portChargesFen);
  form.insuranceYuan = yuanInputFromFen(data?.insuranceFen);
  customRows.value = (data?.custom || []).map((row: any) => ({
    key: `saved-${++rowSeq}`,
    name: row?.name || '',
    amountYuan: yuanInputFromFen(row?.amountFen),
  }));
  loadFailed.value = false;
  await nextTick();
  applying = false;
  dirty.value = false;
}

async function load() {
  if (!id.value) {
    err.value = '未选择销售合同';
    loadFailed.value = true;
    ready.value = true;
    return;
  }
  const my = ++req;
  try {
    const data = await api.contractFees(id.value);
    if (my !== req || dirty.value) return;
    await applyView(data);
    err.value = '';
  } catch (e: any) {
    if (my !== req) return;
    loadFailed.value = true;
    err.value = e?.message || '无法加载费用';
  } finally {
    if (my === req) ready.value = true;
  }
}

function rememberId(q?: { id?: string } | null) {
  const next = String(q?.id || '').trim();
  if (next) id.value = next;
}

onLoad((q) => {
  rememberId(q);
  uni.setNavigationBarTitle({ title: '费用管理' });
});

onShow(() => {
  if (!id.value && typeof getCurrentPages === 'function') {
    const pages = getCurrentPages();
    const cur = pages[pages.length - 1] as { options?: { id?: string }; $page?: { options?: { id?: string } } };
    rememberId(cur?.options || cur?.$page?.options);
  }
  if (!dirty.value) void load();
});

function addRow() {
  customRows.value = [...customRows.value, { key: `new-${++rowSeq}`, name: '', amountYuan: '' }];
  markDirty();
}

function removeRow(key: string) {
  customRows.value = customRows.value.filter((row) => row.key !== key);
  markDirty();
}

async function save() {
  err.value = '';
  ok.value = '';
  let body;
  try {
    body = feeSaveBody(form, customRows.value);
  } catch (e: any) {
    err.value = e?.message || '金额无法保存';
    return;
  }
  try {
    const data = await api.saveContractFees(id.value, body);
    await applyView(data);
    ok.value = '已保存。费用均为选填，不影响节点推进。';
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (e) {
    toastErr(e);
    err.value = (e as any)?.message || '保存失败';
  }
}
</script>
