<template>
  <view class="wrap">
    <view class="h1" style="margin-bottom: 8rpx">{{ title }}</view>
    <view class="muted" style="margin-bottom: 16rpx">{{ hint }}</view>
    <view class="muted" v-if="!loaded">正在加载销售合同…</view>
    <view class="card" v-else-if="!list.length">
      <view class="muted">暂无销售合同。请先签订销售合同，再办理{{ emptyLane }}。</view>
      <view class="btn" @click="goSales">去销售合同</view>
    </view>
    <WindowedList v-else :items="list" key-field="id">
      <template #default="{ item: c }">
        <view class="card scroll-skip" @click="pick(c)">
          <view class="row">
            <view style="flex: 1; min-width: 0">
              <view class="muted">销售合同 {{ c.caseNo }}</view>
              <view class="h2" style="margin: 6rpx 0 0; line-height: 1.4">{{ c.customer || c.title }}</view>
            </view>
            <view class="badge" :class="salesShipmentBadgeClass(c)">{{ c.shipmentBucketLabel || salesShipmentBucketLabel(c) }}</view>
          </view>
          <view class="muted" style="margin-top: 8rpx">
            {{ c.goodsDesc || '' }} · {{ c.currentNodeLabel || c.currentNode || '' }} ·
            {{ money(c.contract?.amountFen ?? c.amountFen, c.contract?.currency || c.currency) }}
          </view>
          <view class="btn">{{ pickLabel }}</view>
        </view>
      </template>
    </WindowedList>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, batchPickUrl, isSalesListCase, money, salesShipmentBadgeClass, salesShipmentBucketLabel } from '../../api';
import { resolveBatchLane, type ExportLane } from '../../lane-nav';
import WindowedList from '../../components/WindowedList.vue';

const lane = ref<ExportLane>('shipment');
const raw = ref<any[]>([]);
const loaded = ref(false);

const title = computed(() => {
  if (lane.value === 'docs') return '单证管理';
  if (lane.value === 'remit') return '收汇管理';
  return '出运管理';
});
const hint = computed(() => {
  if (lane.value === 'docs') {
    return '先选择销售合同，再选择该合同已有的出运批次，进入这一批的单证一致性。没有批次时请先去出运管理，这里不会新建批次，也不会打开空白单证页。';
  }
  if (lane.value === 'remit') {
    return '先选择销售合同。选定后可登记合同级前 T/T 收汇（还没有出运批次也可以填）。再选择该合同已有的出运批次，进入这一批的收汇对账。没有批次时请先去出运管理，这里不会新建批次，也不会打开空白收汇页。';
  }
  return '先选择销售合同，再选择或新建出运批次，进入这一批的装运/提单指示。单证与收汇从该批次继续办理。';
});
const pickLabel = computed(() => {
  if (lane.value === 'docs') return '选择已有批次';
  if (lane.value === 'remit') return '办理收汇';
  return '选择并新建批次';
});
const emptyLane = computed(() => (lane.value === 'docs' ? '单证' : lane.value === 'remit' ? '收汇' : '出运'));
const list = computed(() => raw.value.filter(isSalesListCase));

onLoad((q) => {
  lane.value = resolveBatchLane({ lane: q?.lane });
  uni.setNavigationBarTitle({ title: title.value });
});

onShow(async () => {
  try {
    raw.value = await api.cases('sales');
  } catch {
    raw.value = [];
    uni.showToast({ title: '无法加载销售合同，请先启动后端', icon: 'none' });
  } finally {
    loaded.value = true;
  }
});

function pick(c: any) {
  if (!c?.id) return;
  const code = lane.value === 'docs' ? 'N7' : lane.value === 'remit' ? 'N9' : 'N6';
  uni.navigateTo({ url: batchPickUrl(c.id, code) });
}

function goSales() {
  uni.navigateTo({ url: '/pages/case/list?kind=sales' });
}
</script>
