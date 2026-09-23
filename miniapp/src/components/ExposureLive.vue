<script setup lang="ts">
import { computed } from 'vue';
import { previewExposure, yuanToFen } from '../api';
import SinosureExposure from './SinosureExposure.vue';

/**
 * Limit preview follows the contract amount. The read stays in this component
 * so each digit does not recompute the sales-contract page around it.
 */
const props = defineProps<{
  form: { amountYuan: string; currency: string };
  caseData: any;
  canWriteWorkbench?: boolean;
}>();
const emit = defineEmits<{ workbench: [] }>();

const exposureView = computed(() => {
  const base = props.caseData?.sinosureExposure;
  return previewExposure(base, yuanToFen(props.form.amountYuan), props.form.currency) || base;
});
const occupancyReview = computed(() => {
  const rows = (props.caseData?.occupancyReviews || []).filter(
    (row: any) => row.nodeCode === 'N3' && row.status !== 'SUPERSEDED',
  );
  return (
    rows.find((row: any) => row.status === 'APPROVED') ||
    rows.find((row: any) => row.status === 'REJECTED') ||
    rows[0]
  );
});
const occupancyNeedsReview = computed(() => {
  if (exposureView.value?.band !== 'HIGH') return false;
  const status = occupancyReview.value?.status;
  return !status || status === 'OPEN' || status === 'CLAIMED';
});
const occupancyApproved = computed(
  () => exposureView.value?.band === 'HIGH' && occupancyReview.value?.status === 'APPROVED',
);
const occupancyRejected = computed(
  () => exposureView.value?.band === 'HIGH' && occupancyReview.value?.status === 'REJECTED',
);
</script>

<template>
  <view class="exposure-live">
    <SinosureExposure :exposure="exposureView" :show-new="true" />
    <view class="err" v-if="occupancyNeedsReview" style="margin-top: 12rpx">
      占用属高风险，须由风控岗在审核工作台领取并放行后再推进，无需修改合同金额。
    </view>
    <view class="ok" v-if="occupancyApproved" style="margin-top: 12rpx">工作台已放行该高风险占用，可以推进。</view>
    <view class="err" v-if="occupancyRejected" style="margin-top: 12rpx">工作台已驳回该高风险占用，暂不可推进。</view>
    <view
      class="btn btn-ghost"
      v-if="canWriteWorkbench && (occupancyNeedsReview || occupancyRejected)"
      @click="emit('workbench')"
    >去审核工作台</view>
  </view>
</template>

<style>
.exposure-live {
  display: contents;
}
</style>
