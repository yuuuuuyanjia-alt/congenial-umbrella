<template>
  <view class="wrap">
    <RoleBar compact @change="refreshRole" />
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
        <view
          class="choice-btn"
          :class="{ 'choice-btn-on': tab === 'tax' }"
          @click="tab = 'tax'"
        >
          退税·融资性审核 {{ taxQueue.length }}
        </view>
      </view>
      <view class="muted" style="margin-top: 16rpx">{{ tabHint }}</view>
      <view class="err" v-if="!canWriteWorkbench" style="margin-top: 12rpx">
        当前为{{ roleLabel }}，工作台只读。领取 / 放行 / 驳回与筛查处置仅风控岗可操作。
      </view>
    </view>

    <template v-if="tab === 'occupancy'">
      <WindowedList :items="occupancyQueue" key-field="id">
        <template #default="{ item: h }">
      <view class="card scroll-skip">
        <view class="line-reason">{{ occupancyReason(h) }}</view>
        <view class="line-status">
          <text>当前状态：{{ occupancyStatus(h) }}</text>
          <view class="badge" :class="occupancyBadge(h.status)">{{ occupancyStatusBadge(h) }}</view>
        </view>
        <view class="line-actions">
          <view class="muted">可操作：{{ occupancyActionsHint(h) }}</view>
          <BoundField v-if="canWriteWorkbench" :model="comments" :field="h.id" placeholder="审核备注（可选）" />
          <view class="btn" v-if="canWriteWorkbench && (h.status === 'OPEN' || h.status === 'REJECTED')" @click="actOccupancy(h, 'CLAIM')">领取</view>
          <view class="btn" v-if="canWriteWorkbench && h.status !== 'APPROVED'" @click="actOccupancy(h, 'APPROVE')">放行</view>
          <view class="btn btn-danger" v-if="canWriteWorkbench && (h.status === 'OPEN' || h.status === 'CLAIMED')" @click="actOccupancy(h, 'REJECT')">驳回</view>
        </view>
      </view>
        </template>
      </WindowedList>
      <view class="card" v-if="loaded && !occupancyQueue.length">
        <view class="h2" style="margin: 0">暂无占用高风险待审</view>
        <view class="muted" style="margin-top: 8rpx">
          超高风险不进队（硬拦截），中风险不用审（软提示可推进）。仅占用属高风险时须在此领取、放行或驳回。
        </view>
      </view>
    </template>

    <template v-else-if="tab === 'sanctions'">
      <WindowedList :items="hitQueue" key-field="id">
        <template #default="{ item: h }">
      <view class="card scroll-skip">
        <view class="line-reason">{{ hitReason(h) }}</view>
        <view class="line-status">
          <text>当前状态：{{ hitStatus(h) }}</text>
          <view class="badge" :class="decisionClass(h.riskLevel)">{{ hitStatus(h) }}</view>
        </view>
        <view class="line-actions">
          <view class="muted">可操作：{{ canWriteWorkbench ? '误报排除 / 确认真实 / 补充信息 / 持续监控' : '只读' }}</view>
          <view class="btn btn-ghost" v-if="canWriteWorkbench" @click="actHit(h, 'FALSE_POSITIVE')">误报排除</view>
          <view class="btn btn-danger" v-if="canWriteWorkbench" @click="actHit(h, 'CONFIRM_TRUE')">确认真实</view>
          <view class="btn btn-warn" v-if="canWriteWorkbench" @click="actHit(h, 'SUPPLEMENT')">补充信息</view>
          <view class="btn" v-if="canWriteWorkbench" @click="actHit(h, 'MONITOR')">持续监控</view>
        </view>
      </view>
        </template>
      </WindowedList>
      <view class="card" v-if="loaded && !hitQueue.length">
        <view class="h2" style="margin: 0">暂无待处置的制裁命中</view>
        <view class="muted" style="margin-top: 8rpx">
          当前队列没有须工作台处置的制裁/不可靠实体命中。命中出现后可在此做误报排除、确认真实、补充信息或持续监控。
        </view>
      </view>
    </template>

    <template v-else>
      <WindowedList :items="taxQueue" key-field="id">
        <template #default="{ item: h }">
      <view class="card scroll-skip">
        <view class="line-reason">{{ taxReason(h) }}</view>
        <view class="line-status">
          <text>当前状态：{{ taxStatus(h) }}</text>
          <view class="badge" :class="taxBadge(h)">{{ taxStatusBadge(h) }}</view>
        </view>
        <view class="line-actions">
          <view class="muted">{{ taxActionsHint(h) }}</view>
          <BoundField
            v-if="canWriteWorkbench && !h.readOnly"
            :model="comments"
            :field="h.id"
            placeholder="审核备注（可选）"
          />
          <view
            class="btn"
            v-if="canWriteWorkbench && !h.readOnly && (h.status === 'OPEN' || h.status === 'REJECTED')"
            @click="actTax(h, 'CLAIM')"
          >领取</view>
          <view
            class="btn"
            v-if="canWriteWorkbench && !h.readOnly && h.status !== 'APPROVED'"
            @click="actTax(h, 'APPROVE')"
          >通过</view>
          <view
            class="btn btn-danger"
            v-if="canWriteWorkbench && !h.readOnly && (h.status === 'OPEN' || h.status === 'CLAIMED')"
            @click="actTax(h, 'REJECT')"
          >驳回</view>
        </view>
      </view>
        </template>
      </WindowedList>
      <view class="card" v-if="loaded && !taxQueue.length">
        <view class="h2" style="margin: 0">暂无退税·融资性待审</view>
        <view class="muted" style="margin-top: 8rpx">
          黄灯（薄利+港口直出）在此领取、通过或驳回。红线假出口/空转硬拦截，只读展示。不与额度、制裁队列混列。
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { api, decisionClass, decisionText, money, pipelineNodeName } from '../../api';
import BoundField from '../../components/BoundField.vue';
import RoleBar from '../../components/RoleBar.vue';
import WindowedList from '../../components/WindowedList.vue';
import { demoActorLabel, useDemoRole } from '../../role';

