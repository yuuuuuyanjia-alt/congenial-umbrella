<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h1">{{ c.name }}</view>
      <view class="muted" style="margin-top: 8rpx">
        {{ c.country || '国家未填' }}{{ c.address ? ' · ' + c.address : '' }}
      </view>
      <view class="muted" style="margin-top: 8rpx">
        仅展示已到达合同确认（N3）的案件；同一客户的多笔订单已合并到本档案。
      </view>
      <view class="chips">
        <view class="badge" :class="gradeClass(evalOf.suggestedGrade)">建议级别 {{ evalOf.suggestedGrade || '—' }}</view>
        <view class="badge" :class="remittanceClass(c.collection?.code)">
          约定收款日 {{ remittanceText(c.collection?.code) }}
        </view>
        <view class="chip">{{ c.contractCount || 0 }} 份合同</view>
      </view>
    </view>

    <view class="card" v-if="evalOf">
      <view class="row">
        <view class="h2" style="margin: 0">客户评估</view>
        <view class="badge" :class="gradeClass(evalOf.suggestedGrade)">建议级别 {{ evalOf.suggestedGrade || '—' }}</view>
      </view>
      <view class="muted" style="margin-top: 8rpx">内部经营口径（价值 50 / 风险 30 / 资信 20），不是中信保官方评级。建议级别仅供参考，本版不可人工改档。</view>
      <view class="row" style="margin-top: 16rpx">
        <view class="stat">
          <view class="stat-n">{{ evalOf.scores?.value ?? '—' }}</view>
          <view class="muted">价值 / 50</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ evalOf.scores?.risk ?? '—' }}</view>
          <view class="muted">风险 / 30</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ evalOf.scores?.credit ?? '—' }}</view>
          <view class="muted">资信 / 20</view>
        </view>
      </view>
      <view class="muted" style="margin-top: 8rpx; text-align: center">总分 {{ evalOf.scores?.total ?? '—' }}</view>
      <view class="chips" v-if="(evalOf.tags || []).length">
        <view class="chip" v-for="t in evalOf.tags" :key="t">{{ t }}</view>
      </view>
      <view class="h2" style="margin-top: 20rpx">毛利</view>
      <view class="row line">
        <view class="muted">销售额</view>
        <view>{{ money(evalOf.profit?.salesFen, 'USD') }}</view>
      </view>
      <view class="row line">
        <view class="muted">采购成本</view>
        <view>{{ evalOf.profit?.costMissing ? (evalOf.profit?.label || '毛利估算/暂缺') : evalOf.profit?.costFen == null ? '—' : money(evalOf.profit?.costFen, 'USD') }}</view>
      </view>
      <view class="row line">
        <view class="muted">毛利</view>
        <view>{{ evalOf.profit?.costMissing ? '毛利估算/暂缺' : evalOf.profit?.grossFen == null ? '—' : money(evalOf.profit?.grossFen, 'USD') }}</view>
      </view>
      <view class="row line">
        <view class="muted">毛利率</view>
        <view>{{ evalOf.profit?.costMissing || evalOf.profit?.marginPct == null ? '暂缺' : evalOf.profit.marginPct + '%' }}</view>
      </view>
      <view class="h2" style="margin-top: 20rpx">回款</view>
      <view class="muted">以 N9 水单/到账为唯一事实源，与约定收款日统计一致。</view>
      <view class="row line">
        <view class="muted">按期率</view>
        <view>{{ pctText(evalOf.remittance?.onTimeRate) }}</view>
      </view>
      <view class="row line">
        <view class="muted">未收汇</view>
        <view>{{ money(evalOf.remittance?.unpaidFen, 'USD') }}</view>
      </view>
      <view class="row line" v-if="evalOf.remittance?.over60Fen">
        <view class="muted">超 60 天应收</view>
        <view>{{ money(evalOf.remittance.over60Fen, 'USD') }}</view>
      </view>
      <view class="row line" v-if="evalOf.remittance?.over90Fen">
        <view class="muted">超 90 天应收</view>
        <view>{{ money(evalOf.remittance.over90Fen, 'USD') }}</view>
      </view>
      <view class="row line">
        <view class="muted">扣款</view>
        <view>{{ deductionText(evalOf.remittance?.deduction) }}</view>
      </view>
      <view class="h2" style="margin-top: 20rpx">中信保</view>
      <view class="row line">
        <view class="muted">投保限额</view>
        <view>{{ evalOf.sinosure?.insuredLimitFen != null ? money(evalOf.sinosure.insuredLimitFen, evalOf.sinosure.limitCurrency || evalOf.sinosure.currency) : '未登记' }}</view>
      </view>
      <view class="row line">
        <view class="muted">占用 / 分档</view>
        <view>{{ money(evalOf.sinosure?.occupancyFen, evalOf.sinosure?.currency) }} · {{ evalOf.sinosure?.bandLabel || '未测算' }}</view>
      </view>
    </view>

    <view class="card">
      <view class="h2">中信保限额与占用</view>
      <view v-if="c.sinosureLimit">
        <view class="h1" style="font-size: var(--font-title)">
          {{ money(c.sinosureLimit.insuredLimitFen, c.sinosureLimit.currency) }}
        </view>
        <view class="muted" style="margin-top: 8rpx">
          最新保单 {{ c.sinosureLimit.evidenceRef || '—' }} · 来自案件 {{ c.sinosureLimit.caseNo }}
        </view>
      </view>
      <view class="muted" v-else>尚未登记中信保限额，不得签订合同。请先在合同确认节点登记投保限额。</view>
      <SinosureExposure :exposure="c.exposure" :show-new="false" />
    </view>

    <view class="card">
      <view class="h2">已收汇 / 未收汇</view>
      <view class="muted">按出口合同金额与收汇到账金额汇总。部分到账计入已收汇，差额为未收汇。</view>
      <view v-for="b in c.receivable || []" :key="b.currency" style="margin-top: 12rpx">
        <view class="row">
          <view>
            <view class="muted">已收汇</view>
            <view class="stat-n">{{ money(b.settledFen, b.currency) }}</view>
          </view>
          <view>
            <view class="muted">未收汇</view>
            <view class="stat-n over">{{ money(b.openFen, b.currency) }}</view>
          </view>
        </view>
      </view>
      <view class="muted" v-if="!(c.receivable || []).length">暂无合同金额，无法统计收汇。</view>
    </view>

    <view class="card">
      <view class="h2">约定收款日</view>
      <view class="muted">是否按期回款：对照约定收款日与到账日。到期日可手填，或由交货期加付款条件账期推算。</view>
      <view class="row" style="margin-top: 16rpx">
        <view class="stat">
          <view class="stat-n">{{ c.collection?.counts?.onTime ?? 0 }}</view>
          <view class="muted">按期</view>
        </view>
        <view class="stat">
          <view class="stat-n over">{{ c.collection?.counts?.overdue ?? 0 }}</view>
          <view class="muted">逾期</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ c.collection?.counts?.notDue ?? 0 }}</view>
          <view class="muted">未到期</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ c.collection?.counts?.noRecord ?? 0 }}</view>
          <view class="muted">无约定</view>
        </view>
      </view>
    </view>

    <view class="h2" style="margin: 8rpx 8rpx 12rpx">签过哪些合同</view>
    <view class="card" v-for="t in c.contracts" :key="'ct-' + t.id" @click="openCase(t.id)">
      <view class="row">
        <view>
          <view class="muted">{{ t.caseNo }} · {{ t.contract?.incoterms || '合同' }}{{ t.contract?.paymentTerms ? ' · ' + t.contract.paymentTerms : '' }}</view>
          <view class="h2" style="margin: 6rpx 0 0">{{ t.goodsDesc }}</view>
        </view>
        <view class="badge" :class="remittanceClass(t.collection?.code)">
          {{ remittanceText(t.collection?.code) }}
        </view>
      </view>
      <view class="muted" style="margin-top: 10rpx">
        {{ t.fulfillment === 'OPEN' ? '未履行完毕' : t.fulfillment === 'FULFILLED' ? '已履行完毕' : '合同' }}
        · 合同金额 {{ money(t.amountFen, t.currency) }} · 已收汇 {{ money(t.receivedFen, t.currency) }} · 未收汇 {{ money(t.unpaidFen, t.currency) }}
      </view>
      <view class="muted">
        付款条件 {{ t.paymentTerms || '未填' }} · 约定收款日 {{ t.paymentDueAt || '—' }} · 到账 {{ t.receivedAt || '—' }}
      </view>
    </view>
    <view class="muted" v-if="!c.contracts?.length" style="margin-bottom: 16rpx">尚未签订出口合同。</view>

    <view class="h2" style="margin: 8rpx 8rpx 12rpx">历次交易记录</view>
    <view class="card" v-for="t in c.transactions" :key="t.id" @click="openCase(t.id)">
      <view class="row">
        <view>
          <view class="muted">{{ t.caseNo }}</view>
          <view class="h2" style="margin: 6rpx 0 0">{{ t.title }}</view>
        </view>
        <view class="badge" :class="remittanceClass(t.collection?.code)">
          {{ remittanceText(t.collection?.code) }}
        </view>
      </view>
      <view class="muted" style="margin-top: 10rpx">{{ t.goodsDesc }} · {{ t.destination }}</view>
      <view class="muted" v-if="t.hasContract">
        已收汇 {{ money(t.receivedFen, t.currency) }} / 未收汇 {{ money(t.unpaidFen, t.currency) }}
      </view>
      <view class="muted" v-else>尚未保存出口合同</view>
      <view class="muted" v-if="t.collection?.note">{{ t.collection.note }}</view>
    </view>
    <view class="muted" v-if="!c.transactions?.length">暂无交易。</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, gradeClass, money, pctText, remittanceClass, remittanceText } from '../../api';
import SinosureExposure from '../../components/SinosureExposure.vue';

const id = ref('');
const c = ref<any>(null);
const evalOf = computed(() => c.value?.evaluation || null);

function deductionText(v: unknown) {
  if (v == null || v === 'none') return '无';
  if (typeof v === 'number') return money(v, 'USD');
  return String(v);
}

onLoad(async (q) => {
  id.value = q?.id || '';
  if (!id.value) return;
  c.value = await api.customer(id.value);
});

function openCase(caseId: string) {
  uni.navigateTo({ url: `/pages/case/detail?id=${caseId}` });
}
</script>

<style scoped>
.stat {
  flex: 1;
  text-align: center;
}
.stat-n {
  font-size: var(--font-stat);
  font-weight: 700;
  color: #0f3d2e;
}
.stat-n.over {
  color: #b42318;
}
.line {
  margin-top: 10rpx;
  font-size: var(--font-md);
}
</style>
