<template>
  <view class="card">
    <view class="row">
      <view class="h2" style="margin: 0">{{ compact ? '当前角色' : '演示角色' }}</view>
      <view class="badge badge-pass" v-if="current">{{ current.name }} · {{ labelOf(current.role) }}</view>
    </view>
    <view class="muted" style="margin-top: 8rpx">{{ hint }}</view>
    <view class="choice-row" style="margin-top: 16rpx">
      <view
        class="choice-btn"
        :class="{ 'choice-btn-on': current && current.id === u.id }"
        v-for="u in users"
        :key="u.id"
        @click="pick(u)"
      >
        {{ u.name }}
        <view class="muted" style="margin-top: 6rpx; color: inherit">{{ labelOf(u.role) }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '../api';
import {
  demoSession,
  ensureDemoUser,
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

const hint = computed(() => {
  if (props.compact) return '同一套页面。切换后按钮与写权限立即按角色生效。';
  return '三个演示账号共用同一首页与路由，仅菜单顺序和写按钮不同。业务岗可录入并推进；风控可审核工作台；主管只读。';
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

function pick(u: DemoUser) {
  persistDemoUser(u);
  emit('change', u);
  uni.showToast({ title: `已切换为${u.name}（${labelOf(u.role)}）`, icon: 'none' });
}
</script>
