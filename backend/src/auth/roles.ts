import { UserRole, UserRoleLabel, type UserRoleValue } from '../common/constants';

export { UserRole, UserRoleLabel };
export type { UserRoleValue };

export type MutationKind = 'workbench' | 'business' | 'risk' | 'supplement';

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

/** 风险处置：风控和主管都可以。这只放开风险雷达，不放开原来的工作台和闸门。 */
export function canDisposeRisk(role?: string | null): boolean {
  const n = normalizeDemoRole(role);
  return n === UserRole.RISK || n === UserRole.MANAGER;
}

export function mutationDeniedReason(role?: string | null, kind: MutationKind = 'business'): string | null {
  const n = normalizeDemoRole(role);
  if (!n) return '请先选择演示角色（请求头 x-actor-id 或 X-Demo-Role）';
  if (kind === 'risk') {
    if (canDisposeRisk(n)) return null;
    return '业务岗不能处置风险，请从「我的风险和补件」办理补件';
  }
  if (kind === 'supplement') return null;
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

export function isSupplementUploadPath(url: string): boolean {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  return /\/risk-radar\/supplements\/[^/]+\/upload$/.test(path);
}

/** 风险雷达上的写操作（处置、刷新、复筛、示例）。补件上传另走业务岗。 */
export function isRiskWritePath(url: string): boolean {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  if (!/\/risk-radar(\/|$)/.test(path)) return false;
  if (isSupplementUploadPath(path)) return false;
  return true;
}
