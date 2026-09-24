<template>
  <view class="wrap">
    <view class="card" v-if="!c">
      <view class="muted">{{ loadErr || '正在加载出运批次…' }}</view>
    </view>
    <template v-else>
      <view class="card">
        <view class="h2">{{ heading }}</view>
        <view class="muted">{{ intro }}</view>
        <view class="muted" style="margin-top: 8rpx">
          {{ c.caseNo }} · {{ c.customer || c.title }} · {{ money(c.contract?.amountFen ?? c.amountFen, currency) }}
        </view>
        <view class="err" v-if="!canWriteBusiness && allowsCreate" style="margin-top: 8rpx">当前为{{ roleLabel }}，不能新建批次。</view>
      </view>

      <AdvanceTtReceipt v-if="lane === 'remit'" :case-id="id" :case-data="c" @saved="load" />

      <view class="card" v-if="!batches.length">
        <view class="muted">{{ emptyText }}</view>
        <view class="btn" v-if="!allowsCreate" @click="goShipment">去办出运</view>
      </view>
      <WindowedList :items="batches" key-field="id">
        <template #default="{ item: b }">
          <view class="card">
            <view>批次 {{ b.batchNo }} · {{ b.nodeLabel || '装运' }}</view>
            <view class="muted" style="margin-top: 8rpx">
              数量 {{ b.quantity ?? '—' }} {{ b.unit || '' }} · 金额 {{ money(b.amountFen, b.currency || currency) }} · 已收汇 {{ money(b.receivedFen, b.currency || currency) }}
            </view>
            <view class="muted" v-if="lane === 'shipment' && b.currentNode && b.currentNode !== 'N6'" style="margin-top: 8rpx">
              本批当前在{{ b.nodeLabel }}。进入装运后用「进入下一步」继续该批次的单证；单证过闸后再去收汇。
            </view>
            <view class="btn" @click="openBatch(b)">{{ openLabel(b) }}</view>
          </view>
        </template>
      </WindowedList>

      <view class="card" v-if="canWriteBusiness && allowsCreate">
        <view class="h2">新建批次</view>
        <view class="label">批次号（可空，按顺序生成）</view>
        <BoundField :model="batchForm" field="batchNo" placeholder="如 2" />
        <view class="label">本批数量</view>
        <BoundField :model="batchForm" field="quantity" placeholder="如 4" />
        <view class="label">本批金额（元，与合同币种一致）</view>
        <BoundField :model="batchForm" field="amountYuan" :placeholder="`如 40000.00 ${currency}`" />
        <view class="btn" @click="createBatch">新建并进入装运</view>
        <view class="err" v-if="batchErr">{{ batchErr }}</view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, batchPickUrl, money, nodeEntryUrl, yuanToFen } from '../../api';
import { laneAllowsCreate, resolveBatchLane, type BatchLane } from '../../lane-nav';
import AdvanceTtReceipt from '../../components/AdvanceTtReceipt.vue';
import BoundField from '../../components/BoundField.vue';
import WindowedList from '../../components/WindowedList.vue';
import { useDemoRole } from '../../role';

const { canWriteBusiness, roleLabel } = useDemoRole();
const id = ref('');
const lane = ref<BatchLane>('shipment');
const c = ref<any>(null);
const loadErr = ref('');
const batchForm = reactive({ batchNo: '', quantity: '', amountYuan: '' });
const batchErr = ref('');

