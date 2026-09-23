<template>
  <view class="picker-panel" @click.stop>
    <BoundField :model="query" field="q" placeholder="筛选客户、合同号或品名" @click.stop />
    <view class="muted" style="margin-top: 8rpx">共 {{ filtered.length }} 笔可关联，点选即可更换，不锁定本案。</view>
    <WindowedList :items="filtered" key-field="id">
      <template #default="{ item: opt }">
        <view
          class="pick scroll-skip"
          :class="{ 'pick-on': selectedId === opt.id }"
          @click.stop="emit('pick', opt)"
        >
          <view class="row">
            <view>
              <view class="h2" style="margin: 0">{{ opt.customer }} · {{ opt.contractNo }}</view>
              <view class="muted" style="margin-top: 6rpx">{{ opt.goodsDesc }}</view>
            </view>
            <view>
              <view class="badge" :class="selectedId === opt.id ? 'badge-pass' : 'badge-stub'">
                {{ selectedId === opt.id ? '已选' : opt.isCurrent ? '本案出口' : opt.statusLabel }}
              </view>
            </view>
          </view>
          <view class="muted" style="margin-top: 8rpx">
            销售金额 {{ money(opt.amountFen, opt.currency) }}
            <text v-if="ymd(opt.deliveryDate)"> · 交货期 {{ ymd(opt.deliveryDate) }}</text>
            · {{ opt.currentNodeLabel }} · {{ opt.statusLabel }}
          </view>
        </view>
      </template>
    </WindowedList>
    <view class="muted" v-if="!filtered.length" style="margin-top: 12rpx">没有匹配的已签销售合同。</view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { money } from '../api';
import BoundField from './BoundField.vue';
import WindowedList from './WindowedList.vue';

const props = defineProps<{
  options: any[];
  selectedId?: string;
}>();
const emit = defineEmits<{ pick: [opt: any] }>();

const query = reactive({ q: '' });
const filtered = computed(() => {
  const q = query.q.trim().toLowerCase();
  const options = props.options || [];
  if (!q) return options;
  return options.filter((opt) =>
    [opt.customer, opt.contractNo, opt.caseNo, opt.goodsDesc, opt.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
});

function ymd(value?: string | Date | null) {
  return value ? String(value).slice(0, 10) : '';
}
</script>

<style scoped>
.pick {
  border: 2rpx solid #e8eef3;
  border-radius: 12rpx;
  padding: 16rpx;
  margin-top: 12rpx;
  background: #fbfaf7;
}
.pick-on {
  border-color: #0f3d2e;
  background: #e6efe9;
}
.picker-panel {
  border: 2rpx solid #0f3d2e;
  border-top: none;
  border-radius: 0 0 12rpx 12rpx;
  padding: 8rpx 16rpx 16rpx;
  background: #fff;
}
</style>
