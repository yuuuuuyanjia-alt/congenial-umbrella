<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">变更管理</view>
      <view class="muted">交货期 / 数量 / 收货人 / 付款条件变更必须出变更单（含 diff）。客户确认 + 内部确认后生效；敏感变更另需审批。旧版本 SUPERSEDED，禁止删除。</view>
    </view>
    <view class="card">
      <view class="label">变更字段</view>
      <view class="row" style="margin-top: 12rpx; flex-wrap: wrap">
        <view class="chip" :class="{ 'chip-on': form.field === f.key }" v-for="f in fields" :key="f.key" @click="form.field = f.key">{{ f.label }}</view>
      </view>
      <view class="label">新值</view>
      <input class="input" v-model="form.newValue" />
      <view class="label">原因</view>
      <input class="input" v-model="form.reason" />
      <view class="btn" @click="create">创建变更单</view>
    </view>

    <view class="card" v-for="co in c.changeOrders || []" :key="co.id">
      <view class="row">
        <view class="h2" style="margin: 0">{{ co.changeNo }}</view>
        <view class="badge" :class="co.status === 'APPLIED' ? 'badge-pass' : 'badge-review'">{{ co.status }}</view>
      </view>
      <view class="muted">{{ co.reason }} {{ co.isSensitive ? '· 敏感' : '' }}</view>
      <view class="muted" v-for="d in co.diffs" :key="d.id">{{ d.fieldLabel }}：{{ d.oldValue }} → {{ d.newValue }}</view>
      <view class="muted">客户确认 {{ co.customerAckEvidenceId || '无' }} · 内部 {{ co.internalAckEvidenceId || '无' }}</view>
      <view class="label" v-if="co.status !== 'APPLIED'">客户确认编号</view>
      <input class="input" v-if="co.status !== 'APPLIED'" v-model="ackRef[co.id]" placeholder="邮件/函件编号" />
      <view class="btn btn-ghost" v-if="!co.customerAck" @click="ack(co, 'CUSTOMER')">客户确认</view>
      <view class="btn btn-ghost" v-if="!co.internalAck" @click="ack(co, 'INTERNAL')">内部确认</view>
      <view class="btn btn-warn" v-if="co.isSensitive && !co.approved" @click="ack(co, 'APPROVAL')">敏感审批</view>
      <view class="btn" v-if="co.status !== 'APPLIED' && co.status !== 'SUPERSEDED'" @click="apply(co)">应用新版本</view>
    </view>

    <view class="card" v-for="v in c.contractVersions || []" :key="v.id">
      <view class="row">
        <view class="muted">合同版本 v{{ v.version }}</view>
        <view class="badge" :class="v.status === 'ACTIVE' ? 'badge-pass' : 'badge-stub'">{{ v.status }}</view>
      </view>
    </view>

    <view class="btn btn-ghost" @click="tryAdvance">无待确认变更则推进 / 校验过闸</view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { reactive, ref } from 'vue';
import { api } from '../../api';

const id = ref('');
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const ackRef = reactive<Record<string, string>>({});
const fields = [
  { key: 'deliveryDate', label: '交货期' },
  { key: 'quantity', label: '数量' },
  { key: 'consigneeName', label: '收货人' },
  { key: 'paymentTerms', label: '付款条件' },
  { key: 'payerName', label: '付款人' },
  { key: 'buyerName', label: '买方' },
];
const form = reactive({ field: 'quantity', newValue: '12', reason: '客户追加' });

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

async function reload() {
  c.value = await api.case(id.value);
}

async function create() {
  err.value = '';
  await api.createChange(id.value, {
    reason: form.reason,
    diffs: [{ field: form.field, newValue: form.newValue }],
  });
  ok.value = '变更单已创建（旧版本保留）';
  await reload();
}

async function ack(co: any, type: string) {
  err.value = '';
  await api.ackChange(id.value, co.id, { type, ref: ackRef[co.id] || `${type}-${co.changeNo}` });
  ok.value = `${co.changeNo} 已记录 ${type}`;
  await reload();
}

async function apply(co: any) {
  err.value = '';
  try {
    await api.applyChange(id.value, co.id);
    ok.value = `${co.changeNo} 已生效，合同新版本已生成`;
    await reload();
  } catch (e: any) {
    err.value = e?.message || '无法生效';
  }
}

async function tryAdvance() {
  err.value = '';
  try {
    const r = await api.advance(id.value, 'N4');
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
  }
}
</script>
