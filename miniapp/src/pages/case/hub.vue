<template>
  <view class="wrap">
    <view class="card">
      <view class="h1">合同管理</view>
      <view class="muted" style="margin-top: 8rpx">
        销售合同与采购合同分开办理。请先签订销售合同，再办理采购合同，并在采购合同中关联一笔已签订的销售合同。
      </view>
    </view>

    <view class="card" @click="go('/pages/case/list?kind=sales')">
      <view class="h2" style="margin-bottom: 8rpx">销售合同管理</view>
      <view class="muted">出口销售合同列表。打开后可填写并提交销售合同（销售合同/订单确认）。不含国内采购订单。</view>
      <view class="btn">进入销售合同</view>
    </view>

    <view class="card" @click="go('/pages/case/list?kind=procurement')">
      <view class="h2" style="margin-bottom: 8rpx">采购合同管理</view>
      <view class="muted">国内采购合同/备货列表。打开后可填写并提交采购合同；保存前须关联已签订的销售合同。</view>
      <view class="btn">进入采购合同</view>
    </view>
  </view>
</template>

<script setup lang="ts">
function go(url: string) {
  uni.navigateTo({ url });
}
</script>
