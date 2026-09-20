import { nextNode } from '../gates/gate.engine';
import { CaseSnapshot } from '../common/types';
import {
  listShowsNextNodeButton,
  nextPipelineNode,
  nextWorkNodeFromForm,
  pipelineNodeName,
} from './pipeline-nav';

function snap(changeCount = 0): CaseSnapshot {
  return { changeOrders: Array.from({ length: changeCount }, () => ({})) } as CaseSnapshot;
}

describe('合同管理接到九节点下一步', () => {
  it('N3 无变更单跳过 N4，与闸门 nextNode 一致', () => {
    expect(nextPipelineNode('N3', false)).toBe('N5');
    expect(nextNode('N3', snap(0))).toBe('N5');
    expect(nextPipelineNode('N3', true)).toBe('N4');
    expect(nextNode('N3', snap(1))).toBe('N4');
    expect(nextPipelineNode('N5')).toBe('N6');
    expect(nextPipelineNode('N9')).toBeNull();
  });

  it('销售合同表单：仍停在 N3 时，下一步为采购或变更', () => {
    expect(nextWorkNodeFromForm('N3', { currentNode: 'N3' })).toEqual({
      code: 'N5',
      name: '采购合同/国内备货',
    });
    expect(nextWorkNodeFromForm('N3', { currentNode: 'N3', changeOrderCount: 1 })).toEqual({
      code: 'N4',
      name: '变更管理',
    });
  });

  it('销售合同表单：案件已离开 N3 时跟 currentNode，不必再翻案件树', () => {
    expect(nextWorkNodeFromForm('N3', { currentNode: 'N5' })?.code).toBe('N5');
    expect(nextWorkNodeFromForm('N3', { currentNode: 'N6' })).toEqual({
      code: 'N6',
      name: '装运/提单指示',
    });
    expect(nextWorkNodeFromForm('N3', { currentNode: 'N9' })?.code).toBe('N9');
    expect(pipelineNodeName('N9')).toBe('收汇对账');
  });

  it('采购合同表单：停在 N5 则下一步装运；已过则跟当前节点', () => {
    expect(nextWorkNodeFromForm('N5', { currentNode: 'N5' })).toEqual({
      code: 'N6',
      name: '装运/提单指示',
    });
    expect(nextWorkNodeFromForm('N5', { currentNode: 'N8' })?.code).toBe('N8');
  });

  it('过闸返回的 nextNode 优先', () => {
    expect(nextWorkNodeFromForm('N3', { currentNode: 'N3', overrideNext: 'N5' })?.code).toBe('N5');
    expect(nextWorkNodeFromForm('N5', { currentNode: 'N6', overrideNext: 'N6' })?.code).toBe('N6');
  });

  it('列表仅在已离开本表单节点时显示进入下一节点', () => {
    expect(listShowsNextNodeButton('N3', 'N3')).toBe(false);
    expect(listShowsNextNodeButton('N3', 'N5')).toBe(true);
    expect(listShowsNextNodeButton('N5', 'N5')).toBe(false);
    expect(listShowsNextNodeButton('N5', 'N6')).toBe(true);
    expect(listShowsNextNodeButton('N3', 'N1')).toBe(false);
  });
});
