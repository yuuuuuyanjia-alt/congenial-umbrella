import { UserRole, UserRoleLabel, type UserRoleValue } from '../common/constants';

export { UserRole, UserRoleLabel };
export type { UserRoleValue };

export type MutationKind = 'workbench' | 'business';

const LEGACY_ROLE: Record<string, UserRoleValue> = {
  COMPLIANCE: UserRole.RISK,
  APPROVER: UserRole.MANAGER,
  FINANCE: UserRole.MANAGER,
};

export function normalizeDemoRole(raw?: string | null): UserRoleValue | null {
  if (!raw) return null;
  const u = String(raw).trim().toUpperCase();
  if (u === UserRole.SALES || u === UserRole.RISK || u === UserRole.MANAGER) return u;
  return LEGACY_ROLE[u] || null;
}

export function roleLabel(raw?: string | null): string {
  const n = normalizeDemoRole(raw);
  return (n && UserRoleLabel[n]) || raw || '';
}

/** 工作台写操作：领取 / 放行 / 驳回 / 筛查处置。仅 RISK。 */
export function canWriteWorkbench(role?: string | null): boolean {
  return normalizeDemoRole(role) === UserRole.RISK;
}

/** 案件录入、合同/采购保存、过闸。SALES + RISK；MANAGER 只读。 */
export function canWriteBusiness(role?: string | null): boolean {
  const n = normalizeDemoRole(role);
  return n === UserRole.SALES || n === UserRole.RISK;
}

export function mutationDeniedReason(role?: string | null, kind: MutationKind = 'business'): string | null {
  const n = normalizeDemoRole(role);
  if (!n) return '请先选择演示角色（请求头 x-actor-id 或 X-Demo-Role）';
  if (n === UserRole.MANAGER) return '主管为本轮只读，不可保存、推进或审批';
  if (kind === 'workbench' && n !== UserRole.RISK) {
    return n === UserRole.SALES
      ? '业务岗不可在工作台领取/放行/驳回，请切换风控岗'
      : '仅风控岗可处置工作台';
  }
  return null;
}

export function isWorkbenchWritePath(url: string): boolean {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  return /\/workbench\/[^/]+\/action$/.test(path);
}
