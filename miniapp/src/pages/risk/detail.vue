<template>
  <view class="wrap" v-if="detail">
    <view class="card">
      <view class="row">
        <view class="h2" style="margin: 0">{{ detail.subjectLabel }}</view>
        <view class="badge" :class="colorClass(detail.color)">{{ detail.colorLabel }}</view>
      </view>
      <view class="muted" style="margin-top: 8rpx">
        {{ detail.typeLabel }} · {{ detail.statusLabel }} · {{ shortTime(detail.firstSeenAt) }}
      </view>
      <view class="err" v-if="detail.processingByOther">
        {{ detail.processingBy?.name || '其他人' }}正在处理这条风险
      </view>
      <view class="muted" v-else-if="detail.processingBy">{{ detail.processingBy.name }}处理中</view>
    </view>

    <view class="card">
      <view class="h2">踩了哪几条线</view>
      <view class="line" v-for="(line, i) in detail.lines || []" :key="line.code + i">{{ line.text }}</view>
      <view class="muted" v-if="!(detail.lines || []).length">没有结构化踩线记录。</view>
    </view>

    <view class="card" v-if="(detail.supplements || []).length">
      <view class="h2">补件清单</view>
      <view class="line" v-for="task in detail.supplements" :key="task.id">
        <view>{{ task.content }}</view>
        <view class="muted">截止 {{ shortDay(task.dueAt) }} · {{ task.statusLabel }}<text v-if="task.fileName"> · {{ task.fileName }}</text></view>
        <view class="btn btn-ghost" v-if="task.status === 'SUBMITTED' && !detail.processingByOther" @click="accept(task.id)">复核通过</view>
      </view>
      <view class="btn btn-ghost" v-if="detail.sampleEnabled" @click="expire">演示：把补件截止日改为昨天</view>
    </view>

    <view class="card" v-if="canAct">
      <view class="h2">处置</view>
      <view class="muted" v-if="detail.color === 'RED'">红色风险只能驳回。</view>
      <view class="label">理由</view>
      <BoundField :model="form" field="reason" placeholder="请填写处置理由" />
      <template v-if="canConditional">
        <view class="label">补件截止日</view>
        <BoundField :model="form" field="dueAt" placeholder="YYYY-MM-DD，默认 7 天" />
        <view class="muted">有条件放行只改风险状态并生成补件，不会自动放开闸门。</view>
        <view class="btn" @click="submit('CONDITIONAL_RELEASE')">有条件放行</view>
      </template>
      <view class="btn" v-if="canResolve" @click="submit('RESOLVED')">已解决</view>
      <view class="btn btn-danger" @click="submit('REJECTED')">驳回</view>
      <view class="err" v-if="error">{{ error }}</view>
    </view>

    <view class="card" v-if="detail.workbenchTab">
      <view class="muted">额度放行和命中处置仍走原来的审核工作台，这里不会改闸门。</view>
      <view class="btn btn-ghost" @click="goWorkbench">
        {{ detail.workbenchTab === 'occupancy' ? '去额度审核' : '去命中处置' }}
      </view>
    </view>

    <view class="card" v-if="(detail.actions || []).length">
      <view class="h2">处置记录</view>
      <view class="line" v-for="action in detail.actions" :key="action.id">
        <view>{{ action.conclusionLabel }} · {{ action.actorName || '未知' }} · {{ shortTime(action.createdAt) }}</view>
        <view class="muted">{{ action.reason }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { api } from '../../api';
import BoundField from '../../components/BoundField.vue';

const id = ref('');
const detail = ref<any>(null);
const error = ref('');
const form = reactive({ reason: '', dueAt: plusDays(7) });

const canConditional = computed(() => {
  const color = detail.value?.color;
  return color === 'ORANGE' || color === 'YELLOW';
});
const canResolve = computed(() => detail.value?.color !== 'RED');
const canAct = computed(() => {
  if (!detail.value || detail.value.processingByOther) return false;
  return detail.value.status === 'PENDING' || detail.value.status === 'CONDITIONAL_RELEASE';
});

function plusDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function colorClass(color?: string) {
  if (color === 'RED') return 'badge-block';
  if (color === 'ORANGE') return 'badge-review';
  if (color === 'YELLOW') return 'badge-soft';
  return 'badge-stub';
}

function shortTime(value?: string | null) {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 16);
}

function shortDay(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function errText(e: any) {
  const message = e?.message;
  if (Array.isArray(message)) return message.join('；');
  return message || '操作失败';
}

async function load() {
  if (!id.value) return;
  error.value = '';
  try {
    detail.value = await api.riskOpen(id.value);
  } catch (e: any) {
    error.value = errText(e);
    uni.showToast({ title: error.value, icon: 'none' });
  }
}

async function submit(conclusion: string) {
  error.value = '';
  try {
    detail.value = await api.riskAct(id.value, {
      conclusion,
      reason: form.reason,
      dueAt: form.dueAt,
    });
    form.reason = '';
    uni.showToast({ title: '已记录处置', icon: 'none' });
  } catch (e: any) {
    error.value = errText(e);
  }
}

async function expire() {
  error.value = '';
  try {
    await api.riskExpire(id.value);
    uni.showToast({ title: '截止日已改为昨天，请回雷达点刷新', icon: 'none' });
  } catch (e: any) {
    error.value = errText(e);
  }
}

async function accept(taskId: string) {
  error.value = '';
  try {
    await api.riskAcceptSupplement(taskId);
    await load();
  } catch (e: any) {
    error.value = errText(e);
  }
}

function goWorkbench() {
  const tab = detail.value?.workbenchTab;
  if (!tab) return;
  uni.navigateTo({ url: `/pages/workbench/index?tab=${tab}` });
}

onLoad((q) => {
  id.value = String(q?.id || '');
});
onShow(load);
</script>

<style scoped>
.line {
  margin-top: 12rpx;
}
</style>