const { canWriteWorkbench, roleLabel, refresh: refreshRole } = useDemoRole();

const tab = ref<'occupancy' | 'sanctions' | 'tax'>('occupancy');
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

onLoad((q) => {
  const name = String(q?.tab || '');
  if (name === 'occupancy' || name === 'sanctions' || name === 'tax') tab.value = name;
});
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

/** 额度审核 ← OCCUPANCY_HIGH；制裁命中 ← SCREENING_HIT；退税·融资性 ← TAX_FINANCE。三页不混列。 */
function isOccupancyItem(h: any) {
  if (h?.kind === 'OCCUPANCY_HIGH') return true;
  if (h?.kind === 'SCREENING_HIT' || h?.kind === 'TAX_FINANCE') return false;
  return !!(h?.band === 'HIGH' && h?.nodeCode && !h?.matchedName && h?.excessFen != null);
}
function isHitItem(h: any) {
  if (h?.kind === 'SCREENING_HIT') return true;
  if (h?.kind === 'OCCUPANCY_HIGH' || h?.kind === 'TAX_FINANCE') return false;
  return !!h?.matchedName;
}
function isTaxItem(h: any) {
  return h?.kind === 'TAX_FINANCE';
}

const occupancyQueue = computed(() => queue.value.filter(isOccupancyItem));
const hitQueue = computed(() => queue.value.filter(isHitItem));
const taxQueue = computed(() => queue.value.filter(isTaxItem));

const tabHint = computed(() => {
  if (tab.value === 'occupancy') {
    return '占用属高风险时须领取、放行或驳回。放行后业务可推进，驳回后仍阻断。超高风险不进队，中风险不用审。';
  }
  if (tab.value === 'sanctions') {
    return '筛查命中可做误报排除、确认真实、补充信息或持续监控。处置写入审计日志。';
  }
  return '黄灯：港口直出叠加薄利，须领取并通过。红线硬拦截只读。通过后可不经自有仓推进。';
});

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
  const claimant = demoActorLabel(h.claimedBy);
  if (claimant) return `${label}（领取人 ${claimant}）`;
  return label;
}

function occupancyActionsHint(h: any) {
  if (!canWriteWorkbench.value) return '只读';
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

function taxBadge(h: any) {
  if (h.status === 'HARD_BLOCKED' || h.band === 'RED') return 'badge-block';
  if (h.status === 'APPROVED') return 'badge-pass';
  if (h.status === 'REJECTED') return 'badge-block';
  return 'badge-review';
}

function taxReason(h: any) {
  const caseNo = h.case?.caseNo || '未知案件';
  const node = `${h.nodeCode || ''} ${pipelineNodeName(h.nodeCode)}`.trim();
  const summary = h.summary || h.reasonCode || '退税·融资性审核';
  return `${caseNo} · ${node}：${summary}`;
}

function taxStatusBadge(h: any) {
  return h.statusLabel || decisionText(h.status);
}

function taxStatus(h: any) {
  const label = taxStatusBadge(h);
  const claimant = demoActorLabel(h.claimedBy);
  if (claimant) return `${label}（领取人 ${claimant}）`;
  return label;
}

function taxActionsHint(h: any) {
  if (h.readOnly || h.status === 'HARD_BLOCKED') return '红线硬拦截，只读';
  if (!canWriteWorkbench.value) return '只读';
  const parts: string[] = [];
  if (h.status === 'OPEN' || h.status === 'REJECTED') parts.push('领取');
  if (h.status !== 'APPROVED') parts.push('通过');
  if (h.status === 'OPEN' || h.status === 'CLAIMED') parts.push('驳回');
  return `可操作：${parts.join(' / ') || '无'}`;
}

async function actTax(h: any, action: string) {
  const label = action === 'CLAIM' ? '已领取' : action === 'APPROVE' ? '已通过' : '已驳回';
  await api.workbench(h.caseId, {
    reviewId: h.reviewId || h.id,
    action,
    comment: comments[h.id] || `退税·融资性${label}`,
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