const batches = computed(() => c.value?.shipmentBatches || []);
const currency = computed(() => c.value?.contract?.currency || c.value?.currency || 'USD');
const allowsCreate = computed(() => laneAllowsCreate(lane.value));
const heading = computed(() => {
  if (lane.value === 'docs') return '选择已有批次 · 单证';
  if (lane.value === 'remit') return '选择已有批次 · 收汇';
  return '选择出运批次';
});
const intro = computed(() => {
  if (lane.value === 'docs') {
    return '请选择这份销售合同已有的出运批次，进入该批次的单证（N7）。这里不能新建批次。还没有批次时，请先去出运管理。';
  }
  if (lane.value === 'remit') {
    return '请选择这份销售合同已有的出运批次，进入该批次的收汇（N9）。这里不能新建批次。还没有批次时请先去出运管理。合同前收汇只上传凭证，比例和约定金额只读，来自销售合同，没有批次也可以上传。';
  }
  return '进入装运前请选择已有批次，或新建一批。选定后打开该批次的装运（N6）。过闸后「进入下一步」办理单证（N7）。单证过闸后，或下一步已经是收汇时，再用「去收汇」打开这一批的收汇（N9）。一份销售合同可以多批同时在途。';
});
const emptyText = computed(() => {
  if (lane.value === 'docs') return '这份销售合同还没有出运批次。请先办理出运，选择或新建批次后再回来做单证。不会从这里新建空批次或打开空白单证页。';
  if (lane.value === 'remit') {
    return '这份销售合同还没有出运批次。请先办理出运，再选择已有批次进入收汇。这里不会新建批次，也不会打开空白收汇页。合同前收汇不依赖批次，可在上方上传凭证。';
  }
  return '还没有出运批次。请新建一批后再进入装运。';
});

onLoad((q) => {
  id.value = q?.id || '';
  lane.value = resolveBatchLane({ lane: q?.lane, code: q?.code });
  const titles: Record<BatchLane, string> = {
    shipment: '选择出运批次',
    docs: '选择单证批次',
    remit: '选择收汇批次',
  };
  uni.setNavigationBarTitle({ title: titles[lane.value] });
});

onShow(load);

function openCode(_b: any) {
  if (lane.value === 'docs') return 'N7';
  if (lane.value === 'remit') return 'N9';
  return 'N6';
}

function openLabel(b: any) {
  const code = openCode(b);
  if (code === 'N7') return '进入单证 N7';
  if (code === 'N9') return '进入收汇 N9';
  return '进入装运 N6';
}

function openBatch(b: any) {
  if (!id.value || !b?.id) return;
  uni.navigateTo({ url: nodeEntryUrl(id.value, openCode(b), b.id) });
}

function goShipment() {
  if (!id.value) return;
  uni.navigateTo({ url: batchPickUrl(id.value, 'N6') });
}

async function load() {
  if (!id.value) {
    loadErr.value = '缺少销售合同';
    return;
  }
  loadErr.value = '';
  try {
    c.value = await api.case(id.value);
  } catch (e: any) {
    loadErr.value = e?.message || '无法加载出运批次';
  }
}

async function createBatch() {
  if (!allowsCreate.value || !id.value || !canWriteBusiness.value) return;
  batchErr.value = '';
  const quantity = batchForm.quantity.trim() ? Number(batchForm.quantity) : undefined;
  if (batchForm.quantity.trim() && !Number.isFinite(quantity as number)) {
    batchErr.value = '本批数量须为数字';
    return;
  }
  const amountFen = batchForm.amountYuan.trim() ? yuanToFen(batchForm.amountYuan) : undefined;
  if (batchForm.amountYuan.trim() && !Number.isFinite(Number(batchForm.amountYuan))) {
    batchErr.value = '本批金额须为数字';
    return;
  }
  try {
    const row = await api.createBatch(id.value, {
      batchNo: batchForm.batchNo.trim() || undefined,
      quantity: Number.isFinite(quantity as number) ? quantity : undefined,
      amountFen,
    });
    if (!row?.id) throw { message: '已新建批次但未返回批次编号' };
    batchForm.batchNo = '';
    batchForm.quantity = '';
    batchForm.amountYuan = '';
    uni.navigateTo({ url: nodeEntryUrl(id.value, 'N6', row.id) });
  } catch (e: any) {
    batchErr.value = gateMessage(e);
  }
}

function gateMessage(e: any) {
  if (Array.isArray(e?.reasons) && e.reasons.length) return e.reasons.join('；');
  return e?.message || '操作失败';
}
</script>
