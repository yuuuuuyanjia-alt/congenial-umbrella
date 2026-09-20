import {
  ADVANCE_IDEMPOTENT_REASON,
  ADVANCE_NOT_CURRENT_REASON,
  NODE_FLOW,
  NodeCode,
  NodeStatus,
} from '../common/constants';

export type AdvanceGuardInput = {
  currentNode: string;
  requestedNode: string;
  requestedStatus?: string | null;
};

export type AdvanceGuardDecision =
  | { kind: 'idempotent'; reason: string }
  | { kind: 'allow' }
  | { kind: 'reject'; code: 'NODE_NOT_CURRENT'; message: string };

export function nodeFlowIndex(code?: string | null): number {
  return NODE_FLOW.indexOf(String(code || '').toUpperCase() as NodeCode);
}

/** 取流程上较后的节点，禁止 currentNode 回退。 */
export function laterNode(current: string, candidate?: string | null): string {
  if (!candidate) return current;
  const ic = nodeFlowIndex(current);
  const inext = nodeFlowIndex(candidate);
  if (inext < 0) return current;
  if (ic < 0) return candidate;
  return inext < ic ? current : candidate;
}

export function isNodeBefore(a?: string | null, b?: string | null): boolean {
  const ia = nodeFlowIndex(a);
  const ib = nodeFlowIndex(b);
  return ia >= 0 && ib >= 0 && ia < ib;
}

/**
 * advance 守门：
 * 1. 已 PASSED 的节点幂等（无闸门、无占用、不改 currentNode）
 * 2. 只能推进当前节点
 * 3. 禁止把 currentNode 回退到更早节点
 */
export function resolveAdvance(input: AdvanceGuardInput): AdvanceGuardDecision {
  const requested = String(input.requestedNode || '').toUpperCase();
  const current = String(input.currentNode || '').toUpperCase();
  const status = String(input.requestedStatus || '').toUpperCase();

  if (status === NodeStatus.PASSED) {
    return { kind: 'idempotent', reason: ADVANCE_IDEMPOTENT_REASON };
  }
  if (!requested || requested !== current) {
    return { kind: 'reject', code: 'NODE_NOT_CURRENT', message: ADVANCE_NOT_CURRENT_REASON };
  }
  return { kind: 'allow' };
}

export function advanceResponseNextNode(currentNode: string): string | null {
  return currentNode === 'N9' ? null : currentNode;
}
