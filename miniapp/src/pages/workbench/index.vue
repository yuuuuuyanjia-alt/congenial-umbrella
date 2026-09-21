<template>
  <view class="wrap">
    <view class="card">
      <view class="h2">审核工作台</view>
      <view class="choice-row" style="margin-top: 4rpx">
        <view
          class="choice-btn"
          :class="{ 'choice-btn-on': tab === 'occupancy' }"
          @click="tab = 'occupancy'"
        >
          额度审核 {{ occupancyQueue.length }}
        </view>
        <view
          class="choice-btn"
          :class="{ 'choice-btn-on': tab === 'sanctions' }"
          @click="tab = 'sanctions'"
        >
          制裁命中 {{ hitQueue.length }}
        </view>
      </view>
      <view class="muted" style="margin-top: 16rpx">{{ tabHint }}</view>
    </view>

    <template v-if="tab === 'occupancy'">
      <view class="card" v-for="h in occupancyQueue" :key="'occ-' + h.id">
        <view class="line-reason">{{ occupancyReason(h) }}</view>
        <view class="line-status">
          <text>当前状态：{{ occupancyStatus(h) }}</text>
          <view class="badge" :class="occupancyBadge(h.status)">{{ occupancyStatusBadge(h) }}</view>
        </view>
        <view class="line-actions">
          <view class="muted">可操作：{{ occupancyActionsHint(h) }}</view>
          <input class="input" v-model="comments[h.id]" placeholder="审核备注（可选）" />
          <view class="btn" v-if="h.status === 'OPEN' || h.status === 'REJECTED'" @click="actOccupancy(h, 'CLAIM')">领取</view>
          <view class="btn" v-if="h.status !== 'APPROVED'" @click="actOccupancy(h, 'APPROVE')">放行</view>
          <view class="btn btn-danger" v-if="h.status === 'OPEN' || h.status === 'CLAIMED'" @click="actOccupancy(h, 'REJECT')">驳回</view>
        </view>
      </view>
      <view class="card" v-if="loaded && !occupancyQueue.length">
        <view class="h2" style="margin: 0">暂无占用高风险待审</view>
        <view class="muted" style="margin-top: 8rpx">
          超高风险不进队（硬拦截），中风险不用审（软提示可推进）。仅占用属高风险时须在此领取、放行或驳回。
        </view>
      </view>
    </template>

    <template v-else>
      <view class="card" v-for="h in hitQueue" :key="'hit-' + h.id">
        <view class="line-reason">{{ hitReason(h) }}</view>
        <view class="line-status">
          <text>当前状态：{{ hitStatus(h) }}</text>
          <view class="badge" :class="decisionClass(h.riskLevel)">{{ hitStatus(h) }}</view>
        </view>
        <view class="line-actions">
          <view class="muted">可操作：误报排除 / 确认真实 / 补充信息 / 持续监控</view>
          <view class="btn btn-ghost" @click="actHit(h, 'FALSE_POSITIVE')">误报排除</view>
          <view class="btn btn-danger" @click="actHit(h, 'CONFIRM_TRUE')">确认真实</view>
          <view class="btn btn-warn" @click="actHit(h, 'SUPPLEMENT')">补充信息</view>
          <view class="btn" @click="actHit(h, 'MONITOR')">持续监控</view>
        </view>
      </view>
      <view class="card" v-if="loaded && !hitQueue.length">
        <view class="h2" style="margin: 0">暂无待处置的制裁命中</view>
        <view class="muted" style="margin-top: 8rpx">
          当前队列没有须工作台处置的制裁/不可靠实体命中。命中出现后可在此做误报排除、确认真实、补充信息或持续监控。
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api, decisionClass, decisionText, money, pipelineNodeName } from '../../api';

const tab = ref<'occupancy' | 'sanctions'>('occupancy');
const queue = ref<any[]>([]);
const loaded = ref(false);
const comments = reactive<Record<string, string>>({});

const LIST_LABEL: Record<string, string> = {
  OFAC: 'OFAC',
  UN: '联合国制裁清单',
  EU: '欧盟制裁清单',
  UK: '英国OFSI清单',
  CN_UNRELIABLE: '中国不可靠实体清单',
};
const CONF_LABEL: Record<string, string> = {
  HIGH: '高置信',
  MEDIUM: '中置信',
  LOW: '低置信',
};

