<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">我的风险和补件</view>
      <view class="muted">只列出自己案件的风险标题和补件。制裁命中明细不在这里展示。补件上传后由风控或主管复核，通过后可以把风险标为已解决。</view>
    </view>
    <view class="err" v-if="error">{{ error }}</view>
    <WindowedList :items="items" key-field="id">
      <template #default="{ item }">
        <view class="card scroll-skip">
          <view class="row">
            <view>
              <view class="h2" style="margin: 0">{{ item.title }}</view>
              <view class="muted">{{ item.caseNo }} · {{ item.typeLabel }} · {{ item.statusLabel }}</view>
            </view>
            <view class="badge" :class="colorClass(item.color)">{{ item.colorLabel }}</view>
          </view>
          <view v-if="!(item.supplements || []).length" class="muted" style="margin-top: 12rpx">还没有补件任务。</view>
          <view class="task" v-for="task in item.supplements || []" :key="task.id">
            <view>{{ task.content }}</view>
            <view class="muted">截止 {{ shortDay(task.dueAt) }} · {{ task.statusLabel }}<text v-if="task.fileName"> · {{ task.fileName }}</text></view>
            <view class="btn" v-if="task.status === 'OPEN'" @click="pick(task.id)">上传补件</view>
          </view>
        </view>
      </template>
    </WindowedList>
    <view class="card" v-if="loaded && !items.length">
      <view class="muted">当前没有挂在你名下的风险或补件。</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api, uploadSupplementFile } from '../../api';
import WindowedList from '../../components/WindowedList.vue';

const items = ref<any[]>([]);
const loaded = ref(false);
const error = ref('');

function colorClass(color?: string) {
  if (color === 'RED') return 'badge-block';
  if (color === 'ORANGE') return 'badge-review';
  if (color === 'YELLOW') return 'badge-soft';
  return 'badge-stub';
}

function shortDay(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function errText(e: any) {
  const message = e?.message;
  if (Array.isArray(message)) return message.join('；');
  return message || '加载失败';
}

async function load() {
  error.value = '';
  try {
    const data = await api.riskMine();
    items.value = data.items || [];
  } catch (e: any) {
    items.value = [];
    error.value = errText(e);
  } finally {
    loaded.value = true;
  }
}

function pick(taskId: string) {
  if (typeof document === 'undefined') {
    uni.showToast({ title: '请在 H5 演示里上传补件', icon: 'none' });
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await uploadSupplementFile(taskId, file, file.name);
      uni.showToast({ title: '已上传，等待复核', icon: 'none' });
      await load();
    } catch (e: any) {
      error.value = errText(e);
    }
  };
  input.click();
}

onShow(load);
</script>

<style scoped>
.task {
  margin-top: 16rpx;
  padding-top: 12rpx;
  border-top: 2rpx solid #efeae0;
}
</style>
