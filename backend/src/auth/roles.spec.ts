import {
  canWriteBusiness,
  canWriteWorkbench,
  isWorkbenchWritePath,
  mutationDeniedReason,
  normalizeDemoRole,
} from './roles';

describe('演示角色权限', () => {
  it('归一化 SALES / RISK / MANAGER，并兼容旧种子角色名', () => {
    expect(normalizeDemoRole('sales')).toBe('SALES');
    expect(normalizeDemoRole('RISK')).toBe('RISK');
    expect(normalizeDemoRole('MANAGER')).toBe('MANAGER');
    expect(normalizeDemoRole('COMPLIANCE')).toBe('RISK');
    expect(normalizeDemoRole('APPROVER')).toBe('MANAGER');
    expect(normalizeDemoRole('FINANCE')).toBe('MANAGER');
    expect(normalizeDemoRole('')).toBeNull();
    expect(normalizeDemoRole('ADMIN')).toBeNull();
  });

  it('工作台写操作仅 RISK', () => {
    expect(canWriteWorkbench('RISK')).toBe(true);
    expect(canWriteWorkbench('COMPLIANCE')).toBe(true);
    expect(canWriteWorkbench('SALES')).toBe(false);
    expect(canWriteWorkbench('MANAGER')).toBe(false);
    expect(canWriteWorkbench(undefined)).toBe(false);
  });

  it('业务写入与过闸：SALES + RISK，MANAGER 拒绝', () => {
    expect(canWriteBusiness('SALES')).toBe(true);
    expect(canWriteBusiness('RISK')).toBe(true);
    expect(canWriteBusiness('MANAGER')).toBe(false);
    expect(canWriteBusiness(undefined)).toBe(false);
  });

  it('拒绝原因覆盖工作台与主管只读', () => {
    expect(mutationDeniedReason(undefined, 'business')).toMatch(/演示角色/);
    expect(mutationDeniedReason('MANAGER', 'business')).toMatch(/只读/);
    expect(mutationDeniedReason('MANAGER', 'workbench')).toMatch(/只读/);
    expect(mutationDeniedReason('SALES', 'workbench')).toMatch(/风控/);
    expect(mutationDeniedReason('SALES', 'business')).toBeNull();
    expect(mutationDeniedReason('RISK', 'workbench')).toBeNull();
    expect(mutationDeniedReason('RISK', 'business')).toBeNull();
  });

  it('识别工作台写路径，忽略查询串与尾斜杠', () => {
    expect(isWorkbenchWritePath('/api/workbench/abc/action')).toBe(true);
    expect(isWorkbenchWritePath('/workbench/abc/action/')).toBe(true);
    expect(isWorkbenchWritePath('/api/workbench/abc/action?x=1')).toBe(true);
    expect(isWorkbenchWritePath('/api/workbench/queue')).toBe(false);
    expect(isWorkbenchWritePath('/api/workbench')).toBe(false);
    expect(isWorkbenchWritePath('/api/cases/x/nodes/N3/advance')).toBe(false);
  });
});
