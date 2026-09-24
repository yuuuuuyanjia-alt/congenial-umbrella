import { N7_UPLOADS } from '../common/constants';
import { isSettlementPaid, type SettlementLedgerInput } from '../customers/sinosure-exposure';

/**
 * 风险雷达第一版规则。只覆盖四类：
 * 制裁、中信保额度（美元）、后 T/T 逾期应收、单证缺失。
 * 四流抽检、降级候选、前 T/T 逾期留到第二版，这里不产生发现。
 *
 * 严重度：红 > 橙 > 黄 > 灰。灰色没有自动规则。
 * 红色只能由规则直接判定，补件逾期最多把黄色升到橙色。
 */

export const RiskType = {
  SANCTION: 'SANCTION',
  SINOSURE_OCCUPANCY: 'SINOSURE_OCCUPANCY',
  OVERDUE_RECEIVABLE: 'OVERDUE_RECEIVABLE',
  DOC_MISSING: 'DOC_MISSING',
  /** 第一版没有灰色规则。示例数据单独写入，不参与自动发现。 */
  SAMPLE_NOTICE: 'SAMPLE_NOTICE',
} as const;

export const RiskColor = {
  RED: 'RED',
  ORANGE: 'ORANGE',
  YELLOW: 'YELLOW',
  GRAY: 'GRAY',
} as const;

export type RiskColorValue = (typeof RiskColor)[keyof typeof RiskColor];

export const COLOR_RANK: Record<string, number> = {
  RED: 0,
  ORANGE: 1,
  YELLOW: 2,
  GRAY: 3,
};

export const RiskStatus = {
  PENDING: 'PENDING',
  CONDITIONAL_RELEASE: 'CONDITIONAL_RELEASE',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
  SYSTEM_CLOSED: 'SYSTEM_CLOSED',
} as const;

export const RiskTypeLabel: Record<string, string> = {
  SANCTION: '制裁',
  SINOSURE_OCCUPANCY: '中信保额度',
  OVERDUE_RECEIVABLE: '逾期应收',
  DOC_MISSING: '单证缺失',
  SAMPLE_NOTICE: '评分提醒',
};

export const RiskColorLabel: Record<string, string> = {
  RED: '红色',
  ORANGE: '橙色',
  YELLOW: '黄色',
  GRAY: '灰色',
};

export const RiskStatusLabel: Record<string, string> = {
  PENDING: '待处置',
  CONDITIONAL_RELEASE: '有条件放行',
  RESOLVED: '已解决',
  REJECTED: '已驳回',
  SYSTEM_CLOSED: '系统关闭',
};

/**
 * 人工处置过的状态。颜色没变或变轻时，重算保持这个状态，也不系统关闭。
 * 规则颜色比处置当时更严重时，要重新打开为待处置。补件逾期升橙不走这一步。
 */
export const PROTECTED_STATUSES = new Set<string>([
  RiskStatus.CONDITIONAL_RELEASE,
  RiskStatus.REJECTED,
  RiskStatus.RESOLVED,
]);

/** 系统因规则升级把已处置风险重新打开。处理人显示为「系统」。 */
export const RiskConclusion = {
  REOPENED: 'REOPENED',
} as const;

export const SEVERITY_REOPEN_CODE = 'SEVERITY_REOPEN';

export type RiskLine = {
  code: string;
  text: string;
  supplement?: string;
};

export type RiskFinding = {
  fingerprint: string;
  type: string;
  ruleColor: RiskColorValue;
  title: string;
  subjectLabel: string;
  caseId?: string | null;
  batchId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  lines: RiskLine[];
};

export type StoredRisk = {
  id?: string;
  fingerprint: string;
  type: string;
  color: string;
  ruleColor: string;
  status: string;
  title: string;
  subjectLabel: string;
  caseId?: string | null;
  batchId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  lines: RiskLine[];
  firstSeenAt: string;
  lastHitAt: string;
  escalatedAt: string | null;
  /** 处置当时的展示颜色。空表示还没处置过，比较时回退到 color。 */
  dispositionSeverity: string | null;
  /** 处置后规则升级重新打开的时间。和补件逾期的 escalatedAt 分开。 */
  reopenedAt: string | null;
  isSample: boolean;
  preserveOnRecalc: boolean;
};

