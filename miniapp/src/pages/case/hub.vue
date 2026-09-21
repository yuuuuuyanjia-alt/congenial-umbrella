<template>
  <view class="wrap">
    <view class="card">
      <view class="h1">合同管理</view>
      <view class="muted" style="margin-top: 8rpx">
        销售合同与采购合同分开办理。请先签订销售合同，再办理采购合同，并在采购合同中关联一笔已签订的销售合同。
      </view>
    </view>

    <view class="card">
      <view class="h2" style="margin-bottom: 8rpx">销售合同管理</view>
      <view class="muted">出口销售合同按未出运、已出运、已完成分组。打开后仍填写销售合同（销售合同/订单确认）。不含国内采购订单。</view>
      <view class="choice-row" style="margin-top: 16rpx">
        <view
          class="choice-btn"
          v-for="b in salesBuckets"
          :key="b.key"
          @click.stop="go(`/pages/case/list?kind=sales&group=${b.key}`)"
        >
          {{ b.label }}
          <view class="muted" style="margin-top: 6rpx; color: inherit">{{ loaded ? `${b.items.length} 笔` : '…' }}</view>
        </view>
      </view>
      <view class="btn" @click="go('/pages/case/list?kind=sales')">进入销售合同</view>
    </view>

    <view class="card" @click="go('/pages/case/list?kind=procurement')">
      <view class="h2" style="margin-bottom: 8rpx">采购合同管理</view>
      <view class="muted">国内采购合同/备货列表。打开后填写采购合同（N5）；保存前须从已签销售合同中任选一笔关联（不限于本案）。装运及后续在出口案办理，不属于本采购合同。</view>
      <view class="btn">进入采购合同</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, groupSalesListByShipment, isSalesListCase } from '../../api';

const raw = ref<any[]>([]);
const loaded = ref(false);
const salesBuckets = computed(() => groupSalesListByShipment(raw.value.filter(isSalesListCase)));

onShow(async () => {
  try {
    raw.value = await api.cases('sales');
  } catch {
    raw.value = [];
  } finally {
    loaded.value = true;
  }
});

function go(url: string) {
  uni.navigateTo({ url });
}
</script>
