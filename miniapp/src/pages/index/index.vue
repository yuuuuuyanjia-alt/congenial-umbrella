<template>
  <view class="wrap">
    <view class="hero card">
      <view class="eyebrow">国有企业 · 跨境出口</view>
      <view class="h1">贸易风险管控</view>
      <view class="muted" style="margin-top: 12rpx">
        筛查嵌在询盘→报价→销售合同→变更→采购合同/国内备货→装运→单证→报关→收汇业务流中，无需单独登录筛查系统。销售合同与采购合同分开签订，惯例先销售后采购。高风险硬拦截，中风险进审核队列，低风险软提示不阻断。全链路审计留痕。
      </view>
    </view>

    <RoleBar @change="onRoleChange" />

    <view class="card">
      <view class="h2">工作入口</view>
      <view class="muted">{{ entryHint }}</view>
      <view class="btn" v-for="e in entries" :key="e.url" @click="go(e.url)">{{ e.label }}</view>
    </view>

    <view class="h2" style="margin: 8rpx 8rpx 16rpx">演示路径</view>
    <view class="card" v-for="item in paths" :key="item.caseNo" @click="openByNo(item.caseNo)">
      <view class="row">
        <view class="h2" style="margin: 0">{{ item.title }}</view>
        <view class="badge" :class="item.cls">{{ item.tag }}</view>
      </view>
      <view class="muted">{{ item.desc }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../api';
import RoleBar from '../../components/RoleBar.vue';
import { demoSession, homeEntriesFor, roleLabelOf, useDemoRole } from '../../role';

const cases = ref<any[]>([]);
const { role } = useDemoRole();
const entries = computed(() => homeEntriesFor(role.value));
const entryHint = computed(() => {
  if (role.value === 'RISK') return '风控岗默认先进入审核工作台；合同与客户为只读优先，现有写入接口未扩大。';
  if (role.value === 'MANAGER') return '主管本轮只读：先看客户评估与案件列表，不可审批、推进或改合同。';
  return '业务岗可录入客户/销售/采购并推进 N1–N9。工作台只读，领取/放行请切换风控岗。';
});
function onRoleChange() {
  role.value = demoSession.value?.role || role.value;
  uni.setNavigationBarTitle({
    title: demoSession.value ? `出口风控 · ${roleLabelOf(demoSession.value.role)}` : '出口风控',
  });
}
const paths = [
  {
    caseNo: 'DEMO-PASS',
    title: '绿灯通过',
    tag: 'PASS',
    cls: 'badge-pass',
    desc: '买方=付款人=收货人，模拟清单未命中，条款与硬闸门证据齐全，收汇放行。',
  },
  {
    caseNo: 'DEMO-SOFT',
    title: '软提示',
    tag: 'SOFT ALERT',
    cls: 'badge-soft',
    desc: '名称近似命中（低置信），提示关注但不阻断询盘推进。',
  },
  {
    caseNo: 'DEMO-BLOCK',
    title: '硬拦截',
    tag: 'HARD BLOCK',
    cls: 'badge-block',
    desc: '高置信命中 OFAC 模拟清单，N1 闸门拒绝进入后续交易。',
  },
  {
    caseNo: 'DEMO-FOB',
    title: 'FOB 无提单',
    tag: 'NO BL',
    cls: 'badge-pass',
    desc: '买方安排运输，N6 走无提单路径（书面指示 + 内部审批 + 装船通知）；N7 核验订舱号即可，不要求提单。',
  },
  {
    caseNo: 'DEMO-LIMIT',
    title: '中信保超额',
    tag: 'GATE REFUSED',
    cls: 'badge-block',
    desc: '占用测算超额 50,000 USD（满 5 万），超高风险，合同确认硬拦截。',
  },
  {
    caseNo: 'DEMO-LIMIT-MED',
    title: '中信保中风险',
    tag: 'SOFT ALERT',
    cls: 'badge-soft',
    desc: 'Helios 未履行/已履行未回款加新签，超额约 1.3 万美元，中风险软提示，可推进。',
  },
  {
    caseNo: 'DEMO-LIMIT-HIGH',
    title: '中信保高风险',
    tag: 'REVIEW',
    cls: 'badge-review',
    desc: '新签使占用超额 2.5 万美元，高风险进入工作台（领取/放行/驳回）。放行后可推进，无需改金额；驳回后仍阻断。',
  },
  {
    caseNo: 'DEMO-NOLIMIT',
    title: '中信保未登记',
    tag: 'GATE REFUSED',
    cls: 'badge-block',
    desc: '买方尚未登记中信保限额，合同确认节点拒绝保存与推进。',
  },
  {
    caseNo: 'DEMO-SUPPLIER',
    title: '供应商硬拦截',
    tag: 'N5 BLOCK',
    cls: 'badge-block',
    desc: '国外买方筛查通过，国内供应商命中不可靠实体清单；采购合同已关联销售合同 DEMO-SUPPLIER，采购节点硬拦截。',
  },
  {
    caseNo: 'DEMO-PORT-YELLOW',
    title: '港口直出黄灯',
    tag: 'TAX REVIEW',
    cls: 'badge-review',
    desc: '港口直出四问齐全、不强制自有仓；购销薄利进入工作台第三页领取/通过/驳回。',
  },
  {
    caseNo: 'DEMO-PORT-RED',
    title: '港口直出红线',
    tag: 'HARD BLOCK',
    cls: 'badge-block',
    desc: '港口直出自答像空转/假出口，红线硬拦截；工作台第三页只读。',
  },
];

onMounted(async () => {
  try {
    cases.value = await api.cases();
  } catch (e) {
    uni.showToast({ title: '后端未启动，请先运行 backend', icon: 'none' });
  }
});

function go(url: string) {
  uni.navigateTo({ url });
}

function openByNo(caseNo: string) {
  const hit = cases.value.find((c) => c.caseNo === caseNo);
  if (!hit) {
    uni.showToast({ title: '未找到种子案件，请先 seed', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/case/detail?id=${hit.id}` });
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
</style>