export type SyncedRisk = StoredRisk & {
  op: 'create' | 'update' | 'unchanged';
  /** 这次重算因为规则颜色升级，把已处置记录重新打开。 */
  reopened?: boolean;
};

const SUSPECT_DISPOSITIONS = new Set(['OPEN', 'MONITORING', 'SUPPLEMENTED']);

export type SanctionHitInput = {
  customerId?: string | null;
  supplierId?: string | null;
  caseId?: string | null;
  subjectName: string;
  subjectLabel?: string | null;
  listCode: string;
  listedName: string;
  matchedName: string;
  confidence: string;
  disposition: string;
};

/** 确认命中红、高置信疑似橙、仍开放的低置信黄。中置信第一版不单列。 */
export function sanctionBucket(hit: { disposition?: string | null; confidence?: string | null }): 'CONFIRMED' | 'HIGH' | 'LOW' | null {
  const disposition = String(hit.disposition || '').toUpperCase();
  const confidence = String(hit.confidence || '').toUpperCase();
  if (disposition === 'FALSE_POSITIVE') return null;
  if (disposition === 'CONFIRMED_TRUE') return 'CONFIRMED';
  if (confidence === 'HIGH' && SUSPECT_DISPOSITIONS.has(disposition)) return 'HIGH';
  if (confidence === 'LOW' && disposition === 'OPEN') return 'LOW';
  return null;
}

const BUCKET_COLOR: Record<'CONFIRMED' | 'HIGH' | 'LOW', RiskColorValue> = {
  CONFIRMED: RiskColor.RED,
  HIGH: RiskColor.ORANGE,
  LOW: RiskColor.YELLOW,
};

const BUCKET_TEXT: Record<'CONFIRMED' | 'HIGH' | 'LOW', string> = {
  CONFIRMED: '风控已确认命中',
  HIGH: '高置信度疑似命中',
  LOW: '新出现的低置信度命中',
};

export function sanctionFindings(hits: SanctionHitInput[]): RiskFinding[] {
  const groups = new Map<string, RiskFinding>();
  for (const hit of hits) {
    const bucket = sanctionBucket(hit);
    if (!bucket) continue;
    const subject = hit.customerId ? `C:${hit.customerId}` : hit.supplierId ? `S:${hit.supplierId}` : '';
    if (!subject) continue;
    const fingerprint = `SANCTION|${subject}|${bucket}`;
    const line: RiskLine = {
      code: `SANCTION_${bucket}_${hit.listCode}`,
      text: `${BUCKET_TEXT[bucket]}：${hit.subjectName} 对照 ${hit.listCode}「${hit.listedName}」（匹配 ${hit.matchedName}）`,
      supplement: bucket === 'CONFIRMED' ? undefined : '补充制裁筛查说明材料',
    };
    const prev = groups.get(fingerprint);
    if (prev) {
      prev.lines.push(line);
      continue;
    }
    const name = hit.subjectLabel || hit.subjectName;
    groups.set(fingerprint, {
      fingerprint,
      type: RiskType.SANCTION,
      ruleColor: BUCKET_COLOR[bucket],
      title: `${name} · 制裁命中`,
      subjectLabel: name,
      caseId: hit.caseId ?? null,
      customerId: hit.customerId ?? null,
      supplierId: hit.supplierId ?? null,
      lines: [line],
    });
  }
  return [...groups.values()];
}

/**
 * 追加额度：按时间排列的保单限额。后续保单高于第一张的部分视为追加。
 * 只有一张保单时追加额度为 0。占比分母用最新一张的有效限额。
 */
export function quotaFromLimits(limitsChronological: number[]): { effectiveFen: number | null; additionalFen: number } {
  const positive = limitsChronological.map((n) => Number(n) || 0).filter((n) => n > 0);
  if (!positive.length) return { effectiveFen: null, additionalFen: 0 };
  const base = positive[0];
  const effectiveFen = positive[positive.length - 1];
  const additionalFen = positive.length >= 2 ? Math.max(0, effectiveFen - base) : 0;
  return { effectiveFen, additionalFen };
}

