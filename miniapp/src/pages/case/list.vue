<template>
  <view class="wrap">
    <RoleBar compact />
    <view class="h1" style="margin-bottom: 8rpx">{{ title }}</view>
    <view class="muted" style="margin-bottom: 16rpx">{{ hint }}</view>

    <view class="card" v-if="canCreate && kind === 'sales'">
      <view class="h2">新建销售合同</view>
      <view class="muted">将创建出口案并打开报价。请先完成报价，再在销售合同填写买方、收货人并完成筛查。不能跳过报价。</view>
      <view class="label">标题</view>
      <input class="input" v-model="draft.title" :placeholder="DEMO_CREATE.salesTitle" />
      <view class="label">金额</view>
      <input class="input" type="digit" v-model="draft.amountYuan" placeholder="25000.00" />
      <view class="label">币种</view>
      <view class="readonly">USD</view>
      <view class="muted">演示新建默认美元。签订销售合同时可选 CNY / USD。</view>
      <view class="btn" :class="{ 'btn-ghost': creating }" @click="createSales">{{ creating ? '正在创建…' : '新建销售合同' }}</view>
    </view>

    <view class="card" v-if="canCreate && kind === 'procurement'">
      <view class="h2">新建采购合同</view>
      <view class="muted">请选择一笔已签订的销售合同，打开该案的采购合同（N5）。已有采购合同则进入编辑。不会新建没有销售合同的案件；保存仍须带上该销售合同关联。</view>
      <view class="muted" v-if="!signedSales.length" style="margin-top: 8rpx">暂无已签订的销售合同。请先完成销售合同签订。</view>
      <view
        class="card scroll-skip"
        style="box-shadow: none; border: 2rpx solid #c5d4cb; margin-bottom: 12rpx; margin-top: 12rpx"
        :style="pickedSalesId === opt.id ? 'border-color: #0f3d2e' : ''"
        v-for="opt in signedSales"
        :key="opt.id"
        v-memo="[opt.id, pickedSalesId === opt.id, opt.customer, opt.title, opt.caseNo, opt.goodsDesc, opt.poNo, opt.statusLabel]"
        @click="pickedSalesId = opt.id"
      >
        <view class="row">
          <view style="flex: 1; min-width: 0">
            <view class="h2" style="margin: 0">{{ opt.customer || opt.title }} · {{ opt.caseNo }}</view>
            <view class="muted" style="margin-top: 6rpx">
              {{ opt.goodsDesc || '' }} · {{ money(opt.contract?.amountFen ?? opt.amountFen, opt.contract?.currency || opt.currency) }}
              · {{ opt.poNo || opt.procurementPlan ? '已有采购合同，将进入编辑' : '待登记采购合同' }}
            </view>
          </view>
          <view class="badge" :class="pickedSalesId === opt.id ? 'badge-pass' : 'badge-stub'">
            {{ pickedSalesId === opt.id ? '已选' : opt.statusLabel || '已签订' }}
          </view>
        </view>
      </view>
      <view class="btn" :class="{ 'btn-ghost': !pickedSalesId }" @click="openPickedProcurement">
        {{ pickedSalesBtn }}
      </view>
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
      <view
        class="card scroll-skip"
        v-for="c in activeBucket.items"
        :key="c.id"
        v-memo="[c.id, c.caseNo, c.customer, c.title, c.currentNode, c.status, c.signed, c.goodsDesc, c.amountFen, c.contract && c.contract.amountFen, nextOf(c) && nextOf(c).code]"
        @click="open(c)"
      >
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
      <view
        class="card scroll-skip"
        v-for="c in list"
        :key="c.id"
        v-memo="[c.id, c.caseNo, c.poNo, c.procurementTitle, c.currentNode, c.status, c.amountFen, c.procurementPlan && c.procurementPlan.amountFen, c.salesLink && c.salesLink.contractNo, nextOf(c) && nextOf(c).code]"
        @click="open(c)"
      >
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
  DEMO_CREATE,
  procurementOpenUrl,
  salesCreateLandingPage,
  signedSalesPicks,
} from '../../create-flow';
import RoleBar from '../../components/RoleBar.vue';
import { useDemoRole } from '../../role';

