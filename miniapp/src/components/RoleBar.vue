<template>
  <view class="card">
    <view class="row">
      <view class="h2" style="margin: 0" @click="onCaptionTap">{{ caption }}</view>
    </view>
    <view class="muted" style="margin-top: 8rpx" v-if="hint">{{ hint }}</view>
    <view class="choice-row" style="margin-top: 16rpx" v-if="pickerOpen">
      <view
        class="choice-btn"
        :class="{ 'choice-btn-on': current && current.id === u.id }"
        v-for="u in users"
        :key="u.id"
        @click="pick(u)"
      >
        {{ labelOf(u.role) }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '../api';
import {
  closeDebugRolePicker,
  currentRoleCaption,
  debugRolePickerOpen,
  demoSession,
  ensureDemoUser,
  noteDebugUnlockTap,
  persistDemoUser,
  roleLabelOf,
  type DemoUser,
} from '../role';

const props = withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  { compact: false },
);

const emit = defineEmits<{ change: [user: DemoUser] }>();

const users = ref<DemoUser[]>([]);
const current = computed(() => demoSession.value);
const pickerOpen = computed(() => debugRolePickerOpen.value);
const caption = computed(() => currentRoleCaption(current.value?.role));

const hint = computed(() => {
  if (pickerOpen.value) return '仅供演示/QA 切换岗位。正式使用按登录账号一人一岗，日常不展示三选一。';
  if (props.compact) return '';
  const role = current.value?.role;
  if (role === 'RISK') return '本岗处理审核工作台领取、放行与筛查处置。';
  if (role === 'MANAGER') return '本岗只读：客户评估、合同与占用。';
  return '本岗可录入客户、销售、采购并推进业务节点。';
});

onShow(async () => {
  try {
    users.value = await api.users();
    await ensureDemoUser();
  } catch {
    users.value = [];
  }
});

function labelOf(role?: string) {
  return roleLabelOf(role);
}

function onCaptionTap() {
  noteDebugUnlockTap();
}

function pick(u: DemoUser) {
  persistDemoUser(u);
  closeDebugRolePicker();
  emit('change', u);
  uni.showToast({ title: `已切换为${labelOf(u.role)}`, icon: 'none' });
}
</script>
