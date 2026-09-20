<template>
  <view class="wrap" v-if="c">
    <view class="card">
      <view class="h2">报关放行</view>
      <view class="muted">核对 HS 编码与申报要素模板、原产地证据。税则品名/计量单位不符仅软提示；HS 或要素严重缺项禁止申报。电子口岸状态为模拟同步。存在未生效变更单时禁止申报。</view>
    </view>
    <PendingChangeBlock :case-id="id" :case-data="c" />
    <view class="card">
      <view class="label">HS 编码</view>
      <input class="input" v-model="form.hsCode" placeholder="8458.11.00" />
      <view class="btn btn-ghost" @click="applyTpl">载入模板要素</view>
      <view class="muted" v-if="tpl">模板：{{ tpl.productName }} · 单位 {{ tpl.unit }} · 税则 {{ tpl.exportTaxName }}</view>
      <view class="label">报关品名</view>
      <input class="input" v-model="form.productName" />
      <view v-for="el in elementKeys" :key="el">
        <view class="label">申报要素 · {{ el }}</view>
        <input class="input" v-model="form.declareElements[el]" :placeholder="el" />
      </view>
      <view class="label">原产国</view>
      <input class="input" v-model="form.originCountry" />
      <view class="label">原产地证据类型</view>
      <view class="chips">
        <view class="chip" :class="{ 'chip-on': form.originEvidenceType === t }" v-for="t in ['CO', 'FORM_E', 'FORM_A', 'DECLARATION']" :key="t" @click="form.originEvidenceType = t">{{ t }}</view>
      </view>
      <view class="label">原产地证据编号</view>
      <input class="input" v-model="form.originEvidenceRef" />
      <view class="label">计量单位</view>
      <input class="input" v-model="form.unit" />
      <view class="label">出口税则品名</view>
      <input class="input" v-model="form.exportTaxName" />
      <view class="btn" @click="save">保存报关单</view>
      <view class="btn btn-ghost" @click="sync">模拟同步电子口岸</view>
      <view class="btn btn-danger" @click="tryAdvance">校验并申报放行</view>
    </view>
    <view class="card" v-if="c.customs">
      <view class="row">
        <view class="h2" style="margin: 0">电子口岸</view>
        <view class="badge" :class="c.customs.eportStatus === 'RELEASED' ? 'badge-pass' : c.customs.eportStatus === 'HELD' ? 'badge-block' : 'badge-soft'">
          {{ c.customs.eportStatus }}
        </view>
      </view>
      <view class="muted">{{ c.customs.eportSyncRef || '尚未同步' }}</view>
    </view>
    <view class="err" v-if="err">{{ err }}</view>
    <view class="ok" v-if="ok">{{ ok }}</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api';
import PendingChangeBlock from '../../components/PendingChangeBlock.vue';

const id = ref('');
const c = ref<any>(null);
const catalog = ref<any>(null);
const err = ref('');
const ok = ref('');
const form = reactive<any>({
  hsCode: '8458.11.00',
  productName: '',
  declareElements: {} as Record<string, string>,
  originCountry: 'CN',
  originEvidenceType: 'CO',
  originEvidenceRef: '',
  unit: '',
  exportTaxName: '',
});

const tpl = computed(() => (catalog.value?.hsTemplates || []).find((h: any) => h.hsCode === form.hsCode));
const elementKeys = computed(() => tpl.value?.requiredElements || Object.keys(form.declareElements || {}));

onLoad(async (q) => {
  id.value = q?.id || '';
  catalog.value = await api.catalog();
  c.value = await api.case(id.value);
  form.productName = c.value.goodsDesc;
  if (c.value.customs) {
    Object.assign(form, {
      hsCode: c.value.customs.hsCode || form.hsCode,
      productName: c.value.customs.productName || form.productName,
      declareElements: { ...(c.value.customs.declareElements || {}) },
      originCountry: c.value.customs.originCountry || 'CN',
      originEvidenceType: c.value.customs.originEvidenceType || 'CO',
      originEvidenceRef: c.value.customs.originEvidenceRef || '',
      unit: c.value.customs.unit || '',
      exportTaxName: c.value.customs.exportTaxName || '',
    });
  } else {
    applyTpl();
  }
});

function applyTpl() {
  const t = tpl.value;
  if (!t) return;
  form.productName = form.productName || t.productName;
  form.unit = t.unit;
  form.exportTaxName = t.exportTaxName;
  const next: Record<string, string> = { ...form.declareElements };
  for (const el of t.requiredElements) if (next[el] == null) next[el] = '';
  form.declareElements = next;
}

async function save() {
  await api.saveCustoms(id.value, { ...form });
  c.value = await api.case(id.value);
  ok.value = '报关信息已保存';
}

async function sync() {
  err.value = '';
  try {
    await save();
    const r = await api.syncEport(id.value);
    ok.value = `模拟同步：${r.eportStatus} ${r.eportSyncRef}`;
    c.value = await api.case(id.value);
  } catch (e: any) {
    err.value = e?.message || '同步失败';
  }
}

async function tryAdvance() {
  err.value = '';
  try {
    await save();
    const r = await api.advance(id.value, 'N8');
    ok.value = `已推进至 ${r.nextNode}`;
  } catch (e: any) {
    err.value = (e?.reasons || []).join('；') || e?.message || '禁止申报';
  }
}
</script>
