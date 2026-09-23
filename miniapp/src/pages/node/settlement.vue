<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">收汇对账 · 硬闸门</view>
      <view class="muted">付款人≠买方时必须有第三方关系证明；另需汇款附言、单证一致证明与放行审批。水单/到账金额是已回款唯一账本：保存后销售列表「已完成」与中信保占用「已回款」同步更新。一批次只记一笔收汇；客户合并付款时请按批次拆开录入。存在未生效变更单时禁止放行。</view>
      <view class="muted" v-if="batchLabel" style="margin-top: 8rpx">当前批次 {{ batchLabel }}。本页只记这一批的收汇。</view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可保存或放行。</view>
    </view>
    <PendingChangeBlock :case-id="id" :case-data="c" />
    <view class="card">
      <view class="label">买方名称</view>
      <BoundField :model="form" field="buyerName" />
      <view class="label">实际付款人</view>
      <BoundField :model="form" field="payerName" />
      <view class="label">汇款附言 / 水单编号</view>
      <BoundField :model="form" field="remittanceMemoRef" />
      <view class="label">实际到账日期（年-月-日）</view>
      <BoundField :model="form" field="receivedAt" placeholder="用于判断是否按期回款" />
      <view class="label">已收汇金额</view>
      <BoundField :model="form" field="amountYuan" :placeholder="`与合同币种一致（${currency}）。留空且已填到账日则按本批金额`" />
      <view class="label">本批未收汇金额</view>
      <view class="muted">本批金额减本批已收汇（{{ currency }}）。本批已回款须未收汇为 0。</view>
      <view class="readonly"><DraftText :text="() => unpaidYuan" /></view>
      <view class="label">已附汇款附言</view>
      <switch :checked="form.hasRemittanceMemo" @change="(e: any) => (form.hasRemittanceMemo = e.detail.value)" />
      <view class="label">单证一致证明</view>
      <switch :checked="form.hasDocConsistencyProof" @change="(e: any) => (form.hasDocConsistencyProof = e.detail.value)" />
      <view class="label">收汇放行审批</view>
      <switch :checked="form.hasReleaseApproval" @change="(e: any) => (form.hasReleaseApproval = e.detail.value)" />
      <view class="label">第三方关系证明（代付时必填）</view>
      <switch :checked="form.hasThirdPartyProof" @change="(e: any) => (form.hasThirdPartyProof = e.detail.value)" />
      <view class="btn" v-if="canWriteBusiness" @click="save">保存收汇材料</view>
      <view class="btn btn-danger" v-if="canWriteBusiness" @click="tryAdvance">校验硬闸门并放行</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, fenToYuan, SALES_CURRENCY, yuanToFen } from '../../api';
import BoundField from '../../components/BoundField.vue';
import DraftText from '../../components/DraftText.vue';
import PendingChangeBlock from '../../components/PendingChangeBlock.vue';
import { useDemoRole } from '../../role';

const id = ref('');
const batchId = ref('');
const { canWriteBusiness, roleLabel } = useDemoRole();
const err = ref('');
const ok = ref('');
const c = ref<any>(null);
const currency = ref(SALES_CURRENCY);
const contractAmountFen = ref(0);
const form = reactive({
  buyerName: '',
  payerName: '',
  remittanceMemoRef: '',
  receivedAt: '',
  amountYuan: '',
  hasRemittanceMemo: false,
  hasDocConsistencyProof: false,
  hasReleaseApproval: false,
  hasThirdPartyProof: false,
});

const activeBatch = computed(() => {
  const list = c.value?.shipmentBatches || [];
  if (batchId.value) return list.find((b: any) => b.id === batchId.value) || null;
  return list[0] || null;
});
const batchLabel = computed(() => (activeBatch.value ? `${activeBatch.value.batchNo}（${activeBatch.value.nodeLabel || '收汇'}）` : ''));
const unpaidYuan = computed(() => {
  const received = form.amountYuan.trim()
    ? yuanToFen(form.amountYuan)
    : form.receivedAt || form.hasRemittanceMemo
      ? contractAmountFen.value
      : 0;
  return fenToYuan(Math.max(0, contractAmountFen.value - received)) || '0.00';
});

onLoad(async (q) => {
  id.value = q?.id || '';
  batchId.value = q?.batchId || '';
  c.value = await api.case(id.value);
  const batch = activeBatch.value;
  if (batch?.id) batchId.value = batch.id;
  const ledger = batch?.settlement || c.value.settlement;
  const buyer = c.value.parties?.find((p: any) => p.role === 'BUYER')?.name || '';
  currency.value = c.value.contract?.currency || SALES_CURRENCY;
  contractAmountFen.value = Number(batch?.amountFen ?? c.value.contract?.amountFen ?? c.value.amountFen) || 0;
  form.buyerName = ledger?.buyerName || buyer;
  form.payerName = ledger?.payerName || buyer;
  if (ledger) {
    form.remittanceMemoRef = ledger.remittanceMemoRef || '';
    form.hasRemittanceMemo = !!ledger.hasRemittanceMemo;
    form.hasDocConsistencyProof = !!ledger.hasDocConsistencyProof;
    form.hasReleaseApproval = !!ledger.hasReleaseApproval;
    form.hasThirdPartyProof = !!ledger.hasThirdPartyProof;
    if (ledger.amountFen != null) form.amountYuan = fenToYuan(ledger.amountFen);
  }
  form.receivedAt = (ledger?.receivedAt || '').toString().slice(0, 10);
});

async function save() {
  const amountFen = form.amountYuan.trim() ? yuanToFen(form.amountYuan) : undefined;
  await api.saveSettlement(id.value, {
    buyerName: form.buyerName,
    payerName: form.payerName,
    remittanceMemoRef: form.remittanceMemoRef,
    receivedAt: form.receivedAt || undefined,
    amountFen,
    isThirdParty: form.payerName.trim() !== form.buyerName.trim(),
    hasRemittanceMemo: !!form.remittanceMemoRef && form.hasRemittanceMemo,
    hasDocConsistencyProof: form.hasDocConsistencyProof,
    hasReleaseApproval: form.hasReleaseApproval,
    hasThirdPartyProof: form.hasThirdPartyProof,
  }, batchId.value || undefined);
  ok.value = '收汇材料已保存。列表已完成与占用已回款已按本笔到账更新。';
}

async function tryAdvance() {
  err.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N9', batchId.value || undefined);
    ok.value = r.nextNode ? `已推进 ${r.nextNode}` : '收汇放行完成';
  } catch (e: any) {
    err.value = ['硬闸门拒绝放行', ...(e?.reasons || [])].join('\n');
  }
}
</script>
