<template>
  <view class="wrap">
    <view class="hero card">
      <view class="eyebrow">国有企业 · 跨境出口</view>
      <view class="h1">贸易风险管控</view>
      <view class="muted" style="margin-top: 12rpx">
        筛查嵌在报价→销售合同→变更→采购合同/国内备货→装运→单证→收汇业务流中，无需单独登录筛查系统。买方筛查在销售合同办理。销售合同与采购合同分开签订，惯例先销售后采购。高风险硬拦截，中风险进审核队列，低风险软提示不阻断。全链路审计留痕。
      </view>
    </view>

    <RoleBar @change="onRoleChange" />

    <view class="card">
      <view class="h2">工作入口</view>
      <view class="muted">{{ entryHint }}</view>
      <template v-for="(block, i) in entryBlocks" :key="i + '-' + block.items[0].url">
        <view class="choice-row" :class="{ 'lane-row': block.items.length > 2 }" v-if="block.type === 'pair'" style="margin-top: 16rpx">
          <view class="choice-btn" v-for="e in block.items" :key="e.url" @click="go(e.url)">{{ e.label }}</view>
        </view>
        <view class="btn" v-else @click="go(block.items[0].url)">{{ block.items[0].label }}</view>
      </template>
    </view>

    <view class="debug-footer">
      <view class="debug-version" @click="onVersionTap">v{{ appVersion }}</view>
      <view class="debug-link" @click="onDebugSwitch">切换演示角色</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import RoleBar from '../../components/RoleBar.vue';
import {
  APP_VERSION,
  demoSession,
  homeEntryBlocks,
  noteDebugUnlockTap,
  roleLabelOf,
  toggleDebugRolePicker,
  useDemoRole,
} from '../../role';

const { role } = useDemoRole();
const appVersion = APP_VERSION;
const entryBlocks = computed(() => homeEntryBlocks(role.value));
const entryHint = computed(() => {
  if (role.value === 'RISK') return '本岗默认先进入审核工作台；销售/采购合同、出运、单证、收汇与费用管理也可进入。';
  if (role.value === 'MANAGER') return '本岗只读：先看客户评估与合同列表。出运、单证、收汇与费用管理可查看，不可保存。';
  return '本岗可新建并录入销售合同、采购合同，并从出运管理、单证管理、收汇管理办理装运、单证与收汇，在费用管理登记合同费用。收汇先选销售合同：没有批次时先去出运，合同级前 T/T 仍可登记；有批次则进入该批收汇。';
});
function syncNavTitle() {
  uni.setNavigationBarTitle({
    title: demoSession.value ? `出口风控 · ${roleLabelOf(demoSession.value.role)}` : '出口风控',
  });
}
function onRoleChange() {
  role.value = demoSession.value?.role || role.value;
  syncNavTitle();
}
function onVersionTap() {
  noteDebugUnlockTap();
}
function onDebugSwitch() {
  toggleDebugRolePicker();
}

onMounted(() => {
  syncNavTitle();
});

function go(url: string) {
  uni.navigateTo({ url });
}
</script>

<style scoped>
.hero {
  background: linear-gradient(135deg, #0a2e22 0%, #165a40 70%, #8c6b1f 140%);
}
.hero .h1,
.hero .eyebrow,
.hero .muted {
  color: #f8f4ea;
}
.eyebrow {
  letter-spacing: 4rpx;
  font-size: var(--font-xs);
  opacity: 0.85;
  margin-bottom: 8rpx;
}
.debug-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 8rpx 8rpx;
  margin-top: 8rpx;
}
.debug-version,
.debug-link {
  color: #9ca3af;
  font-size: var(--font-xs);
}
.debug-link {
  text-decoration: underline;
}
.lane-row .choice-btn {
  min-width: 0;
  padding: 20rpx 8rpx;
  font-size: var(--font-sm);
  line-height: 1.25;
}
</style>