/**
 * 只看美元。80% 到 90%（含两端）黄，超过 90% 橙。
 * 占用超出有效限额且没有追加额度才是红。有追加但仍超过 90% 时保持橙，不会因为“超了”自动变红。
 */
export function occupancyRuleColor(input: {
  occupancyFen: number;
  effectiveLimitFen: number | null;
  additionalFen: number;
  usd: boolean;
}): RiskColorValue | null {
  if (!input.usd) return null;
  const limit = input.effectiveLimitFen;
  if (limit == null || limit <= 0) return null;
  const occ = Math.max(0, Number(input.occupancyFen) || 0);
  if (occ <= 0) return null;
  const additional = Math.max(0, Number(input.additionalFen) || 0);
  if (occ > limit && additional <= 0) return RiskColor.RED;
  if (occ * 10 > limit * 9) return RiskColor.ORANGE;
  if (occ * 10 >= limit * 8 && occ * 10 <= limit * 9) return RiskColor.YELLOW;
  return null;
}

export function occupancyFinding(input: {
  customerId: string;
  customerName: string;
  caseId?: string | null;
  caseNo?: string | null;
  occupancyFen: number;
  effectiveLimitFen: number | null;
  additionalFen: number;
  usd: boolean;
}): RiskFinding | null {
  const color = occupancyRuleColor(input);
  if (!color) return null;
  const limit = input.effectiveLimitFen || 0;
  const pct = limit > 0 ? Math.round((input.occupancyFen / limit) * 1000) / 10 : 0;
  const extra =
    color === RiskColor.RED
      ? '已超出限额且没有追加额度'
      : input.additionalFen > 0
        ? `已有追加额度 ${(input.additionalFen / 100).toFixed(2)} 美元`
        : `占用 ${pct}%`;
  return {
    fingerprint: `SINOSURE_OCCUPANCY|C:${input.customerId}`,
    type: RiskType.SINOSURE_OCCUPANCY,
    ruleColor: color,
    title: `${input.customerName} · 中信保额度占用`,
    subjectLabel: input.customerName,
    caseId: input.caseId ?? null,
    customerId: input.customerId,
    lines: [
      {
        code: `OCCUPANCY_${color}`,
        text: `${input.caseNo || input.customerName} 美元占用 ${(input.occupancyFen / 100).toFixed(2)} / 限额 ${(limit / 100).toFixed(2)}，${extra}`,
        supplement: '补充额度占用说明或追加限额材料',
      },
    ],
  };
}

