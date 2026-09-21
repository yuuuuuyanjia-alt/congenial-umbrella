import { onShow } from '@dcloudio/uni-app';
import { computed, ref, watch } from 'vue';
import { api } from './api';

export const UserRole = {
  SALES: 'SALES',
  RISK: 'RISK',
  MANAGER: 'MANAGER',
} as const;

export const UserRoleLabel: Record<string, string> = {
  SALES: '业务',
  RISK: '风控',
  MANAGER: '主管',
};

export type DemoUser = { id: string; name: string; role: string; roleLabel?: string };

const KEY_ACTOR = 'actorId';
const KEY_ROLE = 'demoRole';
const KEY_NAME = 'demoUserName';

export const demoSession = ref<DemoUser | null>(readStored());

function readStored(): DemoUser | null {
  try {
    const id = uni.getStorageSync(KEY_ACTOR);
    const role = uni.getStorageSync(KEY_ROLE);
    const name = uni.getStorageSync(KEY_NAME);
    if (id && role) return { id, name: name || '', role };
  } catch {
    /* storage unavailable in some test envs */
  }
  return null;
}

export function persistDemoUser(u: DemoUser) {
  uni.setStorageSync(KEY_ACTOR, u.id);
  uni.setStorageSync(KEY_ROLE, u.role);
  uni.setStorageSync(KEY_NAME, u.name);
  demoSession.value = { id: u.id, name: u.name, role: u.role, roleLabel: u.roleLabel };
}

export function roleLabelOf(role?: string | null) {
  return (role && UserRoleLabel[role]) || role || '';
}

export function currentRoleCaption(role?: string | null) {
  return `当前：${roleLabelOf(role) || UserRoleLabel.SALES}`;
}

/** 演示界面只展示岗位，不展示种子用户姓名。 */
export function demoActorLabel(u?: { role?: string | null; roleLabel?: string | null; name?: string | null } | null) {
  if (!u) return '';
  return roleLabelOf(u.role) || u.roleLabel || '';
}

export const APP_VERSION = '0.1.0';

/** QA 调试：默认收起三选一，由首页底部链接或连点三次打开。 */
export const debugRolePickerOpen = ref(false);

let debugUnlockTaps = 0;
let debugUnlockTimer: ReturnType<typeof setTimeout> | null = null;

export function openDebugRolePicker() {
  debugRolePickerOpen.value = true;
  try {
    uni.pageScrollTo({ scrollTop: 0, duration: 200 });
  } catch {
    /* page scroll is optional */
  }
}

export function closeDebugRolePicker() {
  debugRolePickerOpen.value = false;
}

export function toggleDebugRolePicker() {
  if (debugRolePickerOpen.value) closeDebugRolePicker();
  else openDebugRolePicker();
}

export function noteDebugUnlockTap() {
  debugUnlockTaps += 1;
  if (debugUnlockTimer) clearTimeout(debugUnlockTimer);
  debugUnlockTimer = setTimeout(() => {
    debugUnlockTaps = 0;
  }, 900);
  if (debugUnlockTaps >= 3) {
    debugUnlockTaps = 0;
    openDebugRolePicker();
  }
}

export function canWriteBusiness(role?: string | null) {
  const r = role || demoSession.value?.role;
  return r === UserRole.SALES || r === UserRole.RISK;
}

export function canWriteWorkbench(role?: string | null) {
  return (role || demoSession.value?.role) === UserRole.RISK;
}

export const HOME_ENTRIES: Record<string, { url: string; label: string }[]> = {
  SALES: [
    { url: '/pages/case/hub', label: '合同管理' },
    { url: '/pages/supplier/list', label: '供应商管理' },
    { url: '/pages/customer/list', label: '客户管理' },
  ],
  RISK: [
    { url: '/pages/workbench/index', label: '审核工作台' },
    { url: '/pages/case/hub', label: '合同管理' },
    { url: '/pages/customer/list', label: '客户管理' },
    { url: '/pages/supplier/list', label: '供应商管理' },
  ],
  MANAGER: [
    { url: '/pages/customer/list', label: '客户管理' },
    { url: '/pages/case/hub', label: '合同管理' },
    { url: '/pages/supplier/list', label: '供应商管理' },
  ],
};

export function homeEntriesFor(role?: string | null) {
  return HOME_ENTRIES[role || UserRole.SALES] || HOME_ENTRIES.SALES;
}

export async function ensureDemoUser() {
  const users: DemoUser[] = await api.users();
  const stored = readStored();
  const hit = stored && users.find((u) => u.id === stored.id);
  if (hit) {
    persistDemoUser(hit);
    return hit;
  }
  const sales = users.find((u) => u.role === UserRole.SALES) || users[0];
  if (sales) persistDemoUser(sales);
  return sales || null;
}

export function useDemoRole() {
  const role = ref(demoSession.value?.role || UserRole.SALES);
  const name = ref(demoSession.value?.name || '');
  function refresh() {
    const cur = demoSession.value || readStored();
    if (cur) {
      role.value = cur.role;
      name.value = cur.name;
    }
  }
  onShow(refresh);
  watch(demoSession, refresh, { deep: true });
  refresh();
  return {
    role,
    name,
    roleLabel: computed(() => roleLabelOf(role.value)),
    canWriteBusiness: computed(() => canWriteBusiness(role.value)),
    canWriteWorkbench: computed(() => canWriteWorkbench(role.value)),
    isManager: computed(() => role.value === UserRole.MANAGER),
    isSales: computed(() => role.value === UserRole.SALES),
    isRisk: computed(() => role.value === UserRole.RISK),
    refresh,
  };
}
