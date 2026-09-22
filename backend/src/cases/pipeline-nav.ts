import { activePipelineNode, NODE_CATALOG, NODE_FLOW, NodeCode, pipelineIndex } from '../common/constants';

export type PipelineNodeTarget = { code: string; name: string };

export function pipelineNodeName(code?: string | null) {
  return NODE_CATALOG.find((n) => n.code === code)?.name || code || '';
}

/** 与闸门 nextNode 一致：N3 无变更单则跳过 N4；N7 的下一步是 N9。历史 N8 也进入 N9。 */
export function nextPipelineNode(current: string, hasChangeOrders = false): string | null {
  const code = String(current || '').toUpperCase();
  if (code === 'N8') return 'N9';
  const i = NODE_FLOW.indexOf(code as NodeCode);
  if (i < 0 || i === NODE_FLOW.length - 1) return null;
  if (code === 'N3' && !hasChangeOrders) return 'N5';
  return NODE_FLOW[i + 1];
}

/**
 * 合同管理表单（销售 N3 / 采购 N5）离开后应打开的九节点页面。
 * 案件已离开本表单时跟 currentNode；否则为保存/过闸后的下一步。
 */
export function nextWorkNodeFromForm(
  formNode: string,
  input: {
    currentNode?: string | null;
    changeOrders?: unknown[] | null;
    changeOrderCount?: number;
    overrideNext?: string | null;
  } = {},
): PipelineNodeTarget | null {
  const override = input.overrideNext;
  if (override) return { code: override, name: pipelineNodeName(override) };

  const current = input.currentNode || '';
  const shown = activePipelineNode(current);
  const fi = pipelineIndex(formNode);
  const ci = pipelineIndex(current);
  if (fi >= 0 && ci > fi) return { code: shown, name: pipelineNodeName(shown) };

  const hasChangeOrders = (input.changeOrderCount ?? input.changeOrders?.length ?? 0) > 0;
  const next = nextPipelineNode(formNode, hasChangeOrders);
  if (!next) return null;
  return { code: next, name: pipelineNodeName(next) };
}

/** 列表卡片：本案已离开本表单节点时才给出「进入下一节点」。 */
export function listShowsNextNodeButton(formNode: string, currentNode?: string | null) {
  const fi = pipelineIndex(formNode);
  const ci = pipelineIndex(currentNode);
  return fi >= 0 && ci > fi;
}
