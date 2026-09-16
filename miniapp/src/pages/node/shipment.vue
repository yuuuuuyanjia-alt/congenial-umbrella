<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">装运 / 提单指示 · 硬闸门</view>
      <view class="muted">必须同时具备：客户书面指示、内部审批、提单控制方式（正本或电放）。缺一即拒绝推进。</view>
    </view>
    <view class="card">
      <view class="label">客户书面指示编号</view>
      <input class="input" v-model="form.instructionRef" placeholder="例如 INST-2026-001" />
      <view class="label">已收到客户书面指示</view>
      <switch :checked="form.hasCustomerWrittenInstruction" @change="(e: any) => (form.hasCustomerWrittenInstruction = e.detail.value)" />
      <view class="label">内部审批已完成</view>
      <switch :checked="form.hasInternalApproval" @change="(e: any) => (form.hasInternalApproval = e.detail.value)" />
      <view class="label">提单控制</view>
      <view class="row" style="margin-top: 12rpx">
        <view class="chip" @click="form.blControl = 'ORIGINAL'">正本提单</view>
        <view class="chip" @click="form.blControl = 'TELEX_RELEASE'">电放提单</view>
      </view>
      <view class="muted" style="margin-top: 8rpx">当前：{{ form.blControl || '未选择' }}</view>
      <view class="label">提单号</view>
      <input class="input" v-model="form.blNo" />
      <view class="btn" @click="saveOnly">保存指示</view>
      <view class="btn btn-danger" @click="tryAdvance">校验硬闸门并推进</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { reactive, ref } from 'vue';
import { api, formatGateError } from '../../api';

const id = ref('');
const err = ref('');
const ok = ref('');
const form = reactive({
  hasCustomerWrittenInstruction: false,
  instructionRef: '',
  hasInternalApproval: false,
  blControl: '',
  blNo: '',
});

onLoad(async (q) => {
  id.value = q?.id || '';
  const c = await api.case(id.value);
  if (c.shipment) Object.assign(form, c.shipment);
});

async function save() {
  await api.saveShipment(id.value, form);
}

async function saveOnly() {
  err.value = '';
  await save();
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
    err.value = formatGateError(e);
  }
}
</script>
