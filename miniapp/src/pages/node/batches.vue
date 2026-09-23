<template>
  <view class="wrap">
    <view class="card" v-if="!c">
      <view class="muted">{{ loadErr || '正在加载出运批次…' }}</view>
    </view>
    <template v-else>
      <view class="card">
        <view class="h2">选择出运批次</view>
        <view class="muted">
          进入装运前请选择已有批次，或新建一批。选定后打开该批次的装运（N6），再用「进入下一步」办理单证（N7）和收汇（N9）。一份销售合同可以多批同时在途。
        </view>
        <view class="muted" style="margin-top: 8rpx">
          {{ c.caseNo }} · {{ c.customer || c.title }} · {{ money(c.contract?.amountFen ?? c.amountFen, currency) }}
        </view>
        <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，不能新建批次。</view>
      </view>

      <view class="card" v-if="!batches.length">
        <view class="muted">还没有出运批次。请新建一批后再进入装运。</view>
      </view>
      <WindowedList :items="batches" key-field="id">
        <template #default="{ item: b }">
          <view class="card">
            <view>批次 {{ b.batchNo }} · {{ b.nodeLabel || '装运' }}</view>
            <view class="muted" style="margin-top: 8rpx">
              数量 {{ b.quantity ?? '—' }} {{ b.unit || '' }} · 金额 {{ money(b.amountFen, b.currency || currency) }} · 已收汇 {{ money(b.receivedFen, b.currency || currency) }}
            </view>
            <view class="muted" v-if="requested === 'N6' && b.currentNode && b.currentNode !== 'N6'" style="margin-top: 8rpx">
              本批当前在{{ b.nodeLabel }}。进入装运后可用「进入下一步」继续该批次的单证或收汇。
            </view>
            <view class="btn" @click="openBatch(b)">{{ openLabel(b) }}</view>
          </view>
        </template>
      </WindowedList>

      <view class="card" v-if="canWriteBusiness">
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
import { api, batchOpenCode, money, nodeEntryUrl, yuanToFen } from '../../api';
import BoundField from '../../components/BoundField.vue';
import WindowedList from '../../components/WindowedList.vue';
import { useDemoRole } from '../../role';

const { canWriteBusiness, roleLabel } = useDemoRole();
const id = ref('');
const requested = ref('N6');
const c = ref<any>(null);
const loadErr = ref('');
const batchForm = reactive({ batchNo: '', quantity: '', amountYuan: '' });
const batchErr = ref('');

const batches = computed(() => c.value?.shipmentBatches || []);
const currency = computed(() => c.value?.contract?.currency || c.value?.currency || 'USD');

onLoad((q) => {
  id.value = q?.id || '';
  const code = String(q?.code || '').toUpperCase();
  requested.value = code === 'N7' || code === 'N9' ? code : 'N6';
});

onShow(load);

function openLabel(b: any) {
  const code = batchOpenCode(b, requested.value);
  if (code === 'N7') return '进入单证 N7';
  if (code === 'N9') return '进入收汇 N9';
  return '进入装运 N6';
}

function openBatch(b: any) {
  if (!id.value || !b?.id) return;
  const code = batchOpenCode(b, requested.value);
  uni.navigateTo({ url: nodeEntryUrl(id.value, code, b.id) });
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
  if (!id.value || !canWriteBusiness.value) return;
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
