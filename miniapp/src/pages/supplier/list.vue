<template>
  <view class="wrap">
    <view class="h1" style="margin-bottom: 8rpx">供应商管理</view>
    <view class="muted" style="margin-bottom: 16rpx">
      按国内供应商查看采购合同/PO、是否按期交货，以及货款已付/未付、约定付款日。
    </view>
    <view class="card" v-for="s in list" :key="s.id" @click="open(s.id)">
      <view class="row">
        <view>
          <view class="h2" style="margin: 0">{{ s.name }}</view>
          <view class="muted" style="margin-top: 6rpx">
            {{ s.country || 'CN' }} · {{ s.poCount || 0 }} 笔采购单
          </view>
        </view>
        <view>
          <view class="badge" :class="remittanceClass(s.delivery?.code)">交货 {{ remittanceText(s.delivery?.code) }}</view>
        </view>
      </view>
      <view class="chips">
        <view class="badge" :class="remittanceClass(s.payment?.code)">付款 {{ remittanceText(s.payment?.code) }}</view>
      </view>
      <view class="muted" v-for="b in s.payable || []" :key="b.currency" style="margin-top: 8rpx">
        已付款 {{ money(b.settledFen, b.currency) }} · 还没付款 {{ money(b.openFen, b.currency) }}
      </view>
    </view>
    <view class="muted" v-if="!list.length">暂无国内供应商。请先启动后端并写入种子数据。</view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, money, remittanceClass, remittanceText } from '../../api';

const list = ref<any[]>([]);

onShow(async () => {
  try {
    list.value = await api.suppliers();
  } catch (e) {
    uni.showToast({ title: '无法加载供应商，请先启动后端', icon: 'none' });
  }
});

function open(id: string) {
  uni.navigateTo({ url: `/pages/supplier/detail?id=${id}` });
}
</script>