export function utcDayNumber(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function addUtcDays(d: Date, days: number): Date {
  const x = new Date(utcDayNumber(d));
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** 今天比到期日晚几天。同一天为 0，到期日在今天之后为负数。 */
export function utcDaysPast(today: Date, due: Date): number {
  return Math.round((utcDayNumber(today) - utcDayNumber(due)) / 86_400_000);
}

/**
 * 约定到期日 = 本批到港日 + 到达目的港后付款天数。
 * 本批没填到港日时，用本批 N6 过闸那天。
 * 数据模型里本批到港日记在 ShipmentBatch.etaDate（装运页的到港日期）；调用方传入即可。
 */
export function receivableDueDate(input: {
  arrivalDate: Date | null;
  n6PassedAt: Date | null;
  daysAfterArrival: number | null;
}): Date | null {
  if (input.daysAfterArrival == null || !Number.isFinite(Number(input.daysAfterArrival))) return null;
  const days = Number(input.daysAfterArrival);
  if (days < 0) return null;
  const base = input.arrivalDate ?? input.n6PassedAt;
  if (!base || Number.isNaN(base.getTime())) return null;
  return addUtcDays(base, days);
}

/** 只处理后 T/T。过了到期日未收齐为黄；超过到期日再多 7 天宽限期为橙。 */
export function overdueRuleColor(input: {
  ttTiming?: string | null;
  dueDate: Date | null;
  today: Date;
  collected: boolean;
}): 'YELLOW' | 'ORANGE' | null {
  if (String(input.ttTiming || '').trim().toUpperCase() !== 'AFTER') return null;
  if (!input.dueDate || Number.isNaN(input.dueDate.getTime())) return null;
  if (input.collected) return null;
  const past = utcDaysPast(input.today, input.dueDate);
  if (past <= 0) return null;
  if (past > 7) return 'ORANGE';
  return 'YELLOW';
}

export function batchCollected(settlement: SettlementLedgerInput, amountFen: number): boolean {
  return isSettlementPaid(settlement, Math.max(0, Number(amountFen) || 0));
}

export function overdueFinding(input: {
  batchId: string;
  caseId: string;
  caseNo: string;
  batchNo?: string | null;
  ttTiming?: string | null;
  dueDate: Date | null;
  today: Date;
  collected: boolean;
  daysAfterArrival: number | null;
  usedN6Fallback: boolean;
}): RiskFinding | null {
  const color = overdueRuleColor(input);
  if (!color || !input.dueDate) return null;
  const past = utcDaysPast(input.today, input.dueDate);
  const baseText = input.usedN6Fallback ? '未填到港日，按本批 N6 过闸日' : '按本批到港日';
  return {
    fingerprint: `OVERDUE_RECEIVABLE|${input.batchId}`,
    type: RiskType.OVERDUE_RECEIVABLE,
    ruleColor: color,
    title: `${input.caseNo} · 逾期应收`,
    subjectLabel: input.caseNo,
    caseId: input.caseId,
    batchId: input.batchId,
    lines: [
      {
        code: `OVERDUE_${color}`,
        text: `批次 ${input.batchNo || '1'} 后 T/T，${baseText} + ${input.daysAfterArrival} 天，到期 ${input.dueDate.toISOString().slice(0, 10)}，已过 ${past} 天且本批未收齐`,
        supplement: '补收本批水单或到账凭证',
      },
    ],
  };
}

/**
 * N7 过闸之后仍缺必传单证，或非 FOB 仍缺原产地证，为黄色。
 * 原产地证是否必传由调用方按运输术语算好（FOB 不必传）。
 * 未过 N7 不报，避免还没到单证节点的合同刷屏。
 */
export function docMissingLines(input: {
  n7Passed: boolean;
  originRequired: boolean;
  presentKinds: string[];
}): RiskLine[] {
  if (!input.n7Passed) return [];
  const present = new Set(input.presentKinds);
  const lines: RiskLine[] = [];
  for (const slot of N7_UPLOADS) {
    const origin = slot.kind === 'N7_ORIGIN_CERT';
    if (origin && !input.originRequired) continue;
    if (present.has(slot.kind)) continue;
    lines.push({
      code: slot.missing,
      text: origin ? '非 FOB 合同缺少原产地证' : `N7 过闸后仍缺${slot.label}`,
      supplement: `补传${slot.label}`,
    });
  }
  return lines;
}

export function docMissingFinding(input: {
  batchId: string;
  caseId: string;
  caseNo: string;
  n7Passed: boolean;
  originRequired: boolean;
  presentKinds: string[];
}): RiskFinding | null {
  const lines = docMissingLines(input);
  if (!lines.length) return null;
  return {
    fingerprint: `DOC_MISSING|${input.batchId}`,
    type: RiskType.DOC_MISSING,
    ruleColor: RiskColor.YELLOW,
    title: `${input.caseNo} · 单证缺失`,
    subjectLabel: input.caseNo,
    caseId: input.caseId,
    batchId: input.batchId,
    lines,
  };
}

/** 规则颜色是否比处置当时更严重。红 > 橙 > 黄 > 灰。只比规则色，不比补件逾期抬上去的展示色。 */
export function isRuleMoreSevere(ruleColor: string, dispositionColor: string): boolean {
  return (COLOR_RANK[ruleColor] ?? 9) < (COLOR_RANK[dispositionColor] ?? 9);
}

export function severityReopenLine(fromColor: string, toColor: string): RiskLine {
  const from = RiskColorLabel[fromColor] || fromColor;
  const to = RiskColorLabel[toColor] || toColor;
  return {
    code: SEVERITY_REOPEN_CODE,
    text: `处置后风险升级：从${from}升到${to}`,
  };
}

/** 黄色补件逾期升橙。橙色保持橙色。红色和其他颜色不变。任何路径都不能自动变成红色。 */
export function escalateDisplayColor(color: string): string {
  if (color === RiskColor.YELLOW) return RiskColor.ORANGE;
  return color;
}

/** 已经升过橙、规则仍是黄色时，展示保持橙色，避免重算把颜色打回去。 */
export function colorForOpen(ruleColor: string, escalatedAt: string | null): string {
  if (escalatedAt && ruleColor === RiskColor.YELLOW) return RiskColor.ORANGE;
  return ruleColor;
}

export function dispositionError(color: string, conclusion: string): string | null {
  const c = String(conclusion || '').trim().toUpperCase();
  if (color === RiskColor.RED) {
    if (c === RiskStatus.REJECTED) return null;
    return '红色风险只能驳回';
  }
  if (c === RiskStatus.CONDITIONAL_RELEASE) {
    if (color === RiskColor.ORANGE || color === RiskColor.YELLOW) return null;
    return '只有橙色和黄色可以有条件放行';
  }
  if (c === RiskStatus.REJECTED || c === RiskStatus.RESOLVED) return null;
  return '不支持的处置结论';
}

export function supplementContents(lines: RiskLine[]): string[] {
  const texts = lines.map((l) => String(l.supplement || '').trim()).filter(Boolean);
  const unique = [...new Set(texts)];
  return unique.length ? unique : ['按风险说明补充材料'];
}

export function defaultSupplementDue(now: Date): Date {
  return addUtcDays(now, 7);
}

export function parseDueDate(raw: string | null | undefined, now: Date): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw || '').trim());
  if (!m) return defaultSupplementDue(now);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return defaultSupplementDue(now);
  return d;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function materialChange(prev: StoredRisk, next: StoredRisk): boolean {
  return (
    prev.type !== next.type ||
    prev.color !== next.color ||
    prev.ruleColor !== next.ruleColor ||
    prev.status !== next.status ||
    prev.title !== next.title ||
    prev.subjectLabel !== next.subjectLabel ||
    (prev.caseId || null) !== (next.caseId || null) ||
    (prev.batchId || null) !== (next.batchId || null) ||
    (prev.customerId || null) !== (next.customerId || null) ||
    (prev.supplierId || null) !== (next.supplierId || null) ||
    prev.lastHitAt !== next.lastHitAt ||
    (prev.escalatedAt || null) !== (next.escalatedAt || null) ||
    (prev.reopenedAt || null) !== (next.reopenedAt || null) ||
    (prev.dispositionSeverity || null) !== (next.dispositionSeverity || null) ||
    !sameJson(prev.lines, next.lines)
  );
}

