<template>
  <view class="wrap">
    <RoleBar compact />
    <view class="h1" style="margin-bottom: 8rpx">{{ title }}</view>
    <view class="muted" style="margin-bottom: 16rpx">{{ hint }}</view>

    <view class="card" v-if="canCreate">
      <view class="h2">{{ kind === 'procurement' ? '新建采购合同' : '新建销售合同' }}</view>
      <view class="muted">{{ createHint }}</view>
      <view class="label">标题</view>
      <input class="input" v-model="draft.title" :placeholder="draftTitlePlaceholder" />
      <view class="label">金额（元）</view>
      <input class="input" type="digit" v-model="draft.amountYuan" placeholder="25000.00" />
      <view class="btn" :class="{ 'btn-ghost': creating }" @click="create">{{ createBtn }}</view>
    </view>

    <view class="choice-row" v-if="kind === 'sales'" style="margin-bottom: 20rpx">
      <view
        class="choice-btn"
        v-for="b in salesBuckets"
        :key="b.key"
        :class="{ 'choice-btn-on': focusGroup === b.key }"
        @click="focusGroup = b.key"
      >
        {{ b.label }} {{ b.items.length }}
      </view>
    </view>

    <template v-if="kind === 'sales'">
      <view class="muted" style="margin-bottom: 12rpx">{{ activeBucket.hint }}</view>
      <view class="card" v-for="c in activeBucket.items" :key="c.id" @click="open(c)">
        <view class="row">
          <view class="title-block" style="flex: 1; min-width: 0">
            <view class="muted">{{ primaryNo(c) }}</view>
            <view class="h2" style="margin: 6rpx 0 0; line-height: 1.4">{{ primaryTitle(c) }}</view>
          </view>
          <view class="badge" :class="badgeClass(c)">{{ badgeText(c) }}</view>
        </view>
        <view class="muted" style="margin-top: 8rpx">{{ secondary(c) }}</view>
        <view
          class="btn btn-ghost"
          v-if="nextOf(c)"
          @click.stop="openNext(c)"
        >{{ nextCtaLabel(c) }}</view>
      </view>
    </template>

    <template v-else>
      <view class="card" v-for="c in list" :key="c.id" @click="open(c)">
        <view class="row">
          <view class="title-block" style="flex: 1; min-width: 0">
            <view class="muted">{{ primaryNo(c) }}</view>
            <view class="h2" style="margin: 6rpx 0 0; line-height: 1.4">{{ primaryTitle(c) }}</view>
          </view>
          <view class="badge" :class="badgeClass(c)">{{ badgeText(c) }}</view>
        </view>
        <view class="muted" style="margin-top: 8rpx">{{ secondary(c) }}</view>
        <view class="muted" v-if="kind === 'procurement'" style="margin-top: 6rpx">{{ salesLine(c) }}</view>
        <view
          class="btn btn-ghost"
          v-if="nextOf(c)"
          @click.stop="openNext(c)"
        >{{ nextCtaLabel(c) }}</view>
      </view>
    </template>

    <view class="muted" v-if="!loaded">正在加载合同…</view>
    <view class="muted" v-else-if="kind === 'sales' && !activeBucket.items.length">暂无{{ activeBucket.label }}的销售合同</view>
    <view class="muted" v-else-if="kind !== 'sales' && !list.length">{{ empty }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import {
  api,
  decisionClass,
  decisionText,
  formNextNodeButtonLabel,
  goToNode,
  groupSalesListByShipment,
  isProcurementListCase,
  isSalesListCase,
  listShowsNextNodeButton,
  money,
  nextWorkNodeFromForm,
  procurementContractTitle,
  salesShipmentBadgeClass,
  salesShipmentBucketLabel,
  toastErr,
} from '../../api';
import {
  buildCreateCaseBody,
  canShowCreateContract,
  createFormPage,
  DEMO_CREATE,
} from '../../create-flow';
import RoleBar from '../../components/RoleBar.vue';
import { useDemoRole } from '../../role';

const kind = ref<'sales' | 'procurement' | ''>('');
const raw = ref<any[]>([]);
const loaded = ref(false);
const creating = ref(false);
const focusGroup = ref<'unshipped' | 'shipped' | 'completed'>('unshipped');
const { role, canWriteBusiness } = useDemoRole();
const draft = reactive({
  title: '',
  amountYuan: DEMO_CREATE.amountYuan,
});

const canCreate = computed(() => !!kind.value && canShowCreateContract(role.value) && canWriteBusiness.value);

const title = computed(() => (kind.value === 'procurement' ? '采购合同管理' : '销售合同管理'));
const hint = computed(() =>
  kind.value === 'procurement'
    ? '此处只列国内采购合同/备货（N5）。打开后填写采购合同；保存或推进前须从已签订的销售合同中任选一笔关联（不限于本案）。货款可选一次性付清或分期支付（分期须填约定付款时间、付款比例、金额）。装运、单证、报关、收汇属于出口案，不在本采购合同办理；采购完成后可点「去办装运（出口案）」跳转。'
    : '出口销售合同按未出运、已出运、已完成分组。已完成须已出运、客户已提货且收汇对账已回款。打开卡片仍填写销售合同（销售合同/订单确认）。国内采购订单不在本列表。本案已离开销售合同节点时，可点「进入下一节点」直达当前九节点步骤。',
);
const createHint = computed(() =>
  kind.value === 'procurement'
    ? '将创建采购案并打开采购合同页。保存前须从已签订的销售合同中任选一笔关联，系统不会自动带入。新案从询盘 KYC 起，过闸仍须按九节点推进。'
    : '将创建出口案并打开销售合同页。确认签订前须先完成询盘/客户 KYC 与报价（N1→N2）；保存销售合同还须登记中信保限额。买方按标题预填，付款人/收货人与买方相同。',
);
const draftTitlePlaceholder = computed(() =>
  kind.value === 'procurement' ? DEMO_CREATE.procurementTitle : DEMO_CREATE.salesTitle,
);
const createBtn = computed(() => {
  if (creating.value) return '正在创建…';
  return kind.value === 'procurement' ? '新建采购合同' : '新建销售合同';
});
const empty = computed(() =>
  kind.value === 'procurement'
    ? canCreate.value
      ? '暂无采购合同。可点上方新建，并在表单中关联一笔已签订的销售合同。已有停在采购节点的出口案也可直接打开补登。'
      : '暂无采购合同。请先完成销售合同签订，待案件到达国内采购/备货后再登记采购合同。'
    : canCreate.value
      ? '暂无销售合同。可点上方新建；询盘未通过的案件不会出现在本列表。'
      : '暂无销售合同。询盘未通过或尚未到达销售合同节点的案件不在此列。',
);

const list = computed(() => {
  if (kind.value === 'sales') return raw.value.filter(isSalesListCase);
  if (kind.value === 'procurement') return raw.value.filter(isProcurementListCase);
  return raw.value;
});

const salesBuckets = computed(() => groupSalesListByShipment(list.value));
const activeBucket = computed(
  () => salesBuckets.value.find((b) => b.key === focusGroup.value) || salesBuckets.value[0],
);

onLoad((q) => {
  if (q?.kind !== 'sales' && q?.kind !== 'procurement') {
    uni.redirectTo({ url: '/pages/case/hub' });
    return;
  }
  kind.value = q.kind;
  loaded.value = false;
  raw.value = [];
  draft.title = q.kind === 'procurement' ? DEMO_CREATE.procurementTitle : DEMO_CREATE.salesTitle;
  draft.amountYuan = DEMO_CREATE.amountYuan;
  if (q?.group === 'shipped' || q?.group === 'completed' || q?.group === 'unshipped') {
    focusGroup.value = q.group;
  }
  uni.setNavigationBarTitle({ title: title.value });
});

onShow(async () => {
  if (!kind.value) return;
  try {
    raw.value = await api.cases(kind.value || undefined);
  } catch {
    uni.showToast({ title: '无法加载合同，请先启动后端', icon: 'none' });
  } finally {
    loaded.value = true;
  }
});

async function create() {
  if (!kind.value || !canCreate.value || creating.value) return;
  creating.value = true;
  try {
    const created = await api.createCase(buildCreateCaseBody(kind.value, draft.title, draft.amountYuan));
    if (!created?.id) throw { message: '创建成功但未返回案件' };
    uni.navigateTo({ url: `${createFormPage(kind.value)}?id=${created.id}&fromCreate=1` });
  } catch (e) {
    toastErr(e);
  } finally {
    creating.value = false;
  }
}

function primaryNo(c: any) {
  if (kind.value === 'procurement') return c.poNo ? `采购合同 ${c.poNo}` : '采购合同待登记';
  return `销售合同 ${c.caseNo}`;
}

function primaryTitle(c: any) {
  if (kind.value === 'procurement') return c.procurementTitle || procurementContractTitle(c);
  return c.customer || c.title;
}

function secondary(c: any) {
  const node = c.currentNodeLabel || c.currentNode;
  const status = c.statusLabel || decisionText(c.status);
  const amt = money(c.contract?.amountFen ?? c.amountFen, c.contract?.currency || c.currency);
  if (kind.value === 'procurement') {
    const poAmt = money(c.procurementPlan?.amountFen ?? c.amountFen, c.procurementPlan?.currency || c.currency);
    return `${c.caseNo} · 采购合同/国内备货 · ${status} · ${poAmt}`;
  }
  const signed = c.signed ? '已签订' : '待签订';
  return `${c.goodsDesc || ''} · ${signed} · ${node} · ${amt}`.replace(/^ · /, '');
}

function salesLine(c: any) {
  const link = c.salesLink || c.procurementPlan?.salesLink;
  if (link?.customer || link?.contractNo) {
    return `关联销售合同：${link.customer || ''} · ${link.contractNo || link.caseNo || ''}`.trim();
  }
  return '尚未关联已签订的销售合同';
}

function badgeClass(c: any) {
  if (kind.value === 'sales') return salesShipmentBadgeClass(c);
  return decisionClass(c.status === 'BLOCKED' ? 'HARD_BLOCK' : c.overallRisk);
}

function badgeText(c: any) {
  if (kind.value === 'sales') return c.shipmentBucketLabel || salesShipmentBucketLabel(c);
  if (c.poNo) return decisionText(c.status);
  return '待登记';
}

function open(c: any) {
  const page = kind.value === 'procurement' ? '/pages/node/procurement' : '/pages/node/contract';
  uni.navigateTo({ url: `${page}?id=${c.id}` });
}

function formNode() {
  return kind.value === 'procurement' ? 'N5' : 'N3';
}

function nextOf(c: any) {
  if (!listShowsNextNodeButton(formNode(), c?.currentNode)) return null;
  return nextWorkNodeFromForm(formNode(), { currentNode: c.currentNode, changeOrders: c.changeOrders });
}

function nextCtaLabel(c: any) {
  return formNextNodeButtonLabel(formNode(), nextOf(c));
}

function openNext(c: any) {
  const t = nextOf(c);
  if (t) goToNode(c.id, t.code);
}
</script>
