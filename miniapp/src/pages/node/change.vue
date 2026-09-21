<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">变更管理</view>
      <view class="muted">交货期 / 数量 / 收货人 / 付款条件变更必须出变更单。客户确认 + 内部确认后生效。未生效变更会硬拦截采购（N5）及装运及后续节点（N6–N9）。进入本节点时须再次确认中信保：按变更后金额重算占用（未履行完毕未回款 + 已履行完毕未回款 + 本笔合同金额）。无变更单时可直接推进，无需重复登记中信保。</view>
      <view class="err" v-if="!canWriteBusiness" style="margin-top: 8rpx">当前为{{ roleLabel }}，本页只读，不可保存或推进。</view>
    </view>
    <view class="card">
      <view class="label">变更字段</view>
      <view class="chips">
        <view class="chip" :class="{ 'chip-on': form.field === f.key }" v-for="f in fields" :key="f.key" @click="form.field = f.key">{{ f.label }}</view>
      </view>
      <view class="label">新值</view>
      <input class="input" v-model="form.newValue" />
      <view class="label">原因</view>
      <input class="input" v-model="form.reason" />
      <view class="btn" v-if="canWriteBusiness" @click="create">创建变更单</view>
    </view>

    <view class="card" v-for="co in c.changeOrders || []" :key="co.id">
      <view class="row">
        <view class="h2" style="margin: 0">{{ co.changeNo }}</view>
        <view class="badge" :class="co.status === 'APPLIED' ? 'badge-pass' : 'badge-review'">{{ co.status }}</view>
      </view>
      <view class="muted">{{ co.reason }} {{ co.isSensitive ? '· 敏感' : '' }}</view>
      <view class="muted" v-for="d in co.diffs" :key="d.id">{{ d.fieldLabel }}：{{ d.oldValue }} → {{ d.newValue }}</view>
      <view class="muted">客户确认 {{ co.customerAckEvidenceId || '无' }} · 内部 {{ co.internalAckEvidenceId || '无' }}</view>
      <view class="label" v-if="co.status !== 'APPLIED'">客户确认编号</view>
      <input class="input" v-if="co.status !== 'APPLIED'" v-model="ackRef[co.id]" placeholder="邮件/函件编号" />
      <view class="btn btn-ghost" v-if="canWriteBusiness && !co.customerAck" @click="ack(co, 'CUSTOMER')">客户确认</view>
      <view class="btn btn-ghost" v-if="canWriteBusiness && !co.internalAck" @click="ack(co, 'INTERNAL')">内部确认</view>
      <view class="btn btn-warn" v-if="canWriteBusiness && co.isSensitive && !co.approved" @click="ack(co, 'APPROVAL')">敏感审批</view>
      <view class="btn" v-if="canWriteBusiness && co.status !== 'APPLIED' && co.status !== 'SUPERSEDED'" @click="apply(co)">应用新版本</view>
    </view>

    <view class="card" v-if="(c.changeOrders || []).length">
      <view class="h2">中信保（变更后核对）</view>
      <view class="muted">有变更单时须再次上传保单，或确认沿用当前保单，并按变更后合同金额重算买方占用。</view>
      <SinosureExposure :exposure="c.sinosureExposure" :show-new="true" />
      <view class="err" v-if="occupancyNeedsReview" style="margin-top: 12rpx">
        变更后占用属高风险，须由风控岗在审核工作台领取并放行后再推进，无需改金额。
      </view>
      <view class="ok" v-if="occupancyApproved" style="margin-top: 12rpx">工作台已放行该高风险占用，可以推进。</view>
      <view class="btn btn-ghost" v-if="canWriteWorkbench && (occupancyNeedsReview || occupancyRejected)" @click="goWorkbench">去审核工作台</view>
      <view class="muted" v-if="n3Hint">合同环节：{{ n3Hint }}</view>
      <view class="muted" v-if="n4Hint">本节点已登记：{{ n4Hint }}</view>
      <view class="label">处理方式</view>
      <view class="chips">
        <view class="chip" :class="{ 'chip-on': sino.mode === 'confirm' }" @click="sino.mode = 'confirm'">沿用当前保单</view>
        <view class="chip" :class="{ 'chip-on': sino.mode === 'reupload' }" @click="sino.mode = 'reupload'">重新上传保单</view>
      </view>
      <view v-if="sino.mode === 'reupload'">
        <view class="label">保单编号 / 附件编号</view>
        <input class="input" v-model="sino.evidenceRef" placeholder="可手填编号，或点下方模拟上传" />
        <view class="label">附件名称</view>
        <input class="input" v-model="sino.fileName" placeholder="如 中信保限额批注.pdf" />
        <view class="btn btn-ghost" v-if="canWriteBusiness" @click="stubUpload">模拟上传保单</view>
        <view class="label">投保限额</view>
        <input class="input" type="digit" v-model="sino.limitYuan" placeholder="须覆盖变更后合同金额" />
        <view class="label">限额币种</view>
        <input class="input" v-model="sino.currency" placeholder="须与合同一致" />
      </view>
      <view class="btn" v-if="canWriteBusiness" @click="saveSino">{{ sino.mode === 'confirm' ? '确认沿用并核对限额' : '保存中信保信息' }}</view>
    </view>

    <view class="card" v-for="v in c.contractVersions || []" :key="v.id">
      <view class="row">
        <view class="muted">合同版本 v{{ v.version }}</view>
        <view class="badge" :class="v.status === 'ACTIVE' ? 'badge-pass' : 'badge-stub'">{{ v.status }}</view>
      </view>
    </view>

    <view class="btn btn-ghost" v-if="canWriteBusiness" @click="tryAdvance">无待确认变更则推进 / 校验过闸</view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api, fenToYuan, latestSinosure, yuanToFen } from '../../api';