function carryReopenLine(prevLines: RiskLine[], findingLines: RiskLine[]): RiskLine[] {
  const carried = prevLines.filter((line) => line.code === SEVERITY_REOPEN_CODE);
  const base = findingLines.filter((line) => line.code !== SEVERITY_REOPEN_CODE);
  return carried.length ? [...base, ...carried] : base;
}

/** 已处置记录的规则颜色变得更严重。补件逾期造成的展示色变化不算。 */
function ruleSeverityRose(prev: StoredRisk, finding: RiskFinding): boolean {
  if (!PROTECTED_STATUSES.has(prev.status)) return false;
  const baseline = prev.dispositionSeverity || prev.color;
  if (!baseline) return false;
  return isRuleMoreSevere(finding.ruleColor, baseline);
}

function reopenAfterSeverityRise(prev: StoredRisk, finding: RiskFinding, nowIso: string): StoredRisk {
  const baseline = prev.dispositionSeverity || prev.color;
  const line = severityReopenLine(baseline, finding.ruleColor);
  const lines = finding.lines.filter((item) => item.code !== SEVERITY_REOPEN_CODE);
  lines.push(line);
  return {
    ...prev,
    type: finding.type,
    color: finding.ruleColor,
    ruleColor: finding.ruleColor,
    status: RiskStatus.PENDING,
    title: finding.title,
    subjectLabel: finding.subjectLabel,
    caseId: finding.caseId ?? null,
    batchId: finding.batchId ?? null,
    customerId: finding.customerId ?? null,
    supplierId: finding.supplierId ?? null,
    lines,
    lastHitAt: nowIso,
    escalatedAt: null,
    reopenedAt: nowIso,
    dispositionSeverity: null,
  };
}

