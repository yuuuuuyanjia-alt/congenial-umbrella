<template>
  <view class="wrap">
    <view class="h1" style="margin-bottom: 8rpx">客户管理</view>
    <view class="muted" style="margin-bottom: 16rpx">
      按买方查看中信保限额、合同、已收汇/未收汇，以及约定收款日是否按期。
    </view>
    <view class="card" v-for="c in list" :key="c.id" @click="open(c.id)">
      <view class="row">
        <view>
          <view class="h2" style="margin: 0">{{ c.name }}</view>
          <view class="muted" style="margin-top: 6rpx">
            {{ c.country || '国家未填' }} · {{ c.contractCount || 0 }} 份合同 · {{ c.caseCount }} 笔交易
          </view>
        </view>
        <view class="badge" :class="remittanceClass(c.collection?.code || c.remittance?.code)">
          收款 {{ c.collection?.label || remittanceText(c.collection?.code || c.remittance?.code) }}
        </view>
      </view>
      <view class="muted" style="margin-top: 12rpx">
        中信保限额 {{ c.sinosureLimit ? money(c.sinosureLimit.insuredLimitFen, c.sinosureLimit.currency) : '未登记' }}
      </view>
      <view class="muted" v-for="b in c.receivable || []" :key="b.currency">
        已收汇 {{ money(b.settledFen, b.currency) }} · 未收汇 {{ money(b.openFen, b.currency) }}
      </view>
    </view>
    <view class="muted" v-if="!list.length">暂无客户。请先启动后端并写入种子数据。</view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, money, remittanceClass, remittanceText } from '../../api';

const list = ref<any[]>([]);

onShow(async () => {
  try {
    list.value = await api.customers();
  } catch (e) {
    uni.showToast({ title: '无法加载客户，请先启动后端', icon: 'none' });
  }
});

function open(id: string) {
  uni.navigateTo({ url: `/pages/customer/detail?id=${id}` });
}
</script>
