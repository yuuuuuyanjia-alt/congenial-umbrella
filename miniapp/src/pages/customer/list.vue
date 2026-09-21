<template>
  <view class="wrap">
    <RoleBar compact />
    <view class="h1" style="margin-bottom: 8rpx">客户管理</view>
    <view class="muted" style="margin-bottom: 16rpx">
      仅收录已到达合同确认（N3）的买方。同一客户的多笔订单会合并到同一档案。询盘/报价阶段不录入。可查看建议级别、中信保限额与占用、合同、已收汇/未收汇，以及约定收款日是否按期。
    </view>
    <view class="card" v-for="c in list" :key="c.id" @click="open(c.id)">
      <view class="row">
        <view>
          <view class="h2" style="margin: 0">{{ c.name }}</view>
          <view class="muted" style="margin-top: 6rpx">
            {{ c.country || '国家未填' }} · {{ c.contractCount || 0 }} 份合同 · {{ c.caseCount }} 笔交易
          </view>
        </view>
        <view class="badges">
          <view class="badge" :class="gradeClass(c.suggestedGrade)">建议级别 {{ c.suggestedGrade || '—' }}</view>
          <view class="badge" :class="remittanceClass(c.collection?.code || c.remittance?.code)">
            收款 {{ c.collection?.label || remittanceText(c.collection?.code || c.remittance?.code) }}
          </view>
        </view>
      </view>
      <view class="chips" v-if="(c.tags || []).length">
        <view class="chip" v-for="t in c.tags" :key="t">{{ t }}</view>
      </view>
      <view class="muted" style="margin-top: 12rpx">
        中信保限额 {{ c.sinosureLimit ? money(c.sinosureLimit.insuredLimitFen, c.sinosureLimit.currency) : '未登记' }}
        <text v-if="c.exposure?.insuredLimitFen != null">
          · 占用 {{ money(c.exposure.occupancyFen, c.exposure.currency) }}
          <text v-if="c.exposure.excessFen > 0"> · 超额 {{ money(c.exposure.excessFen, c.exposure.currency) }}（{{ c.exposure.bandLabel }}）</text>
          <text v-else> · 剩余 {{ money(c.exposure.remainingFen, c.exposure.currency) }}</text>
        </text>
      </view>
      <view class="muted" v-for="b in c.receivable || []" :key="b.currency">
        已收汇 {{ money(b.settledFen, b.currency) }} · 未收汇 {{ money(b.openFen, b.currency) }}
      </view>
    </view>
    <view class="muted" v-if="!list.length">暂无已录入客户。买方在询盘填写后，待案件到达合同/订单确认（N3）时自动录入或合并到已有档案。</view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, gradeClass, money, remittanceClass, remittanceText } from '../../api';
import RoleBar from '../../components/RoleBar.vue';

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

<style scoped>
.badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}
</style>