function applyOverdueEscalation(
  status: string,
  color: string,
  escalatedAt: string | null,
  overdue: boolean,
  nowIso: string,
): { status: string; color: string; escalatedAt: string | null } {
  if (!overdue || status === RiskStatus.REJECTED || status === RiskStatus.RESOLVED) {
    return { status, color, escalatedAt };
  }
  const before = color;
  const nextColor = escalateDisplayColor(color);
  let nextStatus = status;
  let nextEscalated = escalatedAt;
  if (status === RiskStatus.CONDITIONAL_RELEASE || before === RiskColor.YELLOW) {
    if (status === RiskStatus.CONDITIONAL_RELEASE) nextStatus = RiskStatus.PENDING;
    nextEscalated = nowIso;
  }
  return { status: nextStatus, color: nextColor, escalatedAt: nextEscalated };
}

function fromFinding(prev: StoredRisk, finding: RiskFinding, nowIso: string, overdue: boolean): SyncedRisk {
  if (ruleSeverityRose(prev, finding)) {
    const next = reopenAfterSeverityRise(prev, finding, nowIso);
    return { ...next, op: 'update', reopened: true };
  }
  const protectedTerminal = prev.status === RiskStatus.REJECTED || prev.status === RiskStatus.RESOLVED;
  if (protectedTerminal) {
    const next: StoredRisk = {
      ...prev,
      type: finding.type,
      ruleColor: finding.ruleColor,
      title: finding.title,
      subjectLabel: finding.subjectLabel,
      caseId: finding.caseId ?? null,
      batchId: finding.batchId ?? null,
      customerId: finding.customerId ?? null,
      supplierId: finding.supplierId ?? null,
      lines: finding.lines.filter((line) => line.code !== SEVERITY_REOPEN_CODE),
      lastHitAt: nowIso,
    };
    return { ...next, op: materialChange(prev, next) ? 'update' : 'unchanged' };
  }
  let status = prev.status === RiskStatus.SYSTEM_CLOSED ? RiskStatus.PENDING : prev.status;
  let color = colorForOpen(finding.ruleColor, prev.escalatedAt);
  let escalatedAt = prev.escalatedAt;
  const escalated = applyOverdueEscalation(status, color, escalatedAt, overdue, nowIso);
  status = escalated.status;
  color = escalated.color;
  escalatedAt = escalated.escalatedAt;
  const next: StoredRisk = {
    ...prev,
    type: finding.type,
    color,
    ruleColor: finding.ruleColor,
    status,
    title: finding.title,
    subjectLabel: finding.subjectLabel,
    caseId: finding.caseId ?? null,
    batchId: finding.batchId ?? null,
    customerId: finding.customerId ?? null,
    supplierId: finding.supplierId ?? null,
    lines: carryReopenLine(prev.lines, finding.lines),
    lastHitAt: nowIso,
    escalatedAt,
  };
  return { ...next, op: materialChange(prev, next) ? 'update' : 'unchanged' };
}

/**
 * 按指纹合并发现与已有记录。
 * 规则不再成立且仍是待处置 → 系统关闭。
 * 有条件放行、已驳回、已解决：规则颜色没变或变轻时保持原状态。
 * 规则颜色比处置当时更严重时重新打开为待处置，并排到同色最前。
 * 补件逾期只升黄到橙，不算「处置后风险升级」，也不能自动变红。
 * preserveOnRecalc 的示例提醒（灰色评分下滑）也不关闭。
 */
