<template>
  <view class="wrap">
    <view class="h1" style="margin-bottom: 8rpx">费用管理</view>
    <view class="muted" style="margin-bottom: 16rpx">
      先选择销售合同，再登记该合同的费用。海运费、陆运费、港杂、保险和自定义费用都可以留空，不按出运批次，也不阻挡节点推进。
    </view>
    <view class="muted" v-if="!loaded">正在加载销售合同…</view>
    <view class="card" v-else-if="!list.length">
      <view class="muted">暂无销售合同。请先签订销售合同，再登记费用。</view>
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
          <view class="btn">登记费用</view>
        </view>
      </template>
    </WindowedList>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, isSalesListCase, money, salesShipmentBadgeClass, salesShipmentBucketLabel } from '../../api';
import WindowedList from '../../components/WindowedList.vue';

const raw = ref<any[]>([]);
const loaded = ref(false);
const list = computed(() => raw.value.filter(isSalesListCase));

onShow(async () => {
  uni.setNavigationBarTitle({ title: '费用管理' });
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
  uni.navigateTo({ url: `/pages/fee/form?id=${encodeURIComponent(c.id)}` });
}

function goSales() {
  uni.navigateTo({ url: '/pages/case/list?kind=sales' });
}
</script>