onShow(load);
async function load() {
  try {
    queue.value = await api.queue();
  } catch {
    uni.showToast({ title: '无法加载审核队列', icon: 'none' });
    queue.value = [];
  } finally {
    loaded.value = true;
  }
}

/** 额度审核 ← queue.kind === OCCUPANCY_HIGH；制裁命中 ← SCREENING_HIT。同一 GET /workbench/queue。 */
function isOccupancyItem(h: any) {
  if (h?.kind === 'OCCUPANCY_HIGH') return true;
  if (h?.kind === 'SCREENING_HIT') return false;
  return !!(h?.band === 'HIGH' && h?.nodeCode && !h?.matchedName);
}
function isHitItem(h: any) {
  if (h?.kind === 'SCREENING_HIT') return true;
  if (h?.kind === 'OCCUPANCY_HIGH') return false;
  return !!h?.matchedName;
}

const occupancyQueue = computed(() => queue.value.filter(isOccupancyItem));
const hitQueue = computed(() => queue.value.filter(isHitItem));

const tabHint = computed(() =>
  tab.value === 'occupancy'
    ? '占用属高风险时须领取、放行或驳回。放行后业务可推进，驳回后仍阻断。超高风险不进队，中风险不用审。'
    : '筛查命中可做误报排除、确认真实、补充信息或持续监控。处置写入审计日志。',
);

function occupancyBadge(status?: string) {
  if (status === 'APPROVED') return 'badge-pass';
  if (status === 'REJECTED') return 'badge-block';
  if (status === 'CLAIMED') return 'badge-review';
  return 'badge-review';
}

function occupancyReason(h: any) {
  const caseNo = h.case?.caseNo || '未知案件';
  const node = `${h.nodeCode || ''} ${pipelineNodeName(h.nodeCode)}`.trim();
  return `${caseNo} · ${node}：超额 ${money(h.excessFen, h.currency)}（占用 ${money(h.occupancyFen, h.currency)} / 限额 ${money(h.insuredLimitFen, h.currency)}）`;
}

function occupancyStatusBadge(h: any) {
  return h.statusLabel || decisionText(h.status);
}

function occupancyStatus(h: any) {
  const label = occupancyStatusBadge(h);
  if (h.claimedBy?.name) return `${label}（领取人 ${h.claimedBy.name}）`;
  return label;
}

function occupancyActionsHint(h: any) {
  const parts: string[] = [];
  if (h.status === 'OPEN' || h.status === 'REJECTED') parts.push('领取');
  if (h.status !== 'APPROVED') parts.push('放行');
  if (h.status === 'OPEN' || h.status === 'CLAIMED') parts.push('驳回');
  return parts.join(' / ') || '无';
}

function hitReason(h: any) {
  const caseNo = h.case?.caseNo || '未知案件';
  const party =
    h.nodeCode === 'N5' || h.party?.role === 'SUPPLIER' ? '国内供应商' : '客户当事方';
  const list = LIST_LABEL[h.listCode] || h.listCode || '清单';
  const conf = CONF_LABEL[h.confidence] || h.confidence || '';
  const listed = h.listedName || h.matchedName || '未知条目';
  const matched = h.matchedName ? `，匹配 ${h.matchedName}` : '';
  const confBit = conf ? ` · ${conf}` : '';
  return `${caseNo} · ${party}命中 ${list}「${listed}」${matched}${confBit}`;
}

function hitStatus(h: any) {
  return decisionText(h.disposition);
}

async function actHit(h: any, action: string) {
  await api.workbench(h.caseId, { hitId: h.id, action, comment: `工作台处置 ${action}` });
  uni.showToast({ title: '已记录处置', icon: 'none' });
  await load();
}

async function actOccupancy(h: any, action: string) {
  const label = action === 'CLAIM' ? '已领取' : action === 'APPROVE' ? '已放行' : '已驳回';
  await api.workbench(h.caseId, {
    reviewId: h.reviewId || h.id,
    action,
    comment: comments[h.id] || `工作台${label}`,
  });
  uni.showToast({ title: label, icon: 'none' });
  await load();
}
</script>

<style scoped>
.line-reason {
  font-size: var(--font-md);
  font-weight: 650;
  color: #0f3d2e;
  line-height: 1.55;
}
.line-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 12rpx;
  font-size: var(--font-sm);
  color: #374151;
  line-height: 1.5;
}
.line-actions {
  margin-top: 8rpx;
}
</style>
