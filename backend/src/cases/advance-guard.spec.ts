import {
  ADVANCE_IDEMPOTENT_REASON,
  ADVANCE_NOT_CURRENT_REASON,
  NodeStatus,
} from '../common/constants';
import {
  advanceResponseNextNode,
  laterNode,
  resolveAdvance,
} from './advance-guard';

describe('advance 状态机守门', () => {
  it('只允许推进当前节点', () => {
    expect(
      resolveAdvance({ currentNode: 'N5', requestedNode: 'N6', requestedStatus: NodeStatus.NOT_STARTED }),
    ).toEqual({ kind: 'reject', code: 'NODE_NOT_CURRENT', message: ADVANCE_NOT_CURRENT_REASON });
    expect(
      resolveAdvance({ currentNode: 'N5', requestedNode: 'N3', requestedStatus: NodeStatus.IN_PROGRESS }),
    ).toMatchObject({ kind: 'reject', code: 'NODE_NOT_CURRENT' });
    expect(
      resolveAdvance({ currentNode: 'N3', requestedNode: 'N3', requestedStatus: NodeStatus.IN_PROGRESS }),
    ).toEqual({ kind: 'allow' });
  });

  it('已 PASSED 的节点幂等：无副作用、不回退 currentNode', () => {
    const r = resolveAdvance({
      currentNode: 'N5',
      requestedNode: 'N3',
      requestedStatus: NodeStatus.PASSED,
    });
    expect(r).toEqual({ kind: 'idempotent', reason: ADVANCE_IDEMPOTENT_REASON });
    expect(advanceResponseNextNode('N5')).toBe('N5');
    expect(advanceResponseNextNode('N9')).toBeNull();
  });

  it('当前节点已 PASSED 同样幂等，不重复过闸', () => {
    expect(
      resolveAdvance({ currentNode: 'N3', requestedNode: 'N3', requestedStatus: NodeStatus.PASSED }),
    ).toEqual({ kind: 'idempotent', reason: ADVANCE_IDEMPOTENT_REASON });
  });

  it('禁止 currentNode 回退：取流程上较后的节点', () => {
    expect(laterNode('N7', 'N3')).toBe('N7');
    expect(laterNode('N5', 'N4')).toBe('N5');
    expect(laterNode('N5', 'N3')).toBe('N5');
    expect(laterNode('N3', 'N5')).toBe('N5');
    expect(laterNode('N8', 'N9')).toBe('N9');
    expect(laterNode('N9', 'N9')).toBe('N9');
    expect(laterNode('N5', null)).toBe('N5');
  });

  it('验收：已在 N5+ 再从销售合同（N3）advance，保持 N5+ 且幂等', () => {
    const atN5 = resolveAdvance({
      currentNode: 'N5',
      requestedNode: 'N3',
      requestedStatus: NodeStatus.PASSED,
    });
    const atN7 = resolveAdvance({
      currentNode: 'N7',
      requestedNode: 'N3',
      requestedStatus: NodeStatus.PASSED,
    });
    expect(atN5.kind).toBe('idempotent');
    expect(atN7.kind).toBe('idempotent');
    expect(laterNode('N5', 'N3')).toBe('N5');
    expect(laterNode('N7', 'N5')).toBe('N7');
    expect(advanceResponseNextNode('N7')).toBe('N7');
  });
});