export function syncRiskState(input: {
  stored: StoredRisk[];
  findings: RiskFinding[];
  now: Date;
  overdueFingerprints: ReadonlySet<string>;
}): SyncedRisk[] {
  const nowIso = input.now.toISOString();
  const byFp = new Map(input.stored.map((row) => [row.fingerprint, row]));
  const seen = new Set<string>();
  const out: SyncedRisk[] = [];

  for (const finding of input.findings) {
    if (seen.has(finding.fingerprint)) continue;
    seen.add(finding.fingerprint);
    const prev = byFp.get(finding.fingerprint);
    if (!prev) {
      out.push({
        fingerprint: finding.fingerprint,
        type: finding.type,
        color: finding.ruleColor,
        ruleColor: finding.ruleColor,
        status: RiskStatus.PENDING,
        title: finding.title,
        subjectLabel: finding.subjectLabel,
        caseId: finding.caseId ?? null,
        batchId: finding.batchId ?? null,
        customerId: finding.customerId ?? null,
        supplierId: finding.supplierId ?? null,
        lines: finding.lines,
        firstSeenAt: nowIso,
        lastHitAt: nowIso,
        escalatedAt: null,
        dispositionSeverity: null,
        reopenedAt: null,
        isSample: false,
        preserveOnRecalc: false,
        op: 'create',
      });
      continue;
    }
    out.push(fromFinding(prev, finding, nowIso, input.overdueFingerprints.has(finding.fingerprint)));
  }

  for (const prev of input.stored) {
    if (seen.has(prev.fingerprint)) continue;
    const overdue = input.overdueFingerprints.has(prev.fingerprint);
    if (prev.status === RiskStatus.CONDITIONAL_RELEASE && overdue) {
      const escalated = applyOverdueEscalation(prev.status, prev.color, prev.escalatedAt, true, nowIso);
      const next: StoredRisk = { ...prev, ...escalated, lastHitAt: nowIso };
      out.push({ ...next, op: materialChange(prev, next) ? 'update' : 'unchanged' });
      continue;
    }
    if (prev.preserveOnRecalc || PROTECTED_STATUSES.has(prev.status)) {
      out.push({ ...prev, op: 'unchanged' });
      continue;
    }
    if (prev.status === RiskStatus.PENDING) {
      const next: StoredRisk = { ...prev, status: RiskStatus.SYSTEM_CLOSED };
      out.push({ ...next, op: 'update' });
      continue;
    }
    out.push({ ...prev, op: 'unchanged' });
  }
  return out;
}

function queueFrontAt(row: { escalatedAt?: string | null; reopenedAt?: string | null }): string | null {
  const stamps = [row.escalatedAt, row.reopenedAt].filter((value): value is string => !!value);
  if (!stamps.length) return null;
  return stamps.reduce((latest, value) => (value > latest ? value : latest));
}

export function compareRiskQueue(
  a: { color: string; escalatedAt?: string | null; reopenedAt?: string | null; firstSeenAt: string },
  b: { color: string; escalatedAt?: string | null; reopenedAt?: string | null; firstSeenAt: string },
): number {
  const c = (COLOR_RANK[a.color] ?? 9) - (COLOR_RANK[b.color] ?? 9);
  if (c) return c;
  const af = queueFrontAt(a);
  const bf = queueFrontAt(b);
  if (!!af !== !!bf) return af ? -1 : 1;
  if (af && bf && af !== bf) return af < bf ? 1 : -1;
  if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt < b.firstSeenAt ? -1 : 1;
  return 0;
}

export type ScreenMatch = {
  listCode: string;
  listedName: string;
  confidence: string;
  matchedName: string;
};

export type ExistingScreenHit = {
  id: string;
  listCode: string;
  listedName: string;
  confidence: string;
  disposition: string;
};

function sameListed(a: { listCode: string; listedName: string }, b: { listCode: string; listedName: string }): boolean {
  return a.listCode === b.listCode && a.listedName.trim().toUpperCase() === b.listedName.trim().toUpperCase();
}

/**
 * 重新筛查只关心新命中和等级变化。同一清单、同一名称、置信度没变，不产生新的筛查记录。
 * 已确认真实的命中不改写。误报排除不视为“仍存在”，再次匹配算新命中。
 */
export function diffScreeningMatches(
  existing: ExistingScreenHit[],
  matches: ScreenMatch[],
): { fresh: ScreenMatch[]; changed: Array<{ hitId: string; match: ScreenMatch }> } {
  const fresh: ScreenMatch[] = [];
  const changed: Array<{ hitId: string; match: ScreenMatch }> = [];
  for (const match of matches) {
    const related = existing.filter((row) => sameListed(row, match));
    const active = related.filter((row) => row.disposition !== 'FALSE_POSITIVE');
    if (!active.length) {
      fresh.push(match);
      continue;
    }
    if (active.some((row) => row.disposition === 'CONFIRMED_TRUE')) continue;
    const open = active.find((row) => SUSPECT_DISPOSITIONS.has(row.disposition));
    if (!open) continue;
    if (open.confidence !== match.confidence) changed.push({ hitId: open.id, match });
  }
  return { fresh, changed };
}