import SinosureExposure from '../../components/SinosureExposure.vue';
import { useDemoRole } from '../../role';

const id = ref('');
const { canWriteBusiness, canWriteWorkbench, roleLabel } = useDemoRole();
const c = ref<any>(null);
const err = ref('');
const ok = ref('');
const ackRef = reactive<Record<string, string>>({});
const fields = [
  { key: 'deliveryDate', label: '交货期' },
  { key: 'quantity', label: '数量' },
  { key: 'consigneeName', label: '收货人' },
  { key: 'paymentTerms', label: '付款条件' },
  { key: 'payerName', label: '付款人' },
  { key: 'buyerName', label: '买方' },
];
const form = reactive({ field: 'quantity', newValue: '12', reason: '客户追加' });
const sino = reactive({
  mode: 'confirm' as 'confirm' | 'reupload',
  evidenceRef: '',
  fileName: '',
  limitYuan: '',
  currency: 'USD',
});

const n3Hint = computed(() => formatPolicy(latestSinosure(c.value?.sinosurePolicies, 'N3')));
const n4Hint = computed(() => formatPolicy(latestSinosure(c.value?.sinosurePolicies, 'N4')));
const occupancyReview = computed(() => {
  const rows = (c.value?.occupancyReviews || []).filter(
    (r: any) => r.nodeCode === 'N4' && r.status !== 'SUPERSEDED',
  );
  return (
    rows.find((r: any) => r.status === 'APPROVED') ||
    rows.find((r: any) => r.status === 'REJECTED') ||
    rows[0]
  );
});
const occupancyNeedsReview = computed(() => {
  if (c.value?.sinosureExposure?.band !== 'HIGH') return false;
  const st = occupancyReview.value?.status;
  return !st || st === 'OPEN' || st === 'CLAIMED';
});
const occupancyApproved = computed(
  () => c.value?.sinosureExposure?.band === 'HIGH' && occupancyReview.value?.status === 'APPROVED',
);
const occupancyRejected = computed(
  () => c.value?.sinosureExposure?.band === 'HIGH' && occupancyReview.value?.status === 'REJECTED',
);
function goWorkbench() {
  uni.navigateTo({ url: '/pages/workbench/index' });
}

onLoad(async (q) => {
  id.value = q?.id || '';
  await reload();
});

onShow(async () => {
  if (!id.value) return;
  try {
    await reload();
  } catch {
    /* ignore */
  }
});

function formatPolicy(p: any) {
  if (!p) return '';
  return `限额 ${p.currency} ${fenToYuan(p.insuredLimitFen)} · ${p.fileName || p.evidenceRef || '已留存附件'}`;
}

async function reload() {
  c.value = await api.case(id.value);
  const n4 = latestSinosure(c.value.sinosurePolicies, 'N4');
  const n3 = latestSinosure(c.value.sinosurePolicies, 'N3');
  const src = n4 || n3;
  if (src) {
    sino.evidenceRef = src.evidenceRef || '';
    sino.fileName = src.fileName || '';
    sino.limitYuan = fenToYuan(src.insuredLimitFen);
    sino.currency = src.currency || c.value.currency || 'USD';
  } else {
    sino.currency = c.value.currency || 'USD';
  }
}

function stubUpload() {
  sino.evidenceRef = `SINOSURE-${Date.now()}`;
  sino.fileName = '中信保限额批注-模拟.pdf';
  ok.value = '已生成模拟保单附件编号（演示环境，非真实上传）';
}

async function create() {
  err.value = '';
  await api.createChange(id.value, {
    reason: form.reason,
    diffs: [{ field: form.field, newValue: form.newValue }],
  });
  ok.value = '变更单已创建（旧版本保留）';
  await reload();
}

async function ack(co: any, type: string) {
  err.value = '';
  await api.ackChange(id.value, co.id, { type, ref: ackRef[co.id] || `${type}-${co.changeNo}` });
  ok.value = `${co.changeNo} 已记录 ${type}`;
  await reload();
}

async function apply(co: any) {
  err.value = '';
  try {
    await api.applyChange(id.value, co.id);
    ok.value = `${co.changeNo} 已生效，合同新版本已生成`;
    await reload();
  } catch (e: any) {
    err.value = e?.message || '无法生效';
  }
}

async function saveSino() {
  err.value = '';
  const latestChange = [...(c.value.changeOrders || [])].reverse().find((x: any) => x.status !== 'SUPERSEDED');
  if (sino.mode === 'confirm') {
    await api.saveSinosureN4(id.value, {
      confirmedExisting: true,
      changeOrderId: latestChange?.id,
    });
    ok.value = '已确认沿用当前中信保保单，将按变更后金额核对限额';
  } else {
    if (!sino.evidenceRef && !sino.fileName) stubUpload();
    await api.saveSinosureN4(id.value, {
      evidenceRef: sino.evidenceRef,
      fileName: sino.fileName,
      insuredLimitFen: yuanToFen(sino.limitYuan),
      currency: sino.currency,
      changeOrderId: latestChange?.id,
      confirmedExisting: false,
    });
    ok.value = '中信保信息已按变更后要求保存';
  }
  await reload();
}

async function tryAdvance() {
  err.value = '';
  try {
    const r = await api.advance(id.value, 'N4');
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '闸门拒绝';
    if (Array.isArray(e?.missing) && e.missing.some((m: string) => String(m).includes('SINOSURE_EXPOSURE_HIGH'))) {
      err.value = `${err.value}。须由风控岗在审核工作台领取并放行，无需修改合同金额。`;
    }
  }
}
</script>