const kind = ref<'sales' | 'procurement' | ''>('');
const raw = ref<any[]>([]);
const loaded = ref(false);
const creating = ref(false);
const pickedSalesId = ref('');
const signedSales = ref<any[]>([]);
const focusGroup = ref<'unshipped' | 'shipped' | 'completed'>('unshipped');
const { role, canWriteBusiness } = useDemoRole();
const draft = reactive({
  title: DEMO_CREATE.salesTitle,
  amountYuan: DEMO_CREATE.amountYuan,
});

const canCreate = computed(() => !!kind.value && canShowCreateContract(role.value) && canWriteBusiness.value);

const title = computed(() => (kind.value === 'procurement' ? '采购合同管理' : '销售合同管理'));
const hint = computed(() =>
  kind.value === 'procurement'
    ? '此处只列国内采购合同/备货（N5）。打开后填写采购合同；保存或推进前须从已签订的销售合同中任选一笔关联（不限于本案）。货款可选一次性付清或分期支付（分期须填约定付款时间、付款比例、金额）。装运、单证、收汇属于出口案，不在本采购合同办理；采购完成后可点「去办装运（出口案）」跳转。'
    : '出口销售合同按未出运、已出运、已完成分组。已完成须已出运、客户已提货且收汇对账已回款。打开卡片仍填写销售合同（销售合同/订单确认）。国内采购订单不在本列表。本案已离开销售合同节点时，可点「进入下一节点」。下一步若是装运，会先进入出运批次选择（选择已有批次或新建），再打开该批次的装运。',
);
const pickedSalesBtn = computed(() => {
  const hit = signedSales.value.find((c) => c.id === pickedSalesId.value);
  if (!hit) return '请先选择已签订的销售合同';
  return hit.poNo || hit.procurementPlan ? '编辑该案采购合同' : '打开该案采购合同';
});
const empty = computed(() =>
  kind.value === 'procurement'
    ? canCreate.value
      ? '暂无采购合同。请点上方选择一笔已签订的销售合同办理采购。'
      : '暂无采购合同。请先完成销售合同签订，待案件到达国内采购/备货后再登记采购合同。'
    : canCreate.value
      ? '暂无销售合同。可点上方新建；新案从报价起，到达销售合同后才会出现在本列表。'
      : '暂无销售合同。尚未到达销售合同节点的案件不在此列。',
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
  draft.title = DEMO_CREATE.salesTitle;
  draft.amountYuan = DEMO_CREATE.amountYuan;
  pickedSalesId.value = '';
  if (q?.group === 'shipped' || q?.group === 'completed' || q?.group === 'unshipped') {
    focusGroup.value = q.group;
  }
  uni.setNavigationBarTitle({ title: title.value });
});

onShow(async () => {
  if (!kind.value) return;
  try {
    raw.value = await api.cases(kind.value || undefined);
    if (kind.value === 'procurement' && canCreate.value) {
      const sales = await api.cases('sales');
      signedSales.value = signedSalesPicks(sales);
      if (!pickedSalesId.value && signedSales.value.length) {
        const wip = signedSales.value.find((c) => !c.poNo && !c.procurementPlan);
        pickedSalesId.value = (wip || signedSales.value[0]).id;
      }
    }
  } catch {
    uni.showToast({ title: '无法加载合同，请先启动后端', icon: 'none' });
  } finally {
    loaded.value = true;
  }
});

async function createSales() {
  if (kind.value !== 'sales' || !canCreate.value || creating.value) return;
  creating.value = true;
  try {
    const created = await api.createCase(buildCreateCaseBody(draft.title, draft.amountYuan));
    if (!created?.id) throw { message: '创建成功但未返回案件' };
    uni.navigateTo({ url: salesCreateLandingPage(created.id) });
  } catch (e) {
    toastErr(e);
  } finally {
    creating.value = false;
  }
}

function openPickedProcurement() {
  if (!pickedSalesId.value) {
    uni.showToast({ title: '请先选择已签订的销售合同', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: procurementOpenUrl(pickedSalesId.value) });
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
