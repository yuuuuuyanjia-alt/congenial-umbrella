<template>
  <view class="card">
    <view class="h2">合同前收汇</view>
    <view class="muted">按销售合同登记，不绑定批次。还没有批次也可以上传前 T/T 凭证。比例和约定金额只读，在销售合同维护。</view>
    <view class="muted" style="margin-top: 8rpx">{{ summary }}</view>
    <template v-if="advance">
      <view class="label">约定比例</view>
      <view class="readonly">{{ percentText }}</view>
      <view class="label">约定金额</view>
      <view class="readonly">{{ amountText }}</view>
      <view class="label">收汇凭证</view>
      <view class="muted" v-if="!form.vouchers.length">尚未上传</view>
      <view class="voucher" v-for="(v, i) in form.vouchers" :key="v.ref || i">
        <view class="muted">{{ v.fileName || v.ref }}</view>
        <view class="btn btn-ghost" v-if="canWriteBusiness" @click="removeVoucher(i)">移除</view>
      </view>
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
import { buildAdvanceVoucherSave, isAdvanceTt, ttTermsSummary, type TtVoucher } from '../tt-terms';

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
  vouchers: [] as TtVoucher[],
});

const contract = computed(() => props.caseData?.contract || null);
const advance = computed(() => isAdvanceTt(contract.value));
const currency = computed(() => contract.value?.currency || props.caseData?.currency || 'USD');
const summary = computed(() => ttTermsSummary(contract.value));
const percentText = computed(() => {
  const bps = contract.value?.ttPercentBps;
  if (bps == null || !Number.isFinite(Number(bps))) return '未填（在销售合同维护）';
  return `${Math.round(Number(bps) / 100)}%`;
});
const amountText = computed(() => {
  const fen = Number(contract.value?.ttAdvanceFen);
  if (!(fen > 0)) return '未填（在销售合同维护）';
  return `${currency.value} ${fenToYuan(fen)}`;
});

watch(
  () => props.caseData,
  (row) => {
    if (!row || dirty.value) return;
    const vouchers = row.contract?.ttVouchers;
    form.vouchers = Array.isArray(vouchers) ? vouchers.map((v: TtVoucher) => ({ ...v })) : [];
  },
  { immediate: true },
);

function stubVoucher() {
  if (!canWriteBusiness.value) return;
  dirty.value = true;
  const ref = `TT-VOUCHER-${Date.now()}`;
  form.vouchers.push({ ref, fileName: `前TT收汇凭证-${form.vouchers.length + 1}.png` });
  ok.value = '已生成模拟收汇凭证（演示环境，非真实上传）';
  err.value = '';
}

function removeVoucher(index: number) {
  if (!canWriteBusiness.value) return;
  form.vouchers.splice(index, 1);
  dirty.value = true;
  ok.value = '';
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
  const body = buildAdvanceVoucherSave(props.caseData, form.vouchers);
  if (!body) {
    err.value = '请先在销售合同将结算方式选为前 T/T';
    return;
  }
  try {
    await api.saveAdvanceVouchers(props.caseId, body);
    dirty.value = false;
    ok.value = '合同前收汇已保存。仅凭证按销售合同保存，比例与约定金额仍以销售合同为准，不绑定出运批次。';
    emit('saved');
  } catch (e: any) {
    err.value = gateMessage(e);
  }
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
.voucher {
  margin-top: 8rpx;
}
</style>
