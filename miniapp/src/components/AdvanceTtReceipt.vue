<template>
  <view class="card">
    <view class="h2">合同前收汇</view>
    <view class="muted">按销售合同登记，不绑定出运批次。还没有出运批次时也可以填写前 T/T 收汇凭证、比例和金额。</view>
    <view class="muted" style="margin-top: 8rpx">{{ summary }}</view>
    <template v-if="advance">
      <view class="label">收汇比例（%）</view>
      <BoundField
        :model="form"
        field="percent"
        type="digit"
        placeholder="如 30"
        :disabled="!canWriteBusiness"
        @input="syncAmountFromPercent"
      />
      <view class="label">收汇金额（{{ currency }}）</view>
      <BoundField
        :model="form"
        field="amountYuan"
        type="digit"
        :placeholder="currency"
        :disabled="!canWriteBusiness"
        @input="markDirty"
      />
      <view class="label">收汇凭证</view>
      <view class="muted" v-if="!form.vouchers.length">尚未上传</view>
      <view class="muted" v-for="(v, i) in form.vouchers" :key="v.ref || i">{{ v.fileName || v.ref }}</view>
      <view class="btn btn-ghost" v-if="canWriteBusiness" @click="stubVoucher">模拟上传收汇凭证</view>
      <view class="btn" v-if="canWriteBusiness" @click="save">保存合同前收汇</view>
    </template>
    <view class="muted" v-else style="margin-top: 8rpx">
      本合同结算方式不是前 T/T。请先在销售合同选择前 T/T，并填写约定比例与约定金额。收汇凭证不在销售合同页上传。
    </view>
    <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，合同前收汇只读，不可保存。</view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { api, fenToYuan } from '../api';
import { useDemoRole } from '../role';
import {
  buildAdvanceReceiptSave,
  isAdvanceTt,
  percentInputFromBps,
  ttTermsSummary,
  type TtVoucher,
} from '../tt-terms';
import BoundField from './BoundField.vue';

const props = defineProps<{
  caseId: string;
  caseData: any;
}>();
const emit = defineEmits<{ saved: [] }>();

const { canWriteBusiness, roleLabel } = useDemoRole();
const err = ref('');
const ok = ref('');
const dirty = ref(false);
const form = reactive({
  percent: '',
  amountYuan: '',
  vouchers: [] as TtVoucher[],
});

const contract = computed(() => props.caseData?.contract || null);
const advance = computed(() => isAdvanceTt(contract.value));
const currency = computed(() => contract.value?.currency || props.caseData?.currency || 'USD');
const summary = computed(() => ttTermsSummary(contract.value));

watch(
  () => props.caseData,
  (row) => {
    if (!row || dirty.value) return;
    const ct = row.contract;
    form.percent = percentInputFromBps(ct?.ttPercentBps);
    form.amountYuan = ct?.ttAdvanceFen ? fenToYuan(ct.ttAdvanceFen) : '';
    form.vouchers = Array.isArray(ct?.ttVouchers) ? ct.ttVouchers.map((v: TtVoucher) => ({ ...v })) : [];
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  ok.value = '';
}

function syncAmountFromPercent() {
  markDirty();
  const pct = Number(form.percent);
  if (!Number.isFinite(pct) || pct <= 0) return;
  const amt = Number(contract.value?.amountFen ?? props.caseData?.amountFen);
  if (!amt) return;
  form.amountYuan = fenToYuan(Math.round((amt * pct) / 100));
}

function stubVoucher() {
  if (!canWriteBusiness.value) return;
  dirty.value = true;
  const ref = `TT-VOUCHER-${Date.now()}`;
  form.vouchers.push({ ref, fileName: `前TT收汇凭证-${form.vouchers.length + 1}.png` });
  ok.value = '已生成模拟收汇凭证（演示环境，非真实上传）';
  err.value = '';
}

function gateMessage(e: any) {
  if (Array.isArray(e?.reasons) && e.reasons.length) return e.reasons.join('；');
  return e?.message || '保存失败';
}

async function save() {
  if (!canWriteBusiness.value || !props.caseId) return;
  err.value = '';
  ok.value = '';
  const body = buildAdvanceReceiptSave(props.caseData, {
    percent: form.percent,
    amountYuan: form.amountYuan,
    vouchers: form.vouchers,
  });
  if (!body) {
    err.value = '请先在销售合同将结算方式选为前 T/T';
    return;
  }
  try {
    await api.saveContract(props.caseId, body);
    dirty.value = false;
    ok.value = '合同前收汇已保存。凭证与比例按销售合同保存，不绑定出运批次。';
    emit('saved');
  } catch (e: any) {
    err.value = gateMessage(e);
  }
}
</script>
