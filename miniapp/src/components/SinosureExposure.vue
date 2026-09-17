<template>
  <view v-if="e" class="expo" :class="'expo-' + (e.band || 'none')">
    <view class="row">
      <view class="h2" style="margin: 0">中信保占用</view>
      <view class="badge" :class="exposureClass(e.band)">{{ e.bandLabel || '未测算' }}</view>
    </view>
    <view class="muted" style="margin-top: 8rpx">{{ e.formula || '占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款 + 新签订合同金额' }}</view>
    <view class="row line">
      <view class="muted">未履行完毕合同未回款</view>
      <view>{{ money(e.openUnpaidFen, e.currency) }}</view>
    </view>
    <view class="row line">
      <view class="muted">已履行完毕合同未回款</view>
      <view>{{ money(e.fulfilledUnpaidFen, e.currency) }}</view>
    </view>
    <view class="row line" v-if="showNew">
      <view class="muted">新签订合同金额</view>
      <view>{{ money(e.newContractFen, e.currency) }}</view>
    </view>
    <view class="row line total">
      <view>占用合计</view>
      <view>{{ money(e.occupancyFen, e.currency) }}</view>
    </view>
    <view class="row line">
      <view class="muted">投保限额</view>
      <view>{{ e.insuredLimitFen != null ? money(e.insuredLimitFen, e.limitCurrency || e.currency) : '未登记' }}</view>
    </view>
    <view class="row line" v-if="e.insuredLimitFen != null && e.excessFen > 0">
      <view class="over">超额</view>
      <view class="over">{{ money(e.excessFen, e.currency) }}</view>
    </view>
    <view class="row line" v-else-if="e.insuredLimitFen != null">
      <view class="ok">剩余额度</view>
      <view class="ok">{{ money(e.remainingFen, e.currency) }}</view>
    </view>
    <view class="muted" style="margin-top: 10rpx" v-if="e.gateLabel">闸门：{{ e.gateLabel }}</view>
    <view class="muted" v-if="e.summary">{{ e.summary }}</view>
    <view class="muted" v-for="n in e.notes || []" :key="n">{{ n }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { exposureClass, money } from '../api';

const props = defineProps<{ exposure?: any; showNew?: boolean }>();
const e = computed(() => props.exposure);
const showNew = computed(() => {
  if (props.showNew === true) return true;
  if (props.showNew === false) return false;
  return (Number(props.exposure?.newContractFen) || 0) > 0;
});
</script>

<style scoped>
.expo {
  margin-top: 8rpx;
}
.line {
  margin-top: 10rpx;
  font-size: 26rpx;
}
.total {
  font-weight: 700;
  color: #0b3a5b;
}
.over {
  color: #b42318;
  font-weight: 700;
}
.ok {
  color: #1f7a45;
  font-weight: 700;
}
</style>
